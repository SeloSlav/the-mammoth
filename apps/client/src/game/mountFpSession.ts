import * as THREE from "three";
import { and, or } from "spacetimedb";
import type { DbConnection, SubscriptionHandle } from "../module_bindings";
import { tables } from "../module_bindings";
import type { PlayerPose } from "../module_bindings/types";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
  createFPRig,
  createFpLocomotionState,
  equippedHeldItemIdFromDefId,
  fpLocomotionConstants,
  queueFpJump,
  stepFpLocomotion,
  PlayerPresentationManager,
  type FpLocomotionInput,
  type FpLocomotionWalkOptions,
} from "@the-mammoth/engine";
import type { ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import { maxBuildingLevelIndex, parseFloorDoc } from "@the-mammoth/world";
import { fpBuildingExteriorViewShouldRevealFullStack } from "./fpBuildingFloorPlateVisibilityBand.js";
import { createFpSessionStaticWorld } from "./fpSessionWorldMount";
import { feedRemotePoseSample, type FpRemotePoseLastXZ } from "./fpSessionRemotePoseFeed";
import { floorPayloadByDocId } from "./fpSessionContentLoad";
import { encodeMoveIntentBits } from "./moveIntentCodec";
import { PoseInterpBuffer } from "./poseInterpBuffer";
import { replicatedPlayerSnapshotFromPlainPose } from "@the-mammoth/net";
import { buildLocalPlayerGameplayState } from "./localPlayerGameplay";
import { effectiveDevGameplayEquippedPrimary } from "./devGameplayWeaponOverride";
import {
  fpHotbarDigitKeySuppressedByDebounce,
  HOTBAR_SLOT_COUNT,
  hotbarSlotHasInstantConsume,
} from "./fpHotbarActivate";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "./fpHotbarSelection";
import { getHotbarSlotInventoryItem } from "./fpHotbarResolve";
import { attachFpSessionEnvironment } from "./fpSessionEnvironment";
import {
  onFpSessionPostRenderFrame,
  resetFpSessionFpsDisplay,
} from "./fpSessionFpsDisplay";
import { createFpSessionPerfDebugPostRenderHook } from "./fpSessionPerfDebug";
import { mountFpElevatorWorld } from "./fpElevatorWorld.js";
import { mountFpViewmodelAuthoringDevOnly } from "./fpViewmodelAuthoringOverlay.js";
import { mountWeaponPresentationDevHotReload } from "./weaponPresentationDevHotReload.js";
import { mountWorldContentDevReload } from "./fpWorldContentDevReload.js";
import {
  getMammothHotbarInstantConsumeDefIds,
  getMammothItemDef,
} from "../inventory/mammothItemCatalog";
import { LocalGameAudio } from "./localGameAudio";
import {
  primeHotbarConsumeAudio,
  registerHotbarConsumeLocalPlayback,
  registerHotbarConsumePrimeAudio,
  unregisterHotbarConsumeLocalAudio,
} from "./hotbarConsumeLocalAudio";
import { runFpHotbarInstantConsume } from "./fpHotbarConsume";
import {
  findNearestDroppedPickup,
  MAMMOTH_PICKUP_RADIUS_M,
  mountDroppedItemsWorld,
} from "./droppedItemWorldRuntime";
import { setFpPickupPrompt } from "./fpPickupPrompt";
import { WorldProximityAudio } from "./worldProximityAudio";
import { ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS } from "./fpElevatorConstants.js";
import { poseSeqAsBigint } from "./fpSessionPoseSeq";
import {
  FP_PLAYER_COLLISION_HEIGHT_CROUCH_M,
  FP_PLAYER_COLLISION_HEIGHT_STAND_M,
  FP_PLAYER_COLLISION_RADIUS_M,
  resolvePlayerCollisions,
} from "./fpPlayerCollision.js";
import {
  clampAttachedBodyXZToKinematicSupportIfNeeded,
  getKinematicSupportVerticalVelocityMps,
  mergeKinematicSupportTop,
  snapAttachedFeetToKinematicSupportIfNeeded,
  type FpKinematicSupportProvider,
  type FpKinematicSupportSampleOpts,
} from "./fpKinematicSupport.js";
import { resolveAuthoritativeInteractionPose } from "./fpInteractionAuthority";
import { pushFpPerfFrame, resetFpPerfStore } from "./fpSessionPerfStore";
import { FpHotbarConsumableVisual } from "./fpHotbarConsumableVisual";

/**
 * Intent publish cadence — keep near `apps/server/src/movement.rs` physics schedule
 * (`TimeDuration::from_micros(50_000)` ≈ 20 Hz) so prediction and authority stay aligned.
 */
const NET_INTERVAL_MS = 50;
const NET_DT_SEC = NET_INTERVAL_MS * 0.001;

/** Horizontal half-extent (m) of the replicated `player_pose` box (XZ). */
const POSE_AOI_HALF = 42;
/** Slightly wider than pose AOI so swing/foot events at the edge are still subscribed. */
const WORLD_SOUND_AOI_HALF = POSE_AOI_HALF + 8;
/** Recentre AOI when predicted position moves this far from the last subscription anchor (m). */
const POSE_AOI_RECENTER = 14;
const MOUSE_SENS = 0.0022;
/** ~88° — enough to scan hoistway tops without going full flip. */
const PITCH_LIMIT = 1.53;
/** Alt free-look: head yaw relative to body (radians, clamped per side; ~±135°, not full 180°). */
const FREE_LOOK_YAW_MAX = 2.35;
/** Extra camera bob on top of eye-height bob from `stepFpLocomotion` (meters, local space). */
const CAM_BOB_DIP_Y = 0.004;

const MELEE_COOLDOWN_MS = 480;

/**
 * First-person session: mammoth `BuildingDoc` floor stack + slim cell, SpaceTimeDB `player_pose` sync,
 * capsule proxies for other players (interpolation buffer on remotes).
 *
 * **Local player:** client prediction drives immediate feel, but the server remains authoritative.
 * We spawn from the replicated `player_pose`, simulate locally between ticks, then continuously
 * reconcile back toward the server so interact volumes / elevators / reconnect state stay honest.
 */
export async function mountFpSession(
  canvas: HTMLCanvasElement,
  conn: DbConnection,
): Promise<() => void> {
  await assertWebGpuAdapterOrThrow();
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: false });
  await renderer.init();
  assertWebGpuRendererBackend(renderer);
  resetFpSessionFpsDisplay();
  const logFpPerf = createFpSessionPerfDebugPostRenderHook(renderer);
  const disposeFpEnvironment = attachFpSessionEnvironment(scene, renderer);

  const { rig: playerRig, headPivot, headPitch, headCameraPitch, headFreeLook, camera } =
    createFPRig(fpLocomotionConstants.eyeStand);
  scene.add(playerRig);

  const {
    building,
    buildingRoot,
    cellRoot,
    staticCollisionIndex,
    sampleWalkTopBase,
  } = createFpSessionStaticWorld();
  scene.add(buildingRoot);
  buildingRoot.updateMatrixWorld(true);
  const buildingWorldBounds = new THREE.Box3().setFromObject(buildingRoot);
  const maxBuildingLevel = maxBuildingLevelIndex(building);

  const fpElevators = mountFpElevatorWorld({
    conn,
    buildingRoot,
    building,
    getFloorDoc: (id) => parseFloorDoc(floorPayloadByDocId(id)),
  });

  scene.add(cellRoot);

  const selectedHotbarRow = () => {
    const slot = getFpHotbarSelectedSlot();
    return conn.identity && slot !== null
      ? getHotbarSlotInventoryItem(conn, conn.identity, slot)
      : undefined;
  };
  const initialHeld = conn.identity
    ? effectiveDevGameplayEquippedPrimary(
        equippedHeldItemIdFromDefId(selectedHotbarRow()?.defId ?? "unarmed"),
      )
    : ("unarmed" as const);

  const presentation = await PlayerPresentationManager.create({
    scene,
    fpViewModelParent: headPitch,
    initialEquippedPrimary: initialHeld,
    onMeleeVisual: (evt) => {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3();
      camera.getWorldPosition(origin);
      void evt;
      void origin;
      void dir;
      // TODO: hand off to gameplay hit-scan / server validation — placeholder trace only.
    },
  });

  const fpAuthoringActiveRef = { active: false };
  const disposeFpAuthoring = mountFpViewmodelAuthoringDevOnly({
    scene,
    camera,
    canvas,
    presentation,
    activeRef: fpAuthoringActiveRef,
  });

  const disposeWeaponPresentationHotReload = mountWeaponPresentationDevHotReload(presentation);
  const disposeWorldContentHotReload = mountWorldContentDevReload(() => {
    window.location.reload();
  });
  const hotbarConsumableVisual = new FpHotbarConsumableVisual();
  await hotbarConsumableVisual.preload(getMammothHotbarInstantConsumeDefIds());

  /** Must match `apps/server/src/loadout.rs` `ACTIVE_HOTBAR_SLOT_CLEARED`. */
  const ACTIVE_HOTBAR_SLOT_CLEARED = 255;
  let lastSentHotbarRail: number | null | undefined = undefined;
  const syncActiveHotbarSlotToServer = () => {
    if (!conn.identity) return;
    const slot = getFpHotbarSelectedSlot();
    if (slot === lastSentHotbarRail) return;
    lastSentHotbarRail = slot;
    const slotIndex = slot === null ? ACTIVE_HOTBAR_SLOT_CLEARED : slot;
    try {
      void conn.reducers.setActiveHotbarSlot({ slotIndex });
    } catch (err) {
      console.warn("[mountFpSession] setActiveHotbarSlot failed", err);
    }
  };
  const unsubHotbarRail = subscribeFpHotbarSelection(syncActiveHotbarSlotToServer);

  const interp = new PoseInterpBuffer();
  const lastRemote = new Map<string, FpRemotePoseLastXZ>();

  /** Lobby hub (ground floor): near elevators + stairs at z=0 (`floor_mamutica_ground`). */
  const pos = new THREE.Vector3(0, 1.35, 0);
  const _floorVisCamWorld = new THREE.Vector3();
  const _floorVisCamDir = new THREE.Vector3();
  const _interactionPos = new THREE.Vector3();
  const prevPos = new THREE.Vector3();

  /** Pooled audio movement snapshot — mutated each frame, no object literal per frame. */
  const _audioMovement = {
    horizontalSpeed: 0,
    stridePhaseRad: 0,
    grounded: true,
    crouch: false,
    sprint: false,
    freeLook: false,
  };

  /**
   * Smooth display offset — applied to `playerRig.position` on top of the physics `pos`.
   *
   * When the server-authoritative reconcile corrects `pos`, we subtract the same correction
   * from `_displayOffset` so the rendered position doesn't jump.  Each frame we decay
   * `_displayOffset` toward zero, making corrections invisible to the player.  This is the
   * same "prediction error smoothing" used by Valve Source Engine / CS:GO.
   *
   * Only the render position is offset — `pos` stays accurate so collision checks and
   * interaction queries always use the physics-correct position.
   */
  const _displayOffset = new THREE.Vector3();
  /** Exponential damp constant for display offset — ~80 ms to close half the gap. */
  const DISPLAY_OFFSET_DAMP = 12;
  /** Beyond this distance corrections hard-snap (teleport, cheat detection, etc.). */
  const DISPLAY_HARD_SNAP_M = 3.0;

  const getInteractionPos = () => {
    const p = resolveAuthoritativeInteractionPose(pos, serverPose);
    _interactionPos.set(p.x, p.y, p.z);
    return _interactionPos;
  };

  // Cache the last visibility band so we skip the O(buildingChildren) loop when unchanged.
  let _lastBandLo = -999;
  let _lastBandHi = -999;

  const syncBuildingFloorPlateVisibility = (nowMs: number) => {
    camera.getWorldPosition(_floorVisCamWorld);
    camera.getWorldDirection(_floorVisCamDir);
    let band = fpElevators.getFloorVisibilityBand(
      pos.x,
      pos.y,
      pos.z,
      nowMs,
      _floorVisCamWorld.y,
      _floorVisCamDir.y,
    );
    if (
      fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: _floorVisCamWorld.x,
        cameraZ: _floorVisCamWorld.z,
        viewDirX: _floorVisCamDir.x,
        viewDirZ: _floorVisCamDir.z,
        boundsMinX: buildingWorldBounds.min.x,
        boundsMaxX: buildingWorldBounds.max.x,
        boundsMinZ: buildingWorldBounds.min.z,
        boundsMaxZ: buildingWorldBounds.max.z,
      })
    ) {
      band = { lo: 1, hi: maxBuildingLevel };
    }
    if (band.lo === _lastBandLo && band.hi === _lastBandHi) return;
    _lastBandLo = band.lo;
    _lastBandHi = band.hi;
    for (const ch of buildingRoot.children) {
      if (ch.userData.mammothAlwaysVisible === true) {
        ch.visible = true;
        continue;
      }
      const li = ch.userData.mammothPlateLevelIndex;
      if (typeof li === "number") {
        ch.visible = li >= band.lo && li <= band.hi;
      }
    }
  };
  /** Feet / capsule yaw — sent as `aimYaw` to the server and used for locomotion. */
  let bodyYaw = 0;
  /** Mouse look pitch (head pivot X). */
  let pitch = 0;
  /** Alt free-look yaw on `headFreeLook` only (radians); cleared on Alt release (body yaw unchanged). */
  let headLookYaw = 0;
  /** Monotonic intent id; server rejects non-increasing `intent_seq`. */
  let intentSeq = 0n;
  type PendingMoveIntent = {
    seq: bigint;
    bits: number;
    aimYaw: number;
  };
  const pendingMoveIntents: PendingMoveIntent[] = [];
  /** Head index into `pendingMoveIntents` — acked entries are skipped without shifting the array. */
  let intentsHead = 0;
  /** Max un-acked intents to retain (1.5 s buffer); older ones are compacted away. */
  const MAX_PENDING_INTENTS = 30;
  let lastNet = 0;

  const keys = new Set<string>();
  let crouchToggle = false;
  const loco = createFpLocomotionState();

  // ---------------------------------------------------------------------------
  // Object pools — pre-allocated once, mutated in place every frame/tick.
  // Eliminates the GC pressure that causes frame-time spikes near busy geometry.
  // ---------------------------------------------------------------------------

  /** Reused inside every sampleWalkTopForVelocityY call (called ~2× per substep). */
  const _walkSupportEval: FpKinematicSupportSampleOpts = {
    worldX: 0,
    worldZ: 0,
    probeTopY: 0,
    footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
    stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    baseTop: 0,
  };

  /** Reused for the single kinematic-velocity query inside simulatePredictedPlayerStep. */
  const _elevSupportEval: FpKinematicSupportSampleOpts = {
    worldX: 0,
    worldZ: 0,
    probeTopY: 0,
    footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
    stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    baseTop: 0,
  };

  /** Pre-allocated input state — mutated in the main tick loop (no object literal per frame). */
  const _input: FpLocomotionInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
  };

  /** Pre-allocated input for reconcile replay (avoid allocating inside the replay loop). */
  const _replayInput: FpLocomotionInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
  };

  /** Pre-allocated remote snapshot map — cleared each frame instead of constructed anew. */
  const _remoteSnapshots = new Map<string, ReplicatedPlayerSnapshot>();

  /** Reconcile replay pools — reset in place on every server update (20 Hz); avoid 3× Vec3. */
  const _replayPos = new THREE.Vector3();
  const _replayPrevPos = new THREE.Vector3();
  const _replayLoco = createFpLocomotionState();

  /**
   * Live locomotion state reference set immediately before each `stepFpLocomotion` call.
   * `_walkOpts.sampleWalkGroundTopY` reads `.velocity.y` through this reference so that
   * gravity-modified velocity is visible to the sampler at each substep (same as the old
   * per-call closure that captured `opts.locoState`).
   */
  let _stepLocoStateRef: ReturnType<typeof createFpLocomotionState> | null = null;

  /**
   * While rising from a real jump, skip elevator cab walk merge — otherwise `mergeWalkTop` keeps the
   * cab as the highest support and locomotion snaps feet back to the floor every substep.
   * Must stay **well above** upward velocity from a rising cab (~3 m/s) or merge drops for whole frames.
   */
  const ELEVATOR_WALK_MERGE_SKIP_VY = 2.0;
  const sampleWalkTopForVelocityY = (
    velocityY: number,
    worldX: number,
    worldZ: number,
    probeTopY: number,
    evalWallClockMs?: number,
  ) => {
    const base = sampleWalkTopBase(worldX, worldZ, probeTopY);
    if (velocityY > ELEVATOR_WALK_MERGE_SKIP_VY) {
      return base;
    }
    // Mutate pooled opts — no allocation inside substep hot-path.
    _walkSupportEval.worldX = worldX;
    _walkSupportEval.worldZ = worldZ;
    _walkSupportEval.probeTopY = probeTopY;
    _walkSupportEval.baseTop = base;
    _walkSupportEval.evalWallClockMs = evalWallClockMs;
    return mergeKinematicSupportTop(fpElevators.kinematicSupport, _walkSupportEval);
  };
  const sampleWalkTop = (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    evalWallClockMs?: number,
  ) => sampleWalkTopForVelocityY(loco.velocity.y, worldX, worldZ, probeTopY, evalWallClockMs);

  /**
   * Pre-allocated walk options passed to `stepFpLocomotion` — avoids creating a new object +
   * closure on every call.  `sampleWalkGroundTopY` reads `_stepLocoStateRef!.velocity.y` live
   * (the reference is set before each `stepFpLocomotion` call) so gravity-modified velocity
   * is visible at every substep, identical to the old per-call closure.
   */
  const _walkOpts: FpLocomotionWalkOptions = {
    sampleWalkGroundTopY: (worldX, worldZ, probeTopY, evalWallClockMs) =>
      sampleWalkTopForVelocityY(
        _stepLocoStateRef!.velocity.y,
        worldX,
        worldZ,
        probeTopY,
        evalWallClockMs,
      ),
    probeDy: fpLocomotionConstants.walkProbeDy,
    maxSupportDropM: fpLocomotionConstants.walkMaxSupportDropM,
    jumpKinematicPlatformVyMps: 0,
    integrationEvalEndWallClockMs: undefined,
  };

  /**
   * Pre-allocated step-opts for the main tick loop — only scalar fields change each frame.
   * Reference fields (pos, prevPos, locoState, input, kinematicSupport) are stable throughout
   * the session, so we set them once here and mutate only the primitives before each call.
   */
  const _mainStepOpts = {
    pos,
    prevPos,
    locoState: loco,
    input: _input,
    dtSec: 0,
    evalWallClockMs: 0,
    crouch: false,
    jumpPressedThisFrame: false,
    bodyYawRad: 0,
    kinematicSupport: fpElevators.kinematicSupport,
  };

  /**
   * Pre-allocated step-opts for the reconcile replay loop — same idea but points to the replay
   * pool objects (_replayPos, _replayPrevPos, _replayLoco, _replayInput).
   */
  const _replayStepOpts = {
    pos: _replayPos,
    prevPos: _replayPrevPos,
    locoState: _replayLoco,
    input: _replayInput,
    dtSec: NET_DT_SEC,
    evalWallClockMs: 0,
    crouch: false,
    jumpPressedThisFrame: false,
    bodyYawRad: 0,
    kinematicSupport: fpElevators.kinematicSupport,
  };

  /** Footsteps: Web Audio, up to six `public/audio/ui/footstep*.wav`; see `localGameAudio.ts`. */
  const localAudio = new LocalGameAudio();
  registerHotbarConsumePrimeAudio(() => localAudio.unlock());
  registerHotbarConsumeLocalPlayback((profile) => localAudio.playHotbarConsumeLocal(profile));
  const worldAudio = new WorldProximityAudio(conn, () => camera);
  let worldAudioReady = false;

  const refreshWorldSoundSubscription = () => {
    if (!worldAudioReady) return;
    worldAudio.subscribeAoi(poseAoiAnchorX, poseAoiAnchorZ, WORLD_SOUND_AOI_HALF);
  };

  /**
   * Browsers often skip `keyup` when the tab/window loses focus — keys (including Alt) stay in
   * `keys`, so free-look stays latched and mouse X only drives `headLookYaw` until Alt “releases”.
   *
   * Before clearing keys, **bake** `headLookYaw` into `bodyYaw` so the horizontal view direction
   * (body + free-look) does not jump when we drop Alt from `keys` or zero out free-look. Intentional
   * Alt key-up still clears head offset without merging — see `onKeyUp`.
   */
  const commitFreeLookIntoBodyYaw = () => {
    if (headLookYaw !== 0) {
      bodyYaw += headLookYaw;
      headLookYaw = 0;
      bodyYaw = Math.atan2(Math.sin(bodyYaw), Math.cos(bodyYaw));
    }
  };

  /** Window hidden / defocused: browsers may omit `keyup` — drop all latched keys. */
  const resetTransientInputState = () => {
    commitFreeLookIntoBodyYaw();
    keys.clear();
  };

  const onWindowBlur = () => {
    resetTransientInputState();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      resetTransientInputState();
    }
  };

  /**
   * Pointer lock ends while the document can still be focused (Tab inventory, Esc, etc.).
   * Do **not** clear `keys` here — that would cancel held WASD until keys are pressed again.
   * Still fold Alt free-look into body yaw so view direction stays consistent when mouse stops.
   */
  const onPointerLockChange = () => {
    if (document.pointerLockElement !== canvas) {
      commitFreeLookIntoBodyYaw();
    }
  };

  /** Latest authoritative self pose from `player_pose`. */
  const serverPose = { x: 0, y: 1.35, z: 0, grounded: true, velX: 0, velY: 0, velZ: 0 };
  let spawnSynced = false;

  const simulatePredictedPlayerStep = (opts: {
    pos: THREE.Vector3;
    prevPos: THREE.Vector3;
    locoState: ReturnType<typeof createFpLocomotionState>;
    input: FpLocomotionInput;
    dtSec: number;
    evalWallClockMs: number;
    crouch: boolean;
    jumpPressedThisFrame: boolean;
    bodyYawRad: number;
    kinematicSupport: FpKinematicSupportProvider;
  }): number => {
    opts.prevPos.copy(opts.pos);
    const probeTopForElev = opts.pos.y + fpLocomotionConstants.walkProbeDy;
    const baseForElev = sampleWalkTopBase(opts.pos.x, opts.pos.z, probeTopForElev);
    // Mutate pooled opts — no allocation here.
    _elevSupportEval.worldX = opts.pos.x;
    _elevSupportEval.worldZ = opts.pos.z;
    _elevSupportEval.probeTopY = probeTopForElev;
    _elevSupportEval.baseTop = baseForElev;
    _elevSupportEval.evalWallClockMs = opts.evalWallClockMs;
    const elevatorJumpVy =
      !opts.locoState.grounded || opts.locoState.velocity.y > ELEVATOR_WALK_MERGE_SKIP_VY
        ? 0
        : getKinematicSupportVerticalVelocityMps(opts.kinematicSupport, _elevSupportEval);

    // Wire live locoState reference so the walk sampler reads velocity.y correctly per substep.
    _stepLocoStateRef = opts.locoState;
    _walkOpts.jumpKinematicPlatformVyMps = elevatorJumpVy;
    _walkOpts.integrationEvalEndWallClockMs = opts.evalWallClockMs;
    const headY = stepFpLocomotion(
      opts.locoState,
      opts.pos,
      opts.bodyYawRad,
      opts.input,
      opts.dtSec,
      _walkOpts,
    );
    _stepLocoStateRef = null;

    // Snap feet onto kinematic support (elevator cab floor) BEFORE horizontal
    // collision so the query pose fed into dynamic AABB collection has the
    // correct feet Y.  Without this, the "is rider inside moving cab" test
    // sees the pre-snap locomotion Y which can be off by the cab's vertical
    // velocity × dt, causing generated landing blockers to fire and push the
    // rider sideways mid-ride.
    snapAttachedFeetToKinematicSupportIfNeeded(opts.kinematicSupport, opts.pos, opts.locoState, {
      evalWallClockMs: opts.evalWallClockMs,
      jumpPressedThisFrame: opts.jumpPressedThisFrame,
      skipAttachUpwardVyMps: ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS,
    });

    resolvePlayerCollisions(
      opts.pos,
      opts.prevPos,
      opts.locoState.velocity,
      opts.crouch,
      fpLocomotionConstants.walkStepUpMargin,
      staticCollisionIndex,
      {
        visitAabbsInXZ: (x0, x1, z0, z1, visit, queryPose) =>
          fpElevators.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose),
      },
    );

    const bodyH = opts.crouch
      ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M
      : FP_PLAYER_COLLISION_HEIGHT_STAND_M;
    if (
      fpElevators.applyCabRoofFeetSnap(
        opts.pos,
        { y: opts.prevPos.y },
        bodyH,
        FP_PLAYER_COLLISION_RADIUS_M,
      )
    ) {
      opts.locoState.velocity.y = 0;
      opts.locoState.grounded = true;
    }

    clampAttachedBodyXZToKinematicSupportIfNeeded(
      opts.kinematicSupport,
      opts.pos,
      opts.locoState,
      opts.evalWallClockMs,
    );

    return headY;
  };

  /**
   * Mutates `bits` into `out` without allocating a new FpLocomotionInput object.
   * Used inside the reconcile replay loop to avoid per-step allocations.
   */
  const inputFromBitsInto = (bits: number, out: FpLocomotionInput): void => {
    out.forward = (bits & 1) !== 0;
    out.backward = (bits & 2) !== 0;
    out.left = (bits & 4) !== 0;
    out.right = (bits & 8) !== 0;
    out.sprint = (bits & 32) !== 0;
    out.crouch = (bits & 64) !== 0;
  };

  const reconcileLocalPredictionToServer = (serverRow: PlayerPose) => {
    const serverSeq = poseSeqAsBigint(serverRow.seq);

    // Advance head past acknowledged intents — O(1) per step, no array copies.
    while (
      intentsHead < pendingMoveIntents.length &&
      pendingMoveIntents[intentsHead]!.seq <= serverSeq
    ) {
      intentsHead++;
    }
    // Compact: splice only when the dead prefix is large enough to matter.
    if (intentsHead >= pendingMoveIntents.length) {
      pendingMoveIntents.length = 0;
      intentsHead = 0;
    } else if (intentsHead >= 16) {
      pendingMoveIntents.splice(0, intentsHead);
      intentsHead = 0;
    }

    const pendingCount = pendingMoveIntents.length - intentsHead;
    if (pendingCount === 0) return;

    // Early-exit: if the server confirms we're already at the predicted position, no
    // physics replay is needed.  On localhost (< 1 ms RTT) this is almost always true.
    if (
      Math.abs(serverRow.x - pos.x) < 0.006 &&
      Math.abs(serverRow.y - pos.y) < 0.006 &&
      Math.abs(serverRow.z - pos.z) < 0.006
    ) {
      return;
    }

    // Reset pooled replay state — no Vec3 / LocoState allocation.
    // Only physics state is initialised from the server row; visual state (headBobPhase,
    // eyeSmoothed) is intentionally left at whatever the replay pool currently holds.
    // We will NOT copy those back — see below.
    _replayPos.set(serverRow.x, serverRow.y, serverRow.z);
    _replayPrevPos.copy(_replayPos);
    _replayLoco.velocity.set(serverRow.velX, serverRow.velY, serverRow.velZ);
    _replayLoco.grounded = serverRow.grounded !== 0;
    _replayLoco.jumpQueued = false;

    const replayStartMs = performance.now();
    for (let i = intentsHead; i < pendingMoveIntents.length; i++) {
      const sample = pendingMoveIntents[i]!;
      const stepNowMs = replayStartMs + (i - intentsHead) * NET_INTERVAL_MS;
      fpElevators.syncCabEvalClock(stepNowMs);
      inputFromBitsInto(sample.bits, _replayInput);
      _replayStepOpts.evalWallClockMs = stepNowMs;
      _replayStepOpts.crouch = (sample.bits & 64) !== 0;
      _replayStepOpts.jumpPressedThisFrame = (sample.bits & 16) !== 0;
      _replayStepOpts.bodyYawRad = sample.aimYaw;
      simulatePredictedPlayerStep(_replayStepOpts);
    }
    const corrX = _replayPos.x - pos.x;
    const corrY = _replayPos.y - pos.y;
    const corrZ = _replayPos.z - pos.z;
    const corrDist = Math.hypot(corrX, corrY, corrZ);

    if (corrDist > DISPLAY_HARD_SNAP_M) {
      // Large discrepancy (teleport / anti-cheat correction): hard snap everything.
      pos.copy(_replayPos);
      _displayOffset.set(0, 0, 0);
    } else if (corrDist > 0.001) {
      // Small correction: immediately fix physics position but let the visual catch up smoothly.
      // The player never sees a snap — the render position is pos + _displayOffset, and the
      // offset decays to zero every frame.
      pos.copy(_replayPos);
      _displayOffset.x -= corrX;
      _displayOffset.y -= corrY;
      _displayOffset.z -= corrZ;
    }
    // Correct physics state only.  Visual-only fields (headBobPhase, eyeSmoothed) are
    // deliberately NOT overwritten: they belong exclusively to the main-loop timeline and must
    // never be disturbed by the 20 Hz reconcile.  Touching them was the root cause of:
    //   • audio hitching  (footstep strideCell jumping forward, firing spurious steps at 20 Hz)
    //   • hand-animation resets  (viewmodel bob phase discontinuously jumping)
    //   • perceived "rubber-band" stutter  (now handled by _displayOffset smooth correction)
    loco.velocity.copy(_replayLoco.velocity);
    loco.grounded = _replayLoco.grounded;
  };

  let meleeAttackSeq = 0;
  let lastMeleeMs = 0;

  const ingestPose = (row: PlayerPose) => {
    const id = row.identity.toHexString();
    const self = conn.identity?.isEqual(row.identity) ?? false;
    if (self) {
      serverPose.x = row.x;
      serverPose.y = row.y;
      serverPose.z = row.z;
      serverPose.grounded = row.grounded !== 0;
      serverPose.velX = row.velX;
      serverPose.velY = row.velY;
      serverPose.velZ = row.velZ;
      if (!spawnSynced) {
        pos.set(row.x, row.y, row.z);
        bodyYaw = row.yaw;
        _displayOffset.set(0, 0, 0);
        spawnSynced = true;
      } else {
        reconcileLocalPredictionToServer(row);
      }
      const serverSeq = poseSeqAsBigint(row.seq);
      if (serverSeq > intentSeq) intentSeq = serverSeq;
      return;
    }
    feedRemotePoseSample(interp, id, row, lastRemote);
  };

  const syncAllPoses = () => {
    for (const row of conn.db.player_pose) {
      ingestPose(row as PlayerPose);
    }
  };

  const onPoseInsert = (_ctx: unknown, row: PlayerPose) => {
    ingestPose(row);
  };
  const onPoseUpdate = (_ctx: unknown, _old: PlayerPose, row: PlayerPose) => {
    ingestPose(row);
  };

  conn.db.player_pose.onInsert(onPoseInsert);
  conn.db.player_pose.onUpdate(onPoseUpdate);

  const droppedWorld = mountDroppedItemsWorld(scene, conn, POSE_AOI_HALF, {
    onPickupRemoved: async () => {
      await localAudio.unlock();
      localAudio.playItemPickLocal();
    },
  });

  let poseAoiSub: SubscriptionHandle | null = null;
  let poseAoiAnchorX = pos.x;
  let poseAoiAnchorZ = pos.z;

  const subscribePoseAoi = (cx: number, cz: number) => {
    const selfId = conn.identity;
    if (!selfId) return;
    if (poseAoiSub?.isActive()) {
      poseAoiSub.unsubscribe();
    }
    const x0 = cx - POSE_AOI_HALF;
    const x1 = cx + POSE_AOI_HALF;
    const z0 = cz - POSE_AOI_HALF;
    const z1 = cz + POSE_AOI_HALF;
    const query = tables.player_pose.where((r) =>
      or(
        r.identity.eq(selfId),
        and(r.x.gte(x0), r.x.lte(x1), r.z.gte(z0), r.z.lte(z1)),
      ),
    );
    poseAoiSub = conn
      .subscriptionBuilder()
      .onApplied(() => {
        syncAllPoses();
      })
      .subscribe(query);
    poseAoiAnchorX = cx;
    poseAoiAnchorZ = cz;
    refreshWorldSoundSubscription();
    droppedWorld.subscribeAoi(cx, cz);
  };

  subscribePoseAoi(poseAoiAnchorX, poseAoiAnchorZ);

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(canvas);

  const sendMoveIntent = (input: FpLocomotionInput, jump: boolean) => {
    if (!conn.identity) return;
    intentSeq += 1n;
    const bits = encodeMoveIntentBits(input, jump);
    pendingMoveIntents.push({ seq: intentSeq, bits, aimYaw: bodyYaw });
    // Guard against runaway growth if the server stops acking (e.g. network drop).
    if (pendingMoveIntents.length - intentsHead > MAX_PENDING_INTENTS) {
      // Drop the oldest un-acked intents; replay will still be correct from the retained window.
      const excess = pendingMoveIntents.length - intentsHead - MAX_PENDING_INTENTS;
      intentsHead += excess;
    }
    void conn.reducers.submitMoveIntent({ intentSeq, bits, aimYaw: bodyYaw });
  };

  const mammothInventoryOpen = () =>
    document.querySelector('[data-mammoth-inventory="open"]') !== null;

  /** Same `DigitN` / slot within debounce window — ignored unless instant-consume or same-slot unequip. */
  const digitKeyDebounce = { code: "", at: 0, slot: -1 };

  const onWheelHotbar = (e: WheelEvent) => {
    if (mammothInventoryOpen() || isTextInputFocused()) return;
    if (document.pointerLockElement !== canvas) return;
    if (e.deltaY === 0) return;
    const target = e.target;
    if (target instanceof Element && target.closest("[data-mammoth-no-hotbar-wheel='true']")) {
      return;
    }
    e.preventDefault();
    const prev = getFpHotbarSelectedSlot();
    const cur = prev === null ? 0 : prev;
    const next =
      e.deltaY < 0
        ? (cur - 1 + HOTBAR_SLOT_COUNT) % HOTBAR_SLOT_COUNT
        : (cur + 1) % HOTBAR_SLOT_COUNT;
    setFpHotbarSelectedSlot(next);
  };

  const isTextInputFocused = () => {
    const el = document.activeElement;
    if (!el || !(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      e.preventDefault();
    }
    if (!isTextInputFocused() && !mammothInventoryOpen()) {
      let n = -1;
      if (e.code.startsWith("Digit")) {
        n = Number.parseInt(e.code.slice(5), 10);
      } else if (e.code.startsWith("Numpad") && e.code.length === 7) {
        n = Number.parseInt(e.code.slice(6), 10);
      }
      if (n >= 1 && n <= HOTBAR_SLOT_COUNT) {
        e.preventDefault();
        if (e.repeat) return;
        const newSlot = n - 1;
        const keyCode = e.code;
        const now = performance.now();
        if (!conn.identity) {
          const prev = getFpHotbarSelectedSlot();
          if (
            fpHotbarDigitKeySuppressedByDebounce({
              prevSel: prev,
              newSlot,
              willConsume: false,
              keyCode,
              lastCode: digitKeyDebounce.code,
              lastSlot: digitKeyDebounce.slot,
              lastAtMs: digitKeyDebounce.at,
              nowMs: now,
            })
          ) {
            return;
          }
          digitKeyDebounce.code = keyCode;
          digitKeyDebounce.at = now;
          digitKeyDebounce.slot = newSlot;
          setFpHotbarSelectedSlot(prev === newSlot ? null : newSlot);
          return;
        }
        const prevSel = getFpHotbarSelectedSlot();
        const willConsume =
          prevSel === newSlot && hotbarSlotHasInstantConsume(conn, conn.identity, newSlot);

        if (
          fpHotbarDigitKeySuppressedByDebounce({
            prevSel,
            newSlot,
            willConsume,
            keyCode,
            lastCode: digitKeyDebounce.code,
            lastSlot: digitKeyDebounce.slot,
            lastAtMs: digitKeyDebounce.at,
            nowMs: now,
          })
        ) {
          return;
        }

        digitKeyDebounce.code = keyCode;
        digitKeyDebounce.at = now;
        digitKeyDebounce.slot = newSlot;

        if (willConsume) {
          void runFpHotbarInstantConsume(
            conn,
            conn.identity,
            newSlot,
            primeHotbarConsumeAudio,
            "mountFpSession",
          );
          return;
        }
        setFpHotbarSelectedSlot(prevSel === newSlot ? null : newSlot);
      }
    }
    if (e.code === "Escape") void document.exitPointerLock();
    if (
      e.code === "KeyE" &&
      !e.repeat &&
      !mammothInventoryOpen() &&
      !isTextInputFocused()
    ) {
      e.preventDefault();
      const interactionPos = getInteractionPos();
      if (fpElevators.consumeInteractKey(interactionPos, camera)) return;
      if (fpElevators.shouldSuppressEpickup(interactionPos, camera)) return;
      droppedWorld.tryPickupNearest(pos.x, pos.y, pos.z);
    }
    if (e.code === "KeyC" && !e.repeat) crouchToggle = !crouchToggle;
    if (e.code === "Space" && !e.repeat) {
      queueFpJump(loco);
      // Build a one-shot input snapshot for the jump intent; _input may not be current yet
      // (tick hasn't run), so read keys directly here.
      const jumpInput: FpLocomotionInput = {
        forward: keys.has("KeyW"),
        backward: keys.has("KeyS"),
        left: keys.has("KeyA"),
        right: keys.has("KeyD"),
        sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        crouch: crouchToggle,
      };
      sendMoveIntent(jumpInput, true);
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      headLookYaw = 0;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    if (freeLook) {
      headLookYaw -= e.movementX * MOUSE_SENS;
      headLookYaw = Math.max(
        -FREE_LOOK_YAW_MAX,
        Math.min(FREE_LOOK_YAW_MAX, headLookYaw),
      );
    } else {
      bodyYaw -= e.movementX * MOUSE_SENS;
    }
    pitch -= e.movementY * MOUSE_SENS;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  };

  const onClick = () => {
    void (async () => {
      await localAudio.unlock();
      const actx = localAudio.getAudioContext();
      if (actx) {
        await worldAudio.attachSharedContext(actx, localAudio.getFootstepBuffers());
        worldAudioReady = true;
        refreshWorldSoundSubscription();
      }
    })();
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };

  /** HUD layers use `pointer-events: none` in gaps; suppress the browser menu on the world view. */
  const onCanvasContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  /** Latched here, consumed once per sim tick — collapses duplicate `pointerdown` bursts. */
  let meleePressPending = false;

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    const nowMs = performance.now();
    if (fpElevators.tryRaycastFloorPick(camera, pos, nowMs)) return;
    const selectedHotbarSlot = getFpHotbarSelectedSlot();
    if (
      conn.identity &&
      selectedHotbarSlot !== null &&
      hotbarSlotHasInstantConsume(conn, conn.identity, selectedHotbarSlot)
    ) {
      void runFpHotbarInstantConsume(
        conn,
        conn.identity,
        selectedHotbarSlot,
        primeHotbarConsumeAudio,
        "mountFpSession",
      );
      return;
    }
    meleePressPending = true;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", onWheelHotbar, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("contextmenu", onCanvasContextMenu);

  let raf = 0;
  let lastFrameMs = performance.now();

  const tick = () => {
    raf = requestAnimationFrame(tick);
    // Single performance.now() for the whole tick — avoids redundant syscalls and keeps
    // sub-systems consistent with the same timestamp.
    const nowMs = performance.now();
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
    lastFrameMs = nowMs;

    if (meleePressPending) {
      meleePressPending = false;
      if (nowMs - lastMeleeMs >= MELEE_COOLDOWN_MS) {
        lastMeleeMs = nowMs;
        meleeAttackSeq += 1;
        localAudio.playMeleeWeaponSwingLocal();
        if (conn.identity) void conn.reducers.submitMeleeSwing({});
      }
    }

    // Mutate pooled input in place — no object literal allocation per frame.
    _input.forward = keys.has("KeyW");
    _input.backward = keys.has("KeyS");
    _input.left = keys.has("KeyA");
    _input.right = keys.has("KeyD");
    _input.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    _input.crouch = crouchToggle;

    const jumpQueuedBeforeStep = loco.jumpQueued;
    fpElevators.syncCabEvalClock(nowMs);
    prevPos.copy(pos);

    // --- Physics section timing ---
    _mainStepOpts.dtSec = dt;
    _mainStepOpts.evalWallClockMs = nowMs;
    _mainStepOpts.crouch = crouchToggle;
    _mainStepOpts.jumpPressedThisFrame = jumpQueuedBeforeStep;
    _mainStepOpts.bodyYawRad = bodyYaw;
    const headY = simulatePredictedPlayerStep(_mainStepOpts);
    const _t_physicsEnd = performance.now();

    // --- Elevator section timing ---
    fpElevators.tick(dt, nowMs, pos);
    fpElevators.syncLandingHailUi(camera, pos, nowMs);
    const _t_elevEnd = performance.now();

    // Decay the display offset — exponential approach to zero each frame.
    // Any server correction applied this frame (or earlier) smoothly blends out.
    if (_displayOffset.x !== 0 || _displayOffset.y !== 0 || _displayOffset.z !== 0) {
      const k = Math.exp(-DISPLAY_OFFSET_DAMP * dt);
      _displayOffset.x *= k;
      _displayOffset.y *= k;
      _displayOffset.z *= k;
      // Clamp tiny residuals to exact zero so the condition above short-circuits next frame.
      if (Math.abs(_displayOffset.x) < 1e-5) _displayOffset.x = 0;
      if (Math.abs(_displayOffset.y) < 1e-5) _displayOffset.y = 0;
      if (Math.abs(_displayOffset.z) < 1e-5) _displayOffset.z = 0;
    }

    // Render at physics position + smooth display offset.
    playerRig.position.set(
      pos.x + _displayOffset.x,
      pos.y + _displayOffset.y,
      pos.z + _displayOffset.z,
    );
    playerRig.rotation.y = bodyYaw;
    headPivot.position.y = headY;
    headPivot.rotation.set(0, 0, 0);
    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    // Alt: yaw + pitch on the camera chain only — weapon stays body-level on pitch (neck look).
    headPitch.rotation.x = freeLook ? 0 : pitch;
    headCameraPitch.rotation.x = pitch;
    headFreeLook.rotation.y = headLookYaw;
    const hs = Math.hypot(loco.velocity.x, loco.velocity.z);
    if (worldAudioReady) {
      worldAudio.syncListener();
    }

    _audioMovement.horizontalSpeed = hs;
    _audioMovement.stridePhaseRad = loco.headBobPhase;
    _audioMovement.grounded = loco.grounded;
    _audioMovement.crouch = crouchToggle;
    _audioMovement.sprint = _input.sprint;
    _audioMovement.freeLook = freeLook;
    localAudio.update(dt, _audioMovement);
    const walkStrength = THREE.MathUtils.clamp(
      hs / fpLocomotionConstants.sprintSpeedMps,
      0,
      1,
    );
    if (loco.grounded && !crouchToggle && !freeLook && hs > 0.12) {
      // Stride-locked vertical bob only (roll / lateral sway read as side-to-side rocking).
      const dip = Math.sin(loco.headBobPhase * 2) * CAM_BOB_DIP_Y * walkStrength;
      camera.rotation.z = 0;
      camera.position.x = 0;
      camera.position.y = dip;
    } else {
      camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, 0, 10, dt);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 10, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0, 10, dt);
    }

    syncActiveHotbarSlotToServer();

    if (nowMs - lastNet >= NET_INTERVAL_MS && conn.identity) {
      lastNet = nowMs;
      sendMoveIntent(_input, jumpQueuedBeforeStep);
    }

    if (conn.identity) {
      const drift = Math.hypot(pos.x - poseAoiAnchorX, pos.z - poseAoiAnchorZ);
      if (drift > POSE_AOI_RECENTER) {
        subscribePoseAoi(pos.x, pos.z);
      }
    }

    // Reuse pre-allocated map — clear is O(n remote players), no Map construction cost.
    _remoteSnapshots.clear();
    if (conn.identity) {
      for (const row of conn.db.player_pose) {
        const id = row.identity.toHexString();
        if (conn.identity.isEqual(row.identity)) continue;
        const p = interp.getInterpolated(id, nowMs);
        const snap = replicatedPlayerSnapshotFromPlainPose(
          {
            playerIdHex: id,
            x: row.x,
            y: row.y,
            z: row.z,
            yawRad: row.yaw,
            velX: row.velX,
            velY: row.velY,
            velZ: row.velZ,
            grounded: row.grounded !== 0,
          },
          {
            observedTimeMs: nowMs,
            worldPositionOverride: p ?? undefined,
            equippedPrimary: "unarmed",
          },
        );
        _remoteSnapshots.set(id, snap);
      }
    }

    const localId = conn.identity?.toHexString() ?? "local-unknown";
    const hotbarRow = selectedHotbarRow();
    const hotbarHeld = hotbarRow ? equippedHeldItemIdFromDefId(hotbarRow.defId) : ("unarmed" as const);
    const hotbarConsumableDefId =
      hotbarRow && getMammothItemDef(hotbarRow.defId)?.category === "consumable"
        ? hotbarRow.defId
        : null;

    const localState = buildLocalPlayerGameplayState({
      playerIdHex: localId,
      pos,
      yawRad: bodyYaw + headLookYaw,
      pitchRad: pitch,
      freeLookActive: freeLook,
      stridePhaseRad: loco.headBobPhase,
      vel: loco.velocity,
      grounded: loco.grounded,
      crouch: crouchToggle,
      meleeAttackSeq,
      equippedPrimaryFromHotbar: hotbarHeld,
    });
    // --- Presentation section timing ---
    presentation.update(dt, localState, _remoteSnapshots, nowMs);
    hotbarConsumableVisual.syncSelected(
      hotbarConsumableDefId,
      presentation.getLocalFpGripAnchorObject(),
    );
    const _t_presentEnd = performance.now();

    if (conn.identity) {
      // The HUD prompt should match the player's local first-person view, not the more
      // authority-biased interaction pose that can lag behind a moving elevator rider.
      const doorPrompt = fpElevators.getExteriorDoorInteractPrompt(pos, camera);
      if (doorPrompt) {
        setFpPickupPrompt({
          kind: "elevator_exterior_door",
          willClose: doorPrompt.willClose,
          floorLabel: doorPrompt.floorLabel,
        });
      } else {
        const hit = findNearestDroppedPickup(
          conn,
          pos.x,
          pos.y,
          pos.z,
          MAMMOTH_PICKUP_RADIUS_M,
        );
        if (hit) {
          const def = getMammothItemDef(hit.defId);
          setFpPickupPrompt({
            kind: "dropped_item",
            droppedItemIdStr: hit.droppedItemId.toString(),
            displayName: def?.displayName ?? hit.defId,
          });
        } else {
          setFpPickupPrompt(null);
        }
      }
    } else {
      setFpPickupPrompt(null);
    }

    // --- Render section timing ---
    syncBuildingFloorPlateVisibility(nowMs);
    renderer.render(scene, camera);
    const _t_renderEnd = performance.now();

    onFpSessionPostRenderFrame(nowMs);
    logFpPerf();
    pushFpPerfFrame(
      nowMs,
      _t_renderEnd - nowMs,
      {
        physicsMs: _t_physicsEnd - nowMs,
        elevatorMs: _t_elevEnd - _t_physicsEnd,
        presentMs: _t_presentEnd - _t_elevEnd,
        renderMs: _t_renderEnd - _t_presentEnd,
      },
      {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      },
    );
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheelHotbar);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    canvas.removeEventListener("click", onClick);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("contextmenu", onCanvasContextMenu);
    if (poseAoiSub?.isActive()) {
      poseAoiSub.unsubscribe();
    }
    poseAoiSub = null;
    setFpPickupPrompt(null);
    fpElevators.dispose();
    droppedWorld.dispose();
    conn.db.player_pose.removeOnInsert(onPoseInsert);
    conn.db.player_pose.removeOnUpdate(onPoseUpdate);
    disposeFpEnvironment();
    disposeFpAuthoring();
    disposeWeaponPresentationHotReload();
    disposeWorldContentHotReload();
    unsubHotbarRail();
    worldAudio.dispose();
    worldAudioReady = false;
    unregisterHotbarConsumeLocalAudio();
    localAudio.dispose();
    hotbarConsumableVisual.dispose();
    presentation.dispose();
    renderer.dispose();
    scene.clear();
    resetFpSessionFpsDisplay();
    resetFpPerfStore();
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
  };
}

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
import {
  BIT_BACK,
  BIT_FORWARD,
  BIT_JUMP,
  BIT_LEFT,
  BIT_RIGHT,
  encodeMoveIntentBits,
} from "./moveIntentCodec";
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
import {
  getHotbarSlotInventoryItem,
  hotbarDefIdSupportsMeleeAttack,
} from "./fpHotbarResolve";
import { attachFpSessionEnvironment } from "./fpSessionEnvironment";
import { createFpSessionGrass } from "./fpSessionGrass";
import {
  onFpSessionPostRenderFrame,
  resetFpSessionFpsDisplay,
} from "./fpSessionFpsDisplay";
import { createFpSessionPerfDebugPostRenderHook } from "./fpSessionPerfDebug";
import { mountFpApartmentDoors } from "./fpApartmentDoors.js";
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
import { createFpCollisionDebugOverlay } from "./fpSessionCollisionDebug";

/**
 * Intent publish cadence — keep near `apps/server/src/movement.rs` physics schedule
 * (`TimeDuration::from_micros(50_000)` ≈ 20 Hz) so prediction and authority stay aligned.
 */
const NET_INTERVAL_MS = 50;
const NET_DT_SEC = NET_INTERVAL_MS * 0.001;

const clampTinyDisplayOffsetComponents = (v: THREE.Vector3) => {
  if (Math.abs(v.x) < 1e-5) v.x = 0;
  if (Math.abs(v.y) < 1e-5) v.y = 0;
  if (Math.abs(v.z) < 1e-5) v.z = 0;
};
/** Immediate resend when move bits flip; keeps stop/start from waiting a full server tick. */
const MOVE_INTENT_EDGE_WINDOW_MS = NET_INTERVAL_MS;
/**
 * While grounded movement is active, resend aim yaw when turning by roughly 1 degree so the
 * server path does not visibly cut corners between 20 Hz heartbeat publishes.
 */
const MOVE_INTENT_YAW_EDGE_RAD = 0.02;
const MOVE_INTENT_MOVE_BITS = BIT_FORWARD | BIT_BACK | BIT_LEFT | BIT_RIGHT;

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

const MM_WALL_PROBE_LOADING_MSG =
  "[mmWallProbe] Session still initializing (WebGPU / assets). Wait until the world is visible, then run window.__mmWallProbe.on() again.";

/** Installed immediately when FP mount starts; replaced by the real API once the session is ready. */
function installMmWallProbeLoadingStub(): void {
  (globalThis as unknown as { __mmWallProbe?: Record<string, unknown> }).__mmWallProbe = {
    on() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
    },
    off() {
      /* replaced later */
    },
    probe() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
      return undefined;
    },
    player() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
      return undefined;
    },
    persistOn() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
    },
    persistOff() {
      /* replaced later */
    },
  };
}

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
  installMmWallProbeLoadingStub();
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
  const fpCollisionDebug = createFpCollisionDebugOverlay();
  scene.add(fpCollisionDebug.group);

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
  const fpGrass = createFpSessionGrass(buildingWorldBounds);
  scene.add(fpGrass.group);
  const maxBuildingLevel = maxBuildingLevelIndex(building);

  const fpElevators = mountFpElevatorWorld({
    conn,
    buildingRoot,
    building,
    getFloorDoc: (id) => parseFloorDoc(floorPayloadByDocId(id)),
  });

  const fpApartmentDoors = mountFpApartmentDoors({
    conn,
    buildingRoot,
    building,
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
  const _wallProbeCamWorld = new THREE.Vector3();
  const _wallProbeCamDir = new THREE.Vector3();
  const _wallProbeHitNormal = new THREE.Vector3();
  const _wallProbeRaycaster = new THREE.Raycaster();
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
   *
   * Note: if locomotion is allowed to decay toward zero forever instead of snapping to an exact
   * rest state, this smoothing layer ends up hiding a constant stream of tiny stop-state
   * corrections. That presents as "hitching while stopping" even when frame time is fine, so keep
   * the idle-velocity deadzone in client/server locomotion aligned with this reconcile path.
   *
   * While WASD is up during the friction coast, **do not decay** offset — shrinking offset moves
   * `pos + offset` in world space even when `pos` has almost stopped (felt like a camera hitch).
   * Once fully settled, offset is **baked into** `pos` so physics matches what you were seeing.
   */
  const _displayOffset = new THREE.Vector3();
  /**
   * Exponential decay for `_displayOffset` (prediction-error smoothing). Lower = slower decay =
   * camera eases for more frames after a reconcile (less “micro-jerk”). Tuned vs 12 which felt
   * snappy enough to reveal every 20 Hz nudge as hitching.
   */
  const DISPLAY_OFFSET_DAMP = 5;
  /**
   * Feet on a **vertically moving** kinematic surface (elevator cab floor):
   * - Somewhat stronger `_displayOffset.y` decay (reconcile vs cab motion); not too aggressive or
   *   it fights 20 Hz corrections and reads as shimmer.
   * - **Faster** vertical rig ease (not snap): snapping `rty` was transmitting reconcile spikes
   *   in `_displayOffset.y` straight to the camera every frame.
   */
  /** Blended (kinematic vs HUD-predicted cab) vertical speed gate for elevator view smoothing. */
  const ELEVATOR_KINEMATIC_FAST_ABS_VY_MPS = 0.14;
  /** While HUD reports meaningful cab Vy, skip stride bob so it does not fight cab motion. */
  const ELEV_HEAD_BOB_SUPPRESS_MIN_HUD_CAB_VY_MPS = 0.02;
  /** Multiplier on {@link DISPLAY_OFFSET_DAMP} for `_displayOffset.y` only during fast vertical kinematic motion. */
  const DISPLAY_OFFSET_ELEVATOR_Y_DAMP_SCALE = 2.1;
  /** Extra horizontal rig ease toward target while elevator smoothing is active (parallax). */
  const PLAYER_RIG_VIEW_XZ_ELEV_LERP_MULT = 2.25;
  /** Extra **vertical** rig ease while riding (replaces hard Y snap; still faster than walking). */
  const PLAYER_RIG_VIEW_Y_ELEV_LERP_MULT = 5.5;
  /**
   * Extra exponential ease on the **visual** rig feet toward `pos + _displayOffset` (physics
   * stays exact). Hides residual jitter from reconcile + irregular RAF; ~0 = off.
   */
  const PLAYER_RIG_VIEW_LERP_PER_S = 14;
  /** With movement keys up, treat horizontal speed below this (m/s) as fully stopped for view settle. */
  const VIEW_SETTLED_IDLE_MAX_HS = 0.055;
  /**
   * Max distance we correct toward replay in one server pose (~50 ms). Larger errors spread
   * across several updates so we never jump a full accumulated desync in one frame (that was
   * happening after the full-stop no-op path let client/server drift apart).
   */
  const RECONCILE_MAX_CORRECTION_PER_POSE_M = 0.08;
  const _rigViewScratch = new THREE.Vector3();
  /** Beyond this distance corrections hard-snap (teleport, cheat detection, etc.). */
  const DISPLAY_HARD_SNAP_M = 3.0;
  /**
   * While feet are in the **moving** cab rider volume, skip applying **any** small replay correction
   * (X/Y/Z + `_displayOffset`). Replay dt ≠ server tick dt, so phantom error is on all axes; only
   * deferring Y still left horizontal reconcile pumping `displayOffsetM`.  Above this, full snap
   * (fell out, teleported, etc.).
   */
  const ELEV_MOVING_RIDER_RECONCILE_SNAP_M = 2.5;

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
    evalWallClockMs: number;
  };
  const pendingMoveIntents: PendingMoveIntent[] = [];
  /** Head index into `pendingMoveIntents` — acked entries are skipped without shifting the array. */
  let intentsHead = 0;
  /** Max un-acked intents to retain (1.5 s buffer); older ones are compacted away. */
  const MAX_PENDING_INTENTS = 30;
  let lastMoveIntentMs = -Infinity;
  let lastSentPersistentBits = 0;
  let lastSentAimYaw = 0;
  let hasSentMoveIntent = false;
  /**
   * Keep the jump bit live through at least one server tick. If we immediately overwrite the
   * replicated input row with a no-jump sample, the fixed-rate reducer can miss the jump entirely.
   */
  let jumpIntentLockUntilMs = 0;

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
   * Live door-collision debug — enabled from the browser dev console.
   *
   *   window.__mmDoorDebug.all()         // master command: live logs + immediate dumps
   *   window.__mmDoorDebug.on()          // start live logging near apartment doors
   *   window.__mmDoorDebug.on(5)         // with 5m radius instead of default 2.5
   *   window.__mmDoorDebug.off()
   *   window.__mmDoorDebug.snapshot()    // print + return current nearby doors
   *   window.__mmDoorDebug.staticAabbs() // print + return nearby static AABBs
   *   window.__mmDoorDebug.persistOn()   // auto-enable `all()` after reloads
   *   window.__mmDoorDebug.persistOff()
   *
   * On each frame with a door in range, it logs ONE line per "event":
   *   - `clamped = true` means collision pushed the player back from their intended target
   *   - `nearbyDoors` includes face, hinge, live open01 and the exact AABB the physics saw
   * Paste the output back and we can pinpoint which AABB is blocking you.
   */
  const MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY = "mmDoorDebugAutostart";
  const __mmDoorDebugState = {
    enabled: false,
    radiusM: 2.5,
    /** Throttle identical events so holding W against a wall doesn't flood the console. */
    minLogIntervalMs: 200,
    lastLogMs: 0,
    reconcileMinLogIntervalMs: 120,
    lastReconcileLogMs: 0,
  };

  type DoorDebugFrame = {
    prev: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    resolved: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    crouch: boolean;
  };

  /**
   * Side of a probe body that an AABB is closest to. Helpful when reading logs:
   * a wall overlapping `-x` side of the player body is the one pushing them east.
   */
  const classifyOverlapSides = (
    aabb: { min: [number, number, number]; max: [number, number, number] },
    body: { cx: number; cz: number; yMin: number; yMax: number; radius: number },
  ): string[] => {
    const sides: string[] = [];
    if (aabb.min[0] <= body.cx - body.radius + 1e-4) sides.push("-x");
    if (aabb.max[0] >= body.cx + body.radius - 1e-4) sides.push("+x");
    if (aabb.min[2] <= body.cz - body.radius + 1e-4) sides.push("-z");
    if (aabb.max[2] >= body.cz + body.radius - 1e-4) sides.push("+z");
    if (aabb.min[1] <= body.yMin + 1e-4) sides.push("-y");
    if (aabb.max[1] >= body.yMax - 1e-4) sides.push("+y");
    return sides;
  };

  const printDoorDebugJson = (label: string, payload: unknown): void => {
    console.log(`[mmDoorDebug:${label}] ${JSON.stringify(payload, null, 2)}`);
  };

  const readDoorDebugAutostart = (): boolean => {
    try {
      return globalThis.localStorage?.getItem(MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const writeDoorDebugAutostart = (enabled: boolean): void => {
    try {
      if (enabled) globalThis.localStorage?.setItem(MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY, "1");
      else globalThis.localStorage?.removeItem(MM_DOOR_DEBUG_AUTOSTART_STORAGE_KEY);
    } catch {
      /* ignore storage failures */
    }
  };

  const roundV = (v: { x: number; y: number; z: number }) => ({
    x: +v.x.toFixed(3),
    y: +v.y.toFixed(3),
    z: +v.z.toFixed(3),
  });

  const roundAabb = (a: import("@the-mammoth/world").CollisionAabb | null) =>
    a
      ? {
          min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)],
          max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)],
        }
      : null;

  const snapshotDoorDebugAt = (x: number, z: number, radiusM: number) =>
    fpApartmentDoors.debugSnapshot(x, z, radiusM).map((d) => ({
      rowKey: d.rowKey,
      level: d.level,
      face: d.face,
      hingeX: +d.hingeX.toFixed(3),
      hingeZ: +d.hingeZ.toFixed(3),
      feetY: +d.feetY.toFixed(3),
      panelW: +d.panelWidthM.toFixed(3),
      panelH: +d.panelHeightM.toFixed(3),
      desired: d.desiredOpen,
      open01: +d.swingOpen01.toFixed(3),
      regime: d.regime,
      aabb: roundAabb(d.emittedAabb),
      distance: +d.distanceMeters.toFixed(3),
    }));

  const snapshotDoorDebug = (radiusM: number) => snapshotDoorDebugAt(pos.x, pos.z, radiusM);

  const snapshotStaticAabbs = (radiusM: number): { min: [number, number, number]; max: [number, number, number] }[] => {
    const out: { min: [number, number, number]; max: [number, number, number] }[] = [];
    staticCollisionIndex.visitAabbsInXZ(
      pos.x - radiusM,
      pos.x + radiusM,
      pos.z - radiusM,
      pos.z + radiusM,
      (a) => {
        out.push({
          min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)],
          max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)],
        });
      },
    );
    return out;
  };

  /**
   * Returns every static AABB that overlaps the player's body volume (capsule → AABB) at `center`,
   * sorted by horizontal distance from the body center. This is the definitive list of what COULD
   * be shoving the player on any given frame.
   */
  const snapshotStaticBodyOverlaps = (
    center: { x: number; y: number; z: number },
    crouch: boolean,
    inflateM = 0.01,
  ) => {
    const radius = FP_PLAYER_COLLISION_RADIUS_M;
    const bodyH = crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M;
    const yMin = center.y;
    const yMax = center.y + bodyH;
    const xMin = center.x - radius - inflateM;
    const xMax = center.x + radius + inflateM;
    const zMin = center.z - radius - inflateM;
    const zMax = center.z + radius + inflateM;
    const out: {
      min: [number, number, number];
      max: [number, number, number];
      overlapSides: string[];
      distanceMeters: number;
    }[] = [];
    staticCollisionIndex.visitAabbsInXZ(xMin, xMax, zMin, zMax, (a) => {
      if (a.max[1] < yMin - inflateM || a.min[1] > yMax + inflateM) return;
      if (a.max[0] < xMin || a.min[0] > xMax) return;
      if (a.max[2] < zMin || a.min[2] > zMax) return;
      const clampedX = Math.max(a.min[0], Math.min(center.x, a.max[0]));
      const clampedZ = Math.max(a.min[2], Math.min(center.z, a.max[2]));
      const dx = clampedX - center.x;
      const dz = clampedZ - center.z;
      const distance = Math.hypot(dx, dz);
      const rounded = {
        min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)] as [number, number, number],
        max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)] as [number, number, number],
      };
      out.push({
        ...rounded,
        overlapSides: classifyOverlapSides(rounded, {
          cx: center.x,
          cz: center.z,
          yMin,
          yMax,
          radius,
        }),
        distanceMeters: +distance.toFixed(4),
      });
    });
    out.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return out;
  };

  /**
   * Returns every dynamic AABB (apartment doors + elevators) that overlaps the player's body
   * volume at `center`. Lets us tell the difference between "door slab is pushing you" and
   * "static wall is pushing you" on the same frame.
   */
  const snapshotDynamicBodyOverlaps = (
    center: { x: number; y: number; z: number },
    crouch: boolean,
    inflateM = 0.01,
  ) => {
    const radius = FP_PLAYER_COLLISION_RADIUS_M;
    const bodyH = crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M;
    const yMin = center.y;
    const yMax = center.y + bodyH;
    const xMin = center.x - radius - inflateM;
    const xMax = center.x + radius + inflateM;
    const zMin = center.z - radius - inflateM;
    const zMax = center.z + radius + inflateM;
    const out: {
      min: [number, number, number];
      max: [number, number, number];
      overlapSides: string[];
      distanceMeters: number;
    }[] = [];
    const visit = (a: import("@the-mammoth/world").CollisionAabb): void => {
      if (a.max[1] < yMin - inflateM || a.min[1] > yMax + inflateM) return;
      if (a.max[0] < xMin || a.min[0] > xMax) return;
      if (a.max[2] < zMin || a.min[2] > zMax) return;
      const clampedX = Math.max(a.min[0], Math.min(center.x, a.max[0]));
      const clampedZ = Math.max(a.min[2], Math.min(center.z, a.max[2]));
      const distance = Math.hypot(clampedX - center.x, clampedZ - center.z);
      const rounded = {
        min: [+a.min[0].toFixed(3), +a.min[1].toFixed(3), +a.min[2].toFixed(3)] as [number, number, number],
        max: [+a.max[0].toFixed(3), +a.max[1].toFixed(3), +a.max[2].toFixed(3)] as [number, number, number],
      };
      out.push({
        ...rounded,
        overlapSides: classifyOverlapSides(rounded, {
          cx: center.x,
          cz: center.z,
          yMin,
          yMax,
          radius,
        }),
        distanceMeters: +distance.toFixed(4),
      });
    };
    fpApartmentDoors.visitCollisionAabbsInXZ(xMin, xMax, zMin, zMax, visit, undefined);
    fpElevators.visitCollisionAabbsInXZ(xMin, xMax, zMin, zMax, visit, undefined);
    out.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return out;
  };

  const logDoorDebugFrame = (f: DoorDebugFrame): void => {
    const nowMs = performance.now();
    if (nowMs - __mmDoorDebugState.lastLogMs < __mmDoorDebugState.minLogIntervalMs) return;
    const dx = f.target.x - f.resolved.x;
    const dz = f.target.z - f.resolved.z;
    const clampedBy = Math.hypot(dx, dz);
    const clamped = clampedBy > 0.002;
    const moved = Math.hypot(f.resolved.x - f.prev.x, f.resolved.z - f.prev.z);
    const attempted = Math.hypot(f.target.x - f.prev.x, f.target.z - f.prev.z);
    if (!clamped && attempted < 0.005) return;
    __mmDoorDebugState.lastLogMs = nowMs;
    const nearbyDoors = fpApartmentDoors.debugSnapshot(
      f.resolved.x,
      f.resolved.z,
      __mmDoorDebugState.radiusM,
    );
    const resolveDirection = (): string | null => {
      if (clampedBy <= 1e-4) return null;
      const parts: string[] = [];
      if (Math.abs(dx) > 1e-4) parts.push(dx > 0 ? "-x (pushed west)" : "+x (pushed east)");
      if (Math.abs(dz) > 1e-4) parts.push(dz > 0 ? "-z (pushed north)" : "+z (pushed south)");
      return parts.join(", ");
    };
    // `target - resolved` is the vector the resolver removed. If positive +x, the blocker
    // is EAST of the player (pushed them west), etc. Sides with larger push dominate.
    const staticOverlaps = clamped ? snapshotStaticBodyOverlaps(f.resolved, f.crouch) : [];
    const dynamicOverlaps = clamped ? snapshotDynamicBodyOverlaps(f.resolved, f.crouch) : [];
    const payload = {
      clamped,
      clampedByMeters: +clampedBy.toFixed(4),
      clampDirection: resolveDirection(),
      attemptedMoveM: +attempted.toFixed(4),
      resolvedMoveM: +moved.toFixed(4),
      prev: roundV(f.prev),
      target: roundV(f.target),
      resolved: roundV(f.resolved),
      velocity: roundV(f.velocity),
      bodyRadiusM: FP_PLAYER_COLLISION_RADIUS_M,
      bodyHeightM: f.crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M,
      nearbyDoors: nearbyDoors.map((d) => ({
        rowKey: d.rowKey,
        level: d.level,
        face: d.face,
        hingeX: +d.hingeX.toFixed(3),
        hingeZ: +d.hingeZ.toFixed(3),
        feetY: +d.feetY.toFixed(3),
        panelW: +d.panelWidthM.toFixed(3),
        panelH: +d.panelHeightM.toFixed(3),
        desired: d.desiredOpen,
        open01: +d.swingOpen01.toFixed(3),
        regime: d.regime,
        aabb: roundAabb(d.emittedAabb),
        distance: +d.distanceMeters.toFixed(3),
      })),
      // Only populated when `clamped` — these are the AABBs ACTUALLY touching the player body.
      staticOverlaps,
      dynamicOverlaps,
    };
    printDoorDebugJson("frame", payload);
  };

  const logDoorDebugReconcile = (
    serverRow: PlayerPose,
    predictedBefore: { x: number; y: number; z: number },
    replayed: { x: number; y: number; z: number },
    crouch: boolean,
    pendingIntentCount: number,
  ): void => {
    if (!__mmDoorDebugState.enabled) return;
    const nowMs = performance.now();
    if (
      nowMs - __mmDoorDebugState.lastReconcileLogMs <
      __mmDoorDebugState.reconcileMinLogIntervalMs
    ) {
      return;
    }
    const serverDelta = {
      x: serverRow.x - predictedBefore.x,
      y: serverRow.y - predictedBefore.y,
      z: serverRow.z - predictedBefore.z,
    };
    const replayDelta = {
      x: replayed.x - predictedBefore.x,
      y: replayed.y - predictedBefore.y,
      z: replayed.z - predictedBefore.z,
    };
    const serverDeltaM = Math.hypot(serverDelta.x, serverDelta.y, serverDelta.z);
    const replayDeltaM = Math.hypot(replayDelta.x, replayDelta.y, replayDelta.z);
    if (serverDeltaM < 0.01 && replayDeltaM < 0.01) return;
    /**
     * While moving, the subscribed `player_pose` row is often **meters** behind local `pos`
     * because the client has already simulated frames the server has not applied yet. That gap
     * is *not* prediction error. When intent replay matches (`replayDelta` tiny), skip the line —
     * otherwise the console floods scary multi-meter “deltas” during every sprint.
     */
    if (replayDeltaM < 0.018 && serverDeltaM > 0.12 && pendingIntentCount > 0) return;
    __mmDoorDebugState.lastReconcileLogMs = nowMs;
    const radiusM = __mmDoorDebugState.radiusM;
    printDoorDebugJson("reconcile", {
      readThisFirst:
        "authoritativeVsPredicted_m is usually large while sprinting (server row lags unacked intents). " +
        "physicsReplayMismatch_m is the real correction |corr|; keep that small.",
      pendingIntentCount,
      predictedBefore: roundV(predictedBefore),
      authoritativeServer: {
        x: +serverRow.x.toFixed(3),
        y: +serverRow.y.toFixed(3),
        z: +serverRow.z.toFixed(3),
        velX: +serverRow.velX.toFixed(3),
        velY: +serverRow.velY.toFixed(3),
        velZ: +serverRow.velZ.toFixed(3),
        grounded: serverRow.grounded !== 0,
        seq: poseSeqAsBigint(serverRow.seq).toString(),
      },
      replayResolved: roundV(replayed),
      authoritativeVsPredicted: {
        x: +serverDelta.x.toFixed(3),
        y: +serverDelta.y.toFixed(3),
        z: +serverDelta.z.toFixed(3),
        meters: +serverDeltaM.toFixed(4),
      },
      physicsReplayMismatch: {
        x: +replayDelta.x.toFixed(3),
        y: +replayDelta.y.toFixed(3),
        z: +replayDelta.z.toFixed(3),
        meters: +replayDeltaM.toFixed(4),
      },
      bodyRadiusM: FP_PLAYER_COLLISION_RADIUS_M,
      bodyHeightM: crouch ? FP_PLAYER_COLLISION_HEIGHT_CROUCH_M : FP_PLAYER_COLLISION_HEIGHT_STAND_M,
      nearbyDoorsAtServer: snapshotDoorDebugAt(serverRow.x, serverRow.z, radiusM),
      nearbyDoorsAtReplay: snapshotDoorDebugAt(replayed.x, replayed.z, radiusM),
      staticOverlapsAtServer: snapshotStaticBodyOverlaps(serverRow, crouch),
      dynamicOverlapsAtServer: snapshotDynamicBodyOverlaps(serverRow, crouch),
      staticOverlapsAtReplay: snapshotStaticBodyOverlaps(replayed, crouch),
      dynamicOverlapsAtReplay: snapshotDynamicBodyOverlaps(replayed, crouch),
    });
  };

  const __mmDoorDebugApi = {
    on(radiusM = 2.5): void {
      __mmDoorDebugState.enabled = true;
      __mmDoorDebugState.radiusM = radiusM;
      printDoorDebugJson("status", {
        enabled: true,
        radiusM: +radiusM.toFixed(3),
        autostart: readDoorDebugAutostart(),
        message:
          "Walk at a door; logs appear on collision / movement near a door. Call __mmDoorDebug.off() to stop.",
      });
    },
    off(): void {
      __mmDoorDebugState.enabled = false;
      printDoorDebugJson("status", {
        enabled: false,
        radiusM: +__mmDoorDebugState.radiusM.toFixed(3),
        autostart: readDoorDebugAutostart(),
      });
    },
    snapshot(radiusM = 2.5) {
      const payload = {
        player: roundV(pos),
        radiusM: +radiusM.toFixed(3),
        nearbyDoors: snapshotDoorDebug(radiusM),
      };
      printDoorDebugJson("snapshot", payload);
      return payload;
    },
    /** Dump every static-collision AABB whose XZ footprint is within `radiusM` of the player. */
    staticAabbs(radiusM = 2.5) {
      const payload = {
        player: roundV(pos),
        radiusM: +radiusM.toFixed(3),
        staticAabbs: snapshotStaticAabbs(radiusM),
      };
      printDoorDebugJson("static-aabbs", payload);
      return payload;
    },
    player(): { x: number; y: number; z: number } {
      const payload = { player: roundV(pos) };
      printDoorDebugJson("player", payload);
      return payload.player;
    },
    all(radiusM = 2.5): void {
      this.on(radiusM);
      printDoorDebugJson("all", {
        player: roundV(pos),
        radiusM: +radiusM.toFixed(3),
        nearbyDoors: snapshotDoorDebug(radiusM),
        staticAabbs: snapshotStaticAabbs(radiusM),
        autostart: readDoorDebugAutostart(),
      });
    },
    persistOn(radiusM = __mmDoorDebugState.radiusM): void {
      writeDoorDebugAutostart(true);
      this.all(radiusM);
      printDoorDebugJson("persist", { autostart: true, radiusM: +radiusM.toFixed(3) });
    },
    persistOff(): void {
      writeDoorDebugAutostart(false);
      printDoorDebugJson("persist", { autostart: false });
    },
  };
  // Expose on window for dev-console use. Kept behind `unknown` cast so TS stays clean.
  (globalThis as unknown as { __mmDoorDebug?: typeof __mmDoorDebugApi }).__mmDoorDebug =
    __mmDoorDebugApi;
  if (readDoorDebugAutostart()) __mmDoorDebugApi.all(__mmDoorDebugState.radiusM);

  /**
   * Elevator ride / hitch debug — correlate slow frames with cab prediction + floor culling.
   *
   *   window.__mmElevDebug.on()                 // periodic samples while cab is moving
   *   window.__mmElevDebug.on({ hitchMs: 28 })  // also log any frame ≥28 ms while riding
   *   window.__mmElevDebug.on({ logSlowFramesAlways: true }) // slow frames even off cab
   *   window.__mmElevDebug.snapshot()           // one-shot ride snapshot + timings
   *   window.__mmElevDebug.off()
   *   window.__mmElevDebug.persistOn()            // re-enable after reload
   *   window.__mmElevDebug.persistOff()
   *   ?elevdebug=1 or localStorage mmElevDebugAutostart=1 — auto-start on session load
   */
  const MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY = "mmElevDebugAutostart";
  const printElevDebugJson = (label: string, payload: unknown): void => {
    console.log(`[mmElevDebug:${label}] ${JSON.stringify(payload, null, 2)}`);
  };
  /** Require this many consecutive frames outside HUD cab before `[exit]` (kills one-frame flicker at door seams). */
  const ELEV_DEBUG_EXIT_DEBOUNCE_FRAMES = 5;
  const __mmElevDebugState = {
    enabled: false,
    intervalMs: 300,
    hitchMs: 22,
    logSlowFramesAlways: false,
    lastPeriodicLogMs: 0,
    /** True after any frame with a ride sample until `[exit]` fires. */
    seenRideHud: false,
    /** Consecutive frames with no ride while `seenRideHud` */
    hudMissStreak: 0,
  };
  const readElevDebugAutostart = (): boolean => {
    try {
      if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("elevdebug")) {
        return true;
      }
      return globalThis.localStorage?.getItem(MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };
  const writeElevDebugAutostart = (enabled: boolean): void => {
    try {
      if (enabled) globalThis.localStorage?.setItem(MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY, "1");
      else globalThis.localStorage?.removeItem(MM_ELEV_DEBUG_AUTOSTART_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };
  const __mmElevDebugApi = {
    on(opts?: { intervalMs?: number; hitchMs?: number; logSlowFramesAlways?: boolean }): void {
      __mmElevDebugState.enabled = true;
      if (opts?.intervalMs != null) __mmElevDebugState.intervalMs = Math.max(50, opts.intervalMs);
      if (opts?.hitchMs != null) __mmElevDebugState.hitchMs = Math.max(1, opts.hitchMs);
      __mmElevDebugState.logSlowFramesAlways = opts?.logSlowFramesAlways === true;
      __mmElevDebugState.lastPeriodicLogMs = 0;
      __mmElevDebugState.seenRideHud = false;
      __mmElevDebugState.hudMissStreak = 0;
      printElevDebugJson("status", {
        enabled: true,
        intervalMs: __mmElevDebugState.intervalMs,
        hitchMs: __mmElevDebugState.hitchMs,
        logSlowFramesAlways: __mmElevDebugState.logSlowFramesAlways,
        autostart: readElevDebugAutostart(),
        message:
          "Ride a moving cab; logs include prediction + floorVisBand. Slow frames while riding use hitchMs.",
      });
    },
    off(): void {
      __mmElevDebugState.enabled = false;
      __mmElevDebugState.seenRideHud = false;
      __mmElevDebugState.hudMissStreak = 0;
      printElevDebugJson("status", { enabled: false, autostart: readElevDebugAutostart() });
    },
    snapshot(): unknown {
      camera.getWorldPosition(_floorVisCamWorld);
      camera.getWorldDirection(_floorVisCamDir);
      const nowSnap = performance.now();
      const ride = fpElevators.sampleRideDebug(
        pos.x,
        pos.y,
        pos.z,
        nowSnap,
        _floorVisCamWorld.y,
        _floorVisCamDir.y,
      );
      const payload = {
        player: roundV(pos),
        ride,
        note: ride
          ? "Inside moving cab — fields match last frame’s eval time (call during ride for live data)."
          : "Not in a moving cab (or not inside HUD volume).",
      };
      printElevDebugJson("snapshot", payload);
      return payload;
    },
    all(opts?: { intervalMs?: number; hitchMs?: number; logSlowFramesAlways?: boolean }): void {
      this.on(opts);
      this.snapshot();
    },
    persistOn(opts?: { intervalMs?: number; hitchMs?: number; logSlowFramesAlways?: boolean }): void {
      writeElevDebugAutostart(true);
      this.on(opts);
      printElevDebugJson("persist", { autostart: true });
    },
    persistOff(): void {
      writeElevDebugAutostart(false);
      printElevDebugJson("persist", { autostart: false });
    },
  };
  (globalThis as unknown as { __mmElevDebug?: typeof __mmElevDebugApi }).__mmElevDebug =
    __mmElevDebugApi;
  if (readElevDebugAutostart()) __mmElevDebugApi.on();

  /**
   * Crosshair wall-hit probe for authoring by coordinates when the editor is not usable.
   *
   *   window.__mmWallProbe.on()          // enable RMB probe at current default range
   *   window.__mmWallProbe.on(24)        // enable RMB probe with 24m max ray distance
   *   window.__mmWallProbe.off()
   *   window.__mmWallProbe.probe()       // immediate one-shot probe from the crosshair
   *   window.__mmWallProbe.player()      // print player/camera pose only
   *   window.__mmWallProbe.persistOn()   // auto-enable after reload
   *   window.__mmWallProbe.persistOff()
   */
  const MM_WALL_PROBE_AUTOSTART_STORAGE_KEY = "mmWallProbeAutostart";
  const __mmWallProbeState = {
    enabled: false,
    maxDistanceM: 20,
  };

  const printWallProbeJson = (label: string, payload: unknown): void => {
    console.log(`[mmWallProbe:${label}] ${JSON.stringify(payload, null, 2)}`);
  };

  const readWallProbeAutostart = (): boolean => {
    try {
      return globalThis.localStorage?.getItem(MM_WALL_PROBE_AUTOSTART_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const writeWallProbeAutostart = (enabled: boolean): void => {
    try {
      if (enabled) globalThis.localStorage?.setItem(MM_WALL_PROBE_AUTOSTART_STORAGE_KEY, "1");
      else globalThis.localStorage?.removeItem(MM_WALL_PROBE_AUTOSTART_STORAGE_KEY);
    } catch {
      /* ignore storage failures */
    }
  };

  const floorLabelByLevel = new Map(
    building.floorRefs.map((ref) => [ref.levelIndex, ref.shortLabel || String(ref.levelIndex)]),
  );

  const dominantAxisLabel = (v: THREE.Vector3): "+x" | "-x" | "+y" | "-y" | "+z" | "-z" => {
    const ax = Math.abs(v.x);
    const ay = Math.abs(v.y);
    const az = Math.abs(v.z);
    if (ax >= ay && ax >= az) return v.x >= 0 ? "+x" : "-x";
    if (ay >= ax && ay >= az) return v.y >= 0 ? "+y" : "-y";
    return v.z >= 0 ? "+z" : "-z";
  };

  const surfaceKindFromNormal = (n: THREE.Vector3): "wall" | "floor" | "ceiling" => {
    if (n.y >= 0.7) return "floor";
    if (n.y <= -0.7) return "ceiling";
    return "wall";
  };

  const findAnnotatedAncestor = (
    obj: THREE.Object3D | null,
  ): { plateLevelIndex?: number; alwaysVisible?: boolean; name?: string } => {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (typeof cur.userData.mammothPlateLevelIndex === "number") {
        return {
          plateLevelIndex: cur.userData.mammothPlateLevelIndex as number,
          name: cur.name || undefined,
        };
      }
      if (cur.userData.mammothAlwaysVisible === true) {
        return { alwaysVisible: true, name: cur.name || undefined };
      }
      cur = cur.parent;
    }
    return {};
  };

  const snapshotWallProbePlayer = () => {
    camera.getWorldPosition(_wallProbeCamWorld);
    camera.getWorldDirection(_wallProbeCamDir);
    return {
      player: roundV(pos),
      camera: roundV(_wallProbeCamWorld),
      aimDirection: roundV(_wallProbeCamDir),
    };
  };

  const probeWallHit = (maxDistanceM = __mmWallProbeState.maxDistanceM) => {
    camera.getWorldPosition(_wallProbeCamWorld);
    camera.getWorldDirection(_wallProbeCamDir);
    buildingRoot.updateMatrixWorld(true);
    _wallProbeRaycaster.set(_wallProbeCamWorld, _wallProbeCamDir);
    _wallProbeRaycaster.far = Math.max(0.5, maxDistanceM);
    const hits = _wallProbeRaycaster.intersectObject(buildingRoot, true);
    const hit = hits[0];
    if (!hit) {
      const miss = {
        ...snapshotWallProbePlayer(),
        maxDistanceM: +maxDistanceM.toFixed(3),
        hit: null,
      };
      printWallProbeJson("miss", miss);
      return miss;
    }

    const annotated = findAnnotatedAncestor(hit.object);
    const faceNormal = hit.face?.normal;
    if (faceNormal) {
      _wallProbeHitNormal.copy(faceNormal).transformDirection(hit.object.matrixWorld).normalize();
    } else {
      _wallProbeHitNormal.copy(_wallProbeCamDir).multiplyScalar(-1).normalize();
    }
    const plateLevelIndex = annotated.plateLevelIndex;
    const levelLabel =
      plateLevelIndex != null ? (floorLabelByLevel.get(plateLevelIndex) ?? String(plateLevelIndex)) : null;
    const buildingLocal = buildingRoot.worldToLocal(hit.point.clone());
    const plateAnchor =
      hit.object.parent && annotated.plateLevelIndex != null
        ? (() => {
            let cur: THREE.Object3D | null = hit.object;
            while (cur) {
              if (typeof cur.userData.mammothPlateLevelIndex === "number") return cur;
              cur = cur.parent;
            }
            return null;
          })()
        : null;
    const plateLocal = plateAnchor ? plateAnchor.worldToLocal(hit.point.clone()) : null;
    const payload = {
      ...snapshotWallProbePlayer(),
      maxDistanceM: +maxDistanceM.toFixed(3),
      hit: {
        pointWorld: roundV(hit.point),
        pointBuildingLocal: roundV(buildingLocal),
        pointPlateLocal: plateLocal ? roundV(plateLocal) : null,
        distanceM: +hit.distance.toFixed(3),
        normalWorld: roundV(_wallProbeHitNormal),
        dominantNormalAxis: dominantAxisLabel(_wallProbeHitNormal),
        surfaceKind: surfaceKindFromNormal(_wallProbeHitNormal),
        floorLevelIndex: plateLevelIndex ?? null,
        floorLabel: levelLabel,
        parentGroupName: annotated.name ?? null,
        alwaysVisibleColumn: annotated.alwaysVisible ?? false,
        objectName: hit.object.name || null,
      },
    };
    printWallProbeJson("hit", payload);
    return payload;
  };

  const __mmWallProbeApi = {
    on(maxDistanceM = __mmWallProbeState.maxDistanceM): void {
      __mmWallProbeState.enabled = true;
      __mmWallProbeState.maxDistanceM = Math.max(0.5, maxDistanceM);
      printWallProbeJson("status", {
        enabled: true,
        maxDistanceM: +__mmWallProbeState.maxDistanceM.toFixed(3),
        autostart: readWallProbeAutostart(),
        message:
          "Aim at a surface and right-click to print the crosshair hit. Call __mmWallProbe.off() to stop.",
      });
    },
    off(): void {
      __mmWallProbeState.enabled = false;
      printWallProbeJson("status", {
        enabled: false,
        maxDistanceM: +__mmWallProbeState.maxDistanceM.toFixed(3),
        autostart: readWallProbeAutostart(),
      });
    },
    probe(maxDistanceM = __mmWallProbeState.maxDistanceM) {
      return probeWallHit(maxDistanceM);
    },
    player() {
      const payload = snapshotWallProbePlayer();
      printWallProbeJson("player", payload);
      return payload;
    },
    persistOn(maxDistanceM = __mmWallProbeState.maxDistanceM): void {
      writeWallProbeAutostart(true);
      this.on(maxDistanceM);
      printWallProbeJson("persist", {
        autostart: true,
        maxDistanceM: +__mmWallProbeState.maxDistanceM.toFixed(3),
      });
    },
    persistOff(): void {
      writeWallProbeAutostart(false);
      printWallProbeJson("persist", { autostart: false });
    },
  };
  (globalThis as unknown as { __mmWallProbe?: typeof __mmWallProbeApi }).__mmWallProbe =
    __mmWallProbeApi;
  if (readWallProbeAutostart()) __mmWallProbeApi.on(__mmWallProbeState.maxDistanceM);

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
  /** False until first render target is written — seeds {@link _rigViewScratch} without a frame-0 ease-in. */
  let fpRigViewSmoothedReady = false;
  /** Last frame’s kinematic support vertical velocity (elevator cab); for elev debug + tuning. */
  let lastTickElevSupportVyMps = 0;
  /** Last frame’s HUD moving-cab predicted Vy (matches ride debug); 0 when not in moving cab. */
  let lastTickHudCabVyMps = 0;
  /** `max(abs(supportVy), abs(hudCabVy))` — drives elevator view smoothing when feet sampling lags. */
  let lastTickElevVyBlendAbs = 0;

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

    const dbg = __mmDoorDebugState;
    const isLive = opts === _mainStepOpts;
    const dbgActive = dbg.enabled && isLive;
    const tgtX = opts.pos.x;
    const tgtZ = opts.pos.z;
    const tgtY = opts.pos.y;

    resolvePlayerCollisions(
      opts.pos,
      opts.prevPos,
      opts.locoState.velocity,
      opts.crouch,
      fpLocomotionConstants.walkStepUpMargin,
      staticCollisionIndex,
      {
        visitAabbsInXZ: (x0, x1, z0, z1, visit, queryPose) => {
          fpElevators.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
          fpApartmentDoors.visitCollisionAabbsInXZ(x0, x1, z0, z1, visit, queryPose);
        },
      },
      opts.locoState.grounded,
    );

    if (dbgActive) {
      logDoorDebugFrame({
        prev: { x: opts.prevPos.x, y: opts.prevPos.y, z: opts.prevPos.z },
        target: { x: tgtX, y: tgtY, z: tgtZ },
        resolved: { x: opts.pos.x, y: opts.pos.y, z: opts.pos.z },
        velocity: { x: opts.locoState.velocity.x, y: opts.locoState.velocity.y, z: opts.locoState.velocity.z },
        crouch: opts.crouch,
      });
    }

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

  const angleDeltaAbs = (a: number, b: number): number =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

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

    const alignHintMs = performance.now();
    // Use `keys` (updated on keydown/keyup), not `_input` (only copied at RAF start). Pose
    // callbacks can run between frames while `_input` still shows last tick’s movement — then
    // reconcile would fire right after key release and feel like rubber-band “snap back”.
    const inputIdleRecon =
      !keys.has("KeyW") &&
      !keys.has("KeyS") &&
      !keys.has("KeyA") &&
      !keys.has("KeyD");
    const onMovingElevatorRider =
      fpElevators.ignoreSmallPoseReconcileWhileMovingElevatorRider(
        pos.x,
        pos.y,
        pos.z,
        alignHintMs,
      );
    // Any time WASD is up, ignore server pose nudges for the whole friction coast — not only
    // after horizontal speed has decayed below a small epsilon (that gap was still reconciling
    // and felt like the same “snap back”).
    const skipFootPoseReconcile = inputIdleRecon && !onMovingElevatorRider;
    if (skipFootPoseReconcile) {
      const rough = Math.hypot(
        serverRow.x - pos.x,
        serverRow.y - pos.y,
        serverRow.z - pos.z,
      );
      // Still hard-resync teleports / huge desync; only ignore sub-threshold idle nudges.
      if (rough <= DISPLAY_HARD_SNAP_M) {
        // Do **not** zero `_displayOffset` here — that ran every 20 Hz while WASD was up and
        // popped the camera/rig (offset is the Source-style error camouflage; let the main loop
        // decay it smoothly).
        return;
      }
    }

    const pendingCount = pendingMoveIntents.length - intentsHead;

    let replayPosForLog: { x: number; y: number; z: number };
    let crouchForLog: boolean;

    if (pendingCount > 0) {
      // Reset pooled replay state — no Vec3 / LocoState allocation.
      // Only physics state is initialised from the server row; visual state (headBobPhase,
      // eyeSmoothed) is intentionally left at whatever the replay pool currently holds.
      // We will NOT copy those back — see below.
      _replayPos.set(serverRow.x, serverRow.y, serverRow.z);
      _replayPrevPos.copy(_replayPos);
      _replayLoco.velocity.set(serverRow.velX, serverRow.velY, serverRow.velZ);
      _replayLoco.grounded = serverRow.grounded !== 0;
      _replayLoco.jumpQueued = false;

      for (let i = intentsHead; i < pendingMoveIntents.length; i++) {
        const sample = pendingMoveIntents[i]!;
        const stepNowMs = sample.evalWallClockMs;
        const isLast = i === pendingMoveIntents.length - 1;
        let stepDt = NET_DT_SEC;
        if (isLast) {
          const wallSec = (alignHintMs - stepNowMs) * 0.001;
          // Live sim integrates with real frame dts since this intent; replay must use the same
          // elapsed wall time (capped at one net interval). A fixed 50 ms last step over-integrates
          // deceleration vs the main loop and reads as the body sliding backward after a stop.
          // (Elevators originally forced this path for cab Y; the same dt mismatch applies on foot.)
          stepDt = Math.min(NET_DT_SEC, Math.max(wallSec, 0.001));
        }
        fpElevators.syncCabEvalClock(stepNowMs);
        inputFromBitsInto(sample.bits, _replayInput);
        _replayStepOpts.evalWallClockMs = stepNowMs;
        _replayStepOpts.dtSec = stepDt;
        _replayStepOpts.crouch = (sample.bits & 64) !== 0;
        _replayStepOpts.jumpPressedThisFrame = (sample.bits & 16) !== 0;
        _replayStepOpts.bodyYawRad = sample.aimYaw;
        simulatePredictedPlayerStep(_replayStepOpts);
      }
      replayPosForLog = { x: _replayPos.x, y: _replayPos.y, z: _replayPos.z };
      crouchForLog = _replayStepOpts.crouch;
    } else {
      // All intents acked — no replay tail, but `player_pose` can still disagree until the next
      // periodic intent lands. Skipping correction here used to pile error into one visible snap.
      _replayLoco.velocity.set(serverRow.velX, serverRow.velY, serverRow.velZ);
      _replayLoco.grounded = serverRow.grounded !== 0;
      replayPosForLog = { x: serverRow.x, y: serverRow.y, z: serverRow.z };
      crouchForLog = crouchToggle;
    }

    const corrX =
      pendingCount > 0 ? _replayPos.x - pos.x : serverRow.x - pos.x;
    const corrY =
      pendingCount > 0 ? _replayPos.y - pos.y : serverRow.y - pos.y;
    const corrZ =
      pendingCount > 0 ? _replayPos.z - pos.z : serverRow.z - pos.z;
    const corrDist = Math.hypot(corrX, corrY, corrZ);
    const ignoreSmallElevRiderPhantom =
      fpElevators.ignoreSmallPoseReconcileWhileMovingElevatorRider(pos.x, pos.y, pos.z, alignHintMs) &&
      corrDist < ELEV_MOVING_RIDER_RECONCILE_SNAP_M;
    logDoorDebugReconcile(
      serverRow,
      { x: pos.x, y: pos.y, z: pos.z },
      replayPosForLog,
      crouchForLog,
      pendingCount,
    );

    if (corrDist > DISPLAY_HARD_SNAP_M) {
      // Large discrepancy (teleport / anti-cheat correction): hard snap everything.
      if (pendingCount > 0) {
        pos.copy(_replayPos);
      } else {
        pos.set(serverRow.x, serverRow.y, serverRow.z);
      }
      _displayOffset.set(0, 0, 0);
      loco.velocity.copy(_replayLoco.velocity);
      loco.grounded = _replayLoco.grounded;
    } else if (corrDist > 0.001 && !ignoreSmallElevRiderPhantom) {
      // Capped step toward replay: avoids a single-frame snap when accumulated error is large.
      const t = Math.min(1, RECONCILE_MAX_CORRECTION_PER_POSE_M / corrDist);
      pos.x += corrX * t;
      pos.y += corrY * t;
      pos.z += corrZ * t;
      _displayOffset.x -= corrX * t;
      _displayOffset.y -= corrY * t;
      _displayOffset.z -= corrZ * t;
      loco.velocity.lerp(_replayLoco.velocity, t);
      loco.grounded = _replayLoco.grounded;
    } else {
      loco.velocity.copy(_replayLoco.velocity);
      loco.grounded = _replayLoco.grounded;
    }
    // Correct physics state only.  Visual-only fields (headBobPhase, eyeSmoothed) are
    // deliberately NOT overwritten: they belong exclusively to the main-loop timeline and must
    // never be disturbed by the 20 Hz reconcile.  Touching them was the root cause of:
    //   • audio hitching  (footstep strideCell jumping forward, firing spurious steps at 20 Hz)
    //   • hand-animation resets  (viewmodel bob phase discontinuously jumping)
    //   • perceived "rubber-band" stutter  (now handled by _displayOffset smooth correction)
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
        fpRigViewSmoothedReady = false;
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

  const sendMoveIntent = (input: FpLocomotionInput, jump: boolean, nowMs: number) => {
    if (!conn.identity) return;
    intentSeq += 1n;
    const bits = encodeMoveIntentBits(input, jump);
    const replacePendingSameStep =
      pendingMoveIntents.length > intentsHead &&
      nowMs - lastMoveIntentMs < MOVE_INTENT_EDGE_WINDOW_MS;
    const sample = {
      seq: intentSeq,
      bits,
      aimYaw: bodyYaw,
      evalWallClockMs: replacePendingSameStep
        ? pendingMoveIntents[pendingMoveIntents.length - 1]!.evalWallClockMs
        : nowMs,
    };
    // Pending replay models one local sample per coarse server step. If a newer edge-triggered
    // publish lands before the next 50 ms step elapses, replace that still-unacked sample instead
    // of appending a second one that the fixed-rate server will never simulate separately.
    if (replacePendingSameStep) pendingMoveIntents[pendingMoveIntents.length - 1] = sample;
    else pendingMoveIntents.push(sample);
    // Guard against runaway growth if the server stops acking (e.g. network drop).
    if (pendingMoveIntents.length - intentsHead > MAX_PENDING_INTENTS) {
      // Drop the oldest un-acked intents; replay will still be correct from the retained window.
      const excess = pendingMoveIntents.length - intentsHead - MAX_PENDING_INTENTS;
      intentsHead += excess;
    }
    lastMoveIntentMs = nowMs;
    lastSentPersistentBits = bits & ~BIT_JUMP;
    lastSentAimYaw = bodyYaw;
    hasSentMoveIntent = true;
    if (jump) jumpIntentLockUntilMs = nowMs + NET_INTERVAL_MS;
    void conn.reducers.submitMoveIntent({ intentSeq, bits, aimYaw: bodyYaw });
  };

  const maybeSendMoveIntent = (
    input: FpLocomotionInput,
    jump: boolean,
    nowMs: number,
  ): void => {
    if (!conn.identity) return;
    if (jump) {
      sendMoveIntent(input, true, nowMs);
      return;
    }
    if (nowMs < jumpIntentLockUntilMs) return;
    const persistentBits = encodeMoveIntentBits(input, false);
    const moving = (persistentBits & MOVE_INTENT_MOVE_BITS) !== 0;
    const periodicDue = !hasSentMoveIntent || nowMs - lastMoveIntentMs >= NET_INTERVAL_MS;
    const bitsChanged = !hasSentMoveIntent || persistentBits !== lastSentPersistentBits;
    const yawChanged =
      moving &&
      hasSentMoveIntent &&
      angleDeltaAbs(bodyYaw, lastSentAimYaw) >= MOVE_INTENT_YAW_EDGE_RAD;
    if (periodicDue || bitsChanged || yawChanged) {
      sendMoveIntent(input, false, nowMs);
    }
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
      // Doors: use predicted feet so range tests match what you see while moving; server still
      // validates with pose + client feet hint.
      if (fpElevators.consumeInteractKey(pos, camera)) return;
      if (fpElevators.shouldSuppressEpickup(pos, camera)) return;
      if (fpApartmentDoors.consumeInteractKey(pos)) return;
      if (fpApartmentDoors.shouldSuppressEpickup(pos)) return;
      droppedWorld.tryPickupNearest(interactionPos.x, interactionPos.y, interactionPos.z);
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
      sendMoveIntent(jumpInput, true, performance.now());
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
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 2) {
      if (__mmWallProbeState.enabled) {
        e.preventDefault();
        probeWallHit();
      }
      return;
    }
    if (!e.isPrimary || e.button !== 0) return;
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
  let grassElapsedSec = 0;

  const tick = () => {
    raf = requestAnimationFrame(tick);
    // Single performance.now() for the whole tick — avoids redundant syscalls and keeps
    // sub-systems consistent with the same timestamp.
    const nowMs = performance.now();
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
    lastFrameMs = nowMs;

    if (meleePressPending) {
      meleePressPending = false;
      const hb = selectedHotbarRow();
      if (
        hb &&
        hotbarDefIdSupportsMeleeAttack(hb.defId) &&
        nowMs - lastMeleeMs >= MELEE_COOLDOWN_MS
      ) {
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
    fpElevators.syncCabEvalClock(nowMs, dt);
    prevPos.copy(pos);

    // --- Physics section timing ---
    _mainStepOpts.dtSec = dt;
    _mainStepOpts.evalWallClockMs = nowMs;
    _mainStepOpts.crouch = crouchToggle;
    _mainStepOpts.jumpPressedThisFrame = jumpQueuedBeforeStep;
    _mainStepOpts.bodyYawRad = bodyYaw;
    const headY = simulatePredictedPlayerStep(_mainStepOpts);
    const _t_physicsEnd = performance.now();
    fpCollisionDebug.update(pos, loco.velocity);

    // --- Elevator section timing ---
    fpElevators.tick(dt, nowMs, pos);
    fpElevators.syncLandingHailUi(camera, pos, nowMs);
    fpApartmentDoors.tick(nowMs);
    const _t_elevEnd = performance.now();

    // Decay the display offset — exponential approach to zero each frame.
    // Any server correction applied this frame (or earlier) smoothly blends out.
    const probeTopElevDecay = pos.y + fpLocomotionConstants.walkProbeDy;
    _elevSupportEval.worldX = pos.x;
    _elevSupportEval.worldZ = pos.z;
    _elevSupportEval.probeTopY = probeTopElevDecay;
    _elevSupportEval.baseTop = sampleWalkTopBase(pos.x, pos.z, probeTopElevDecay);
    _elevSupportEval.evalWallClockMs = nowMs;
    lastTickElevSupportVyMps = getKinematicSupportVerticalVelocityMps(
      fpElevators.kinematicSupport,
      _elevSupportEval,
    );
    lastTickHudCabVyMps = fpElevators.getHudMovingCabVyMps(pos.x, pos.y, pos.z, nowMs);
    lastTickElevVyBlendAbs = Math.max(
      Math.abs(lastTickElevSupportVyMps),
      Math.abs(lastTickHudCabVyMps),
    );
    const fastElevY = lastTickElevVyBlendAbs >= ELEVATOR_KINEMATIC_FAST_ABS_VY_MPS;
    const hs = Math.hypot(loco.velocity.x, loco.velocity.z);
    const inputIdle =
      !_input.forward && !_input.backward && !_input.left && !_input.right;
    const viewSettledIdle =
      inputIdle && hs < VIEW_SETTLED_IDLE_MAX_HS && !fastElevY;
    const offNonZero =
      _displayOffset.x !== 0 || _displayOffset.y !== 0 || _displayOffset.z !== 0;
    if (viewSettledIdle) {
      // `rtx = pos + offset` must not drift from decay after key release: bake offset into physics
      // (world-space target unchanged) so the camera stays exactly where it was.
      if (offNonZero) {
        pos.x += _displayOffset.x;
        pos.y += _displayOffset.y;
        pos.z += _displayOffset.z;
        _displayOffset.set(0, 0, 0);
      }
    } else if (!inputIdle && offNonZero) {
      const k = Math.exp(-DISPLAY_OFFSET_DAMP * dt);
      const kY = fastElevY
        ? Math.exp(-DISPLAY_OFFSET_DAMP * DISPLAY_OFFSET_ELEVATOR_Y_DAMP_SCALE * dt)
        : k;
      _displayOffset.x *= k;
      _displayOffset.y *= kY;
      _displayOffset.z *= k;
      clampTinyDisplayOffsetComponents(_displayOffset);
    } else if (inputIdle && fastElevY && offNonZero) {
      // Keys up on a fast-moving cab: still decay (mostly Y) so vertical reconcile does not stick.
      const k = Math.exp(-DISPLAY_OFFSET_DAMP * dt);
      const kY = Math.exp(-DISPLAY_OFFSET_DAMP * DISPLAY_OFFSET_ELEVATOR_Y_DAMP_SCALE * dt);
      _displayOffset.x *= k;
      _displayOffset.y *= kY;
      _displayOffset.z *= k;
      clampTinyDisplayOffsetComponents(_displayOffset);
    }
    // else: WASD up, foot friction coast — hold offset so `rtx` tracks `pos` only (no idle decay).

    // Render at physics position + smooth display offset (extra ease on the mesh only).
    const rtx = pos.x + _displayOffset.x;
    const rty = pos.y + _displayOffset.y;
    const rtz = pos.z + _displayOffset.z;
    if (!fpRigViewSmoothedReady) {
      _rigViewScratch.set(rtx, rty, rtz);
      fpRigViewSmoothedReady = true;
    } else if (viewSettledIdle) {
      // Only snap rig once friction tail is gone — instant follow on raw key-up bypassed easing
      // during the coast and read as a sharp stop/jerk next to 20 Hz reconcile.
      _rigViewScratch.set(rtx, rty, rtz);
    } else if (PLAYER_RIG_VIEW_LERP_PER_S > 1e-3) {
      const rigLerpPerS = PLAYER_RIG_VIEW_LERP_PER_S;
      const a = 1 - Math.exp(-rigLerpPerS * dt);
      const aXZ = fastElevY
        ? 1 -
          Math.exp(-rigLerpPerS * PLAYER_RIG_VIEW_XZ_ELEV_LERP_MULT * dt)
        : a;
      const aY = fastElevY
        ? 1 -
          Math.exp(-rigLerpPerS * PLAYER_RIG_VIEW_Y_ELEV_LERP_MULT * dt)
        : a;
      _rigViewScratch.x += (rtx - _rigViewScratch.x) * aXZ;
      _rigViewScratch.y += (rty - _rigViewScratch.y) * aY;
      _rigViewScratch.z += (rtz - _rigViewScratch.z) * aXZ;
    } else {
      _rigViewScratch.set(rtx, rty, rtz);
    }
    if (Math.hypot(rtx - _rigViewScratch.x, rty - _rigViewScratch.y, rtz - _rigViewScratch.z) > 2.5) {
      _rigViewScratch.set(rtx, rty, rtz);
    }
    playerRig.position.copy(_rigViewScratch);
    playerRig.rotation.y = bodyYaw;
    headPivot.position.y = headY;
    headPivot.rotation.set(0, 0, 0);
    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    // Alt: yaw + pitch on the camera chain only — weapon stays body-level on pitch (neck look).
    headPitch.rotation.x = freeLook ? 0 : pitch;
    headCameraPitch.rotation.x = pitch;
    headFreeLook.rotation.y = headLookYaw;
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
    const suppressHeadBobForElev =
      Math.abs(lastTickHudCabVyMps) >= ELEV_HEAD_BOB_SUPPRESS_MIN_HUD_CAB_VY_MPS;
    if (loco.grounded && !crouchToggle && !freeLook && hs > 0.12 && !suppressHeadBobForElev) {
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

    maybeSendMoveIntent(_input, jumpQueuedBeforeStep, nowMs);

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

    presentation.setLocalFpGameplayStockHandVisible(
      hotbarHeld !== "unarmed" || hotbarConsumableDefId !== null,
    );

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
      const apartmentPrompt = doorPrompt ? null : fpApartmentDoors.getInteractPrompt(pos);
      if (doorPrompt) {
        setFpPickupPrompt({
          kind: "elevator_exterior_door",
          willClose: doorPrompt.willClose,
          floorLabel: doorPrompt.floorLabel,
        });
      } else if (apartmentPrompt) {
        setFpPickupPrompt({
          kind: "apartment_door",
          willClose: apartmentPrompt.willClose,
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
    grassElapsedSec += dt;
    fpGrass.tick(camera, grassElapsedSec);
    renderer.render(scene, camera);
    const _t_renderEnd = performance.now();
    const physicsMs = _t_physicsEnd - nowMs;
    const elevatorMs = _t_elevEnd - _t_physicsEnd;
    const presentMs = _t_presentEnd - _t_elevEnd;
    const renderMs = _t_renderEnd - _t_presentEnd;
    const totalFrameMs = _t_renderEnd - nowMs;

    if (__mmElevDebugState.enabled) {
      camera.getWorldPosition(_floorVisCamWorld);
      camera.getWorldDirection(_floorVisCamDir);
      const ride = fpElevators.sampleRideDebug(
        pos.x,
        pos.y,
        pos.z,
        nowMs,
        _floorVisCamWorld.y,
        _floorVisCamDir.y,
      );
      const riding = ride != null;
      if (riding) {
        __mmElevDebugState.hudMissStreak = 0;
        __mmElevDebugState.seenRideHud = true;
      } else if (__mmElevDebugState.seenRideHud) {
        __mmElevDebugState.hudMissStreak += 1;
        if (__mmElevDebugState.hudMissStreak >= ELEV_DEBUG_EXIT_DEBOUNCE_FRAMES) {
          printElevDebugJson("exit", {
            nowMs: +nowMs.toFixed(1),
            note: `No HUD cab sample for ${ELEV_DEBUG_EXIT_DEBOUNCE_FRAMES}+ frames (left car, docked, or phase idle).`,
          });
          __mmElevDebugState.hudMissStreak = 0;
          __mmElevDebugState.seenRideHud = false;
        }
      }
      const periodicDue =
        riding && nowMs - __mmElevDebugState.lastPeriodicLogMs >= __mmElevDebugState.intervalMs;
      const slowFrame = totalFrameMs >= __mmElevDebugState.hitchMs;
      const logSlow = slowFrame && (riding || __mmElevDebugState.logSlowFramesAlways);
      if (periodicDue || logSlow) {
        if (periodicDue) __mmElevDebugState.lastPeriodicLogMs = nowMs;
        const displayOffLen = Math.hypot(_displayOffset.x, _displayOffset.y, _displayOffset.z);
        printElevDebugJson("frame", {
          frameMs: +totalFrameMs.toFixed(2),
          dtSec: +dt.toFixed(4),
          slow: slowFrame,
          periodic: periodicDue,
          physicsMs: +physicsMs.toFixed(3),
          elevatorMs: +elevatorMs.toFixed(3),
          presentMs: +presentMs.toFixed(3),
          renderMs: +renderMs.toFixed(3),
          displayOffsetM: +displayOffLen.toFixed(4),
          offsetSpike: displayOffLen > 0.2,
          elevSupportVyMps: +lastTickElevSupportVyMps.toFixed(3),
          hudCabVyMps: +lastTickHudCabVyMps.toFixed(3),
          elevVyBlendAbs: +lastTickElevVyBlendAbs.toFixed(3),
          ride,
        });
      }
    }

    onFpSessionPostRenderFrame(nowMs);
    logFpPerf();
    pushFpPerfFrame(
      nowMs,
      totalFrameMs,
      {
        physicsMs,
        elevatorMs,
        presentMs,
        renderMs,
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
    fpApartmentDoors.dispose();
    try {
      const g = globalThis as unknown as { __mmDoorDebug?: typeof __mmDoorDebugApi };
      if (g.__mmDoorDebug === __mmDoorDebugApi) delete g.__mmDoorDebug;
    } catch {
      /* ignore */
    }
    try {
      const g = globalThis as unknown as { __mmWallProbe?: typeof __mmWallProbeApi };
      if (g.__mmWallProbe === __mmWallProbeApi) delete g.__mmWallProbe;
    } catch {
      /* ignore */
    }
    try {
      const g = globalThis as unknown as { __mmElevDebug?: typeof __mmElevDebugApi };
      if (g.__mmElevDebug === __mmElevDebugApi) delete g.__mmElevDebug;
    } catch {
      /* ignore */
    }
    droppedWorld.dispose();
    fpGrass.dispose();
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

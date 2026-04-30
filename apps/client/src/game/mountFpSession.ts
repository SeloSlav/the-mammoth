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
  PlayerPresentationManager,
  type FpLocomotionInput,
} from "@the-mammoth/engine";
import type { ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  ensureStairwellCigaretteMeshReady,
  maxBuildingLevelIndex,
  parseFloorDoc,
} from "@the-mammoth/world";
import {
  POSE_AOI_RECENTER_Y_M,
  POSE_AOI_Y_HALF_M,
} from "./fpRemote/remotePlayerVisibility.js";
import {
  appendApartmentFurnitureInteriorMeshes,
  collectFpSessionUnitInteriorShellMeshes,
  stripApartmentFurnitureInteriorMeshes,
} from "./fpSession/fpSessionUnitInteriorShellMeshes.js";
import { installFpSessionTransientDebugConsole } from "./fpSession/fpSessionTransientDebugConsole.js";
import { createFpSessionFloorPlateVisibility } from "./fpSession/fpSessionFloorPlateVisibility.js";
import { createFpSessionMoveIntentChannel } from "./fpSession/fpSessionMoveIntentChannel.js";
import {
  createFpSessionMainRafFrame,
  type FpSessionMainRafState,
} from "./fpSession/fpSessionMainRafFrame.js";
import {
  wireFpSessionLocomotionPrediction,
} from "./fpSession/fpSessionLocomotionPredictionWiring.js";
import {
  type FpSessionMoveIntentQueue,
} from "./fpSession/fpSessionLocalPrediction.js";
import { installFpSessionDevDebugApis } from "./fpSession/fpSessionDevDebugApis.js";
import { installMmWallProbeLoadingStub } from "./fpSession/fpSessionWallProbeStub.js";
import { createFpSessionStaticWorld } from "./fpSession/fpSessionWorldMount.js";
import { feedRemotePoseSample, type FpRemotePoseLastXZ } from "./fpSession/fpSessionRemotePoseFeed.js";
import { floorPayloadByDocId } from "./fpSession/fpSessionContentLoad.js";
import { PoseInterpBuffer } from "./fpRemote/poseInterpBuffer.js";
import { effectiveDevGameplayEquippedPrimary } from "./fpDev/devGameplayWeaponOverride.js";
import {
  fpHotbarDigitKeySuppressedByDebounce,
  HOTBAR_SLOT_COUNT,
  hotbarSlotHasInstantConsume,
} from "./fpHotbar/fpHotbarActivate.js";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "./fpHotbar/fpHotbarSelection.js";
import { getHotbarSlotInventoryItem } from "./fpHotbar/fpHotbarResolve.js";
import {
  apartmentFurnitureInteriorsPreferOverUnitDoor,
  getApartmentSystemPrompt,
} from "./fpApartment/fpApartmentGameplay.js";
import {
  attachFpSessionEnvironment,
  FP_SESSION_SKY_CAMERA_FAR,
} from "./fpSession/fpSessionEnvironment.js";
import { resetFpSessionFpsDisplay } from "./fpSession/fpSessionFpsDisplay.js";
import {
  resetFpSessionGameUiHidden,
  toggleFpSessionGameUiHidden,
} from "./fpSession/fpSessionGameUiHidden.js";
import { createFpSessionPerfDebugPostRenderHook } from "./fpSession/fpSessionPerfDebug.js";
import { mountFpApartmentDoors } from "./fpApartment/fpApartmentDoors.js";
import {
  isApartmentUnitBoundsDebugEnabled,
  mountFpApartmentFurniture,
} from "./fpApartment/fpApartmentFurniture.js";
import { ElevatorCabMotionAudio } from "./audio/elevatorCabMotionAudio.js";
import { mountFpElevatorWorld } from "./fpElevator/fpElevatorWorld.js";
import { mountFpViewmodelAuthoringDevOnly } from "./fpDev/fpViewmodelAuthoringOverlay.js";
import { mountWeaponPresentationDevHotReload } from "./fpDev/weaponPresentationDevHotReload.js";
import { mountWorldContentDevReload } from "./fpDev/fpWorldContentDevReload.js";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import { LocalGameAudio } from "./audio/localGameAudio.js";
import {
  primeHotbarConsumeAudio,
  registerHotbarConsumeLocalPlayback,
  registerHotbarConsumePrimeAudio,
  unregisterHotbarConsumeLocalAudio,
} from "./fpHotbar/hotbarConsumeLocalAudio.js";
import { registerGameAudioPrime } from "./audio/gameAudioPrime.js";
import { FpBackgroundMusic } from "./audio/fpBackgroundMusic.js";
import {
  getFpBackgroundMusicEnabled,
  subscribeFpBackgroundMusicEnabled,
} from "./audio/fpBackgroundMusicState.js";
import { runFpHotbarInstantConsume } from "./fpHotbar/fpHotbarConsume.js";
import {
  droppedItemIsWorldAnchor,
  findNearestDroppedPickup,
  MAMMOTH_PICKUP_RADIUS_M,
  mountDroppedItemsWorld,
} from "./worldRuntime/droppedItemWorldRuntime.js";
import { setFpPickupPrompt } from "./fpInteraction/fpPickupPrompt.js";
import { WorldProximityAudio } from "./audio/worldProximityAudio.js";
import { ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS } from "./fpElevator/fpElevatorConstants.js";
import { poseSeqAsBigint } from "./fpSession/fpSessionPoseSeq.js";
import { resolveAuthoritativeInteractionPose } from "./fpInteraction/fpInteractionAuthority.js";
import { resetFpPerfStore } from "./fpSession/fpSessionPerfStore.js";
import { FpHotbarConsumableVisual } from "./fpHotbar/fpHotbarConsumableVisual.js";
import { createFpCollisionDebugOverlay } from "./fpSession/fpSessionCollisionDebug.js";
import { createFpPlanarMirrorFromPlaceholder, type FpPlanarMirror } from "./fpRendering/fpPlanarMirror.js";
import {
  FP_MIRROR_SELF_RENDER_LAYER,
  FP_SESSION_MAX_PIXEL_RATIO,
  FP_SESSION_WEBGPU_ANTIALIAS,
  FP_VIEWMODEL_RENDER_LAYER,
  FREE_LOOK_YAW_MAX,
  MOUSE_SENS,
  NET_DT_SEC,
  PITCH_LIMIT,
  POSE_AOI_HALF,
  WORLD_SOUND_AOI_HALF,
} from "./fpSession/fpSessionConstants.js";
import {
  DecalManager,
  DECAL_MANIFEST,
  generateStairwellDecalPlacements,
} from "../rendering/decals/index.js";
import { isTextInputFocused } from "./isTextInputFocused.js";

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
  opts: { apartmentClaimsAllowed?: boolean } = {},
): Promise<() => void> {
  installMmWallProbeLoadingStub();
  await assertWebGpuAdapterOrThrow();
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: FP_SESSION_WEBGPU_ANTIALIAS,
    forceWebGL: false,
  });
  await renderer.init();
  assertWebGpuRendererBackend(renderer);
  resetFpSessionFpsDisplay();
  resetFpSessionGameUiHidden();
  const logFpPerf = createFpSessionPerfDebugPostRenderHook(renderer);
  const fpEnvironment = attachFpSessionEnvironment(scene, renderer);

  const { rig: playerRig, headPivot, headPitch, headCameraPitch, headFreeLook, camera } =
    createFPRig(fpLocomotionConstants.eyeStand);
  /** Skydome is a large inner sphere; default rig `far` (900) clips it to black. */
  camera.far = FP_SESSION_SKY_CAMERA_FAR;
  scene.add(playerRig);
  const fpCollisionDebug = createFpCollisionDebugOverlay();
  scene.add(fpCollisionDebug.group);

  void ensureStairwellCigaretteMeshReady();

  const {
    building,
    buildingRoot,
    cellRoot,
    staticCollisionIndex,
    sampleWalkTopBase,
    stairShaftInteriorLightBounds,
    stairShaftSpecs,
  } = createFpSessionStaticWorld();
  scene.add(buildingRoot);
  scene.add(cellRoot);
  buildingRoot.updateMatrixWorld(true);
  cellRoot.updateMatrixWorld(true);
  const buildingWorldBounds = new THREE.Box3().setFromObject(buildingRoot);
  const maxBuildingLevel = maxBuildingLevelIndex(building);

  /**
   * Get something real onto the canvas before async apartment props, decals, and presentation assets
   * finish. Without this bootstrap frame, React has already swapped to the FP canvas but the browser
   * only has a cleared black surface until the full RAF driver starts near the end of this mount.
   */
  const renderBootstrapFrame = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, FP_SESSION_MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  renderBootstrapFrame();

  const fpElevators = mountFpElevatorWorld({
    conn,
    buildingRoot,
    building,
    getFloorDoc: (id) => parseFloorDoc(floorPayloadByDocId(id)),
    floorVisPitchLookaheadWorldBoundsXz: {
      minX: buildingWorldBounds.min.x,
      maxX: buildingWorldBounds.max.x,
      minZ: buildingWorldBounds.min.z,
      maxZ: buildingWorldBounds.max.z,
    },
  });

  const fpApartmentDoors = mountFpApartmentDoors({
    conn,
    buildingRoot,
    building,
  });

  const unitInteriorMeshes = collectFpSessionUnitInteriorShellMeshes(buildingRoot);
  const apartmentFurnitureInteriorMeshes: THREE.Mesh[] = [];

  const fpApartmentFurniture = await mountFpApartmentFurniture({
    conn,
    buildingRoot,
    showUnitBoundsDebug: isApartmentUnitBoundsDebugEnabled(),
    onRebuilt: () => {
      stripApartmentFurnitureInteriorMeshes(unitInteriorMeshes);
      apartmentFurnitureInteriorMeshes.length = 0;
      appendApartmentFurnitureInteriorMeshes(buildingRoot, unitInteriorMeshes);
      appendApartmentFurnitureInteriorMeshes(buildingRoot, apartmentFurnitureInteriorMeshes);
    },
  });

  let sessionDisposed = false;
  const decalManager = new DecalManager(scene, renderer);
  void (async () => {
    try {
      await decalManager.preloadManifest(DECAL_MANIFEST);
      if (sessionDisposed) return;
      await decalManager.loadPlacements(
        generateStairwellDecalPlacements(buildingRoot, stairShaftSpecs),
        buildingRoot,
      );
      if (sessionDisposed) return;
      unitInteriorMeshes.push(...decalManager.getMeshes());
    } catch (err) {
      if (!sessionDisposed) {
        console.warn("[mountFpSession] failed to load stairwell decals", err);
      }
    }
  })();
  installFpSessionTransientDebugConsole({ scene, buildingRoot, cellRoot, renderer });

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
  const cabMirrorPlaceholders: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothCabMirror !== true) return;
    cabMirrorPlaceholders.push(obj);
  });
  const cabMirrors: FpPlanarMirror[] = cabMirrorPlaceholders.map((mesh) =>
    createFpPlanarMirrorFromPlaceholder(mesh),
  );
  headPitch.traverse((obj) => obj.layers.set(FP_VIEWMODEL_RENDER_LAYER));
  camera.layers.enable(FP_VIEWMODEL_RENDER_LAYER);
  presentation.setLocalMirrorAvatarLayer(FP_MIRROR_SELF_RENDER_LAYER);
  presentation.setLocalMirrorAvatarVisible(true);

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
  const _rigViewScratch = new THREE.Vector3();
  const _aimShotWorldDir = new THREE.Vector3();

  const { syncBuildingFloorPlateVisibility, isInsideElevatorCabHudForJump } =
    createFpSessionFloorPlateVisibility({
      camera,
      buildingRoot,
      buildingWorldBounds,
      maxBuildingLevel,
      storeyOpts: {
        buildingWorldOriginY: building.worldOrigin?.[1] ?? 0,
        floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
        maxLevel: maxBuildingLevel,
      },
      unitInteriorMeshes,
      apartmentFurnitureInteriorMeshes,
      fpElevators,
      stairShaftInteriorLightBounds,
      feetPos: pos,
      floorVisCamWorld: _floorVisCamWorld,
      floorVisCamDir: _floorVisCamDir,
    });

  const getInteractionPos = () => {
    const p = resolveAuthoritativeInteractionPose(pos, serverPose);
    _interactionPos.set(p.x, p.y, p.z);
    return _interactionPos;
  };

  const mainRaf: FpSessionMainRafState = {
    bodyYaw: 0,
    pitch: 0,
    headLookYaw: 0,
    crouchToggle: false,
    meleePressPending: false,
    fpRigViewSmoothedReady: false,
    lastTickElevSupportVyMps: 0,
    lastTickHudCabVyMps: 0,
    lastTickElevVyBlendAbs: 0,
    stairwellInteriorDarkSmoothed: 0,
    meleeAttackSeq: 0,
    firearmShotSeq: 0,
    lastMeleeMs: 0,
    lastRangedMs: 0,
  };
  const moveIntentQueue: FpSessionMoveIntentQueue = { items: [], head: 0 };
  /** Max un-acked intents to retain (1.5 s buffer); older ones are compacted away. */
  const MAX_PENDING_INTENTS = 30;

  const keys = new Set<string>();
  const loco = createFpLocomotionState();

  // ---------------------------------------------------------------------------
  // Object pools — pre-allocated once, mutated in place every frame/tick.
  // Eliminates the GC pressure that causes frame-time spikes near busy geometry.
  // ---------------------------------------------------------------------------

  /** Pre-allocated input state — mutated in the main tick loop (no object literal per frame). */
  const _input: FpLocomotionInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    jumpHeld: false,
  };

  /** Pre-allocated input for reconcile replay (avoid allocating inside the replay loop). */
  const _replayInput: FpLocomotionInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    jumpHeld: false,
  };

  /** Pre-allocated remote snapshot map — cleared each frame instead of constructed anew. */
  const _remoteSnapshots = new Map<string, ReplicatedPlayerSnapshot>();

  /** Reconcile replay pools — reset in place on every server update (20 Hz); avoid 3× Vec3. */
  const _replayPos = new THREE.Vector3();
  const _replayPrevPos = new THREE.Vector3();
  /** Feet pose before a reconcile nudge — passed to `resolvePlayerCollisions` as `prevPos`. */
  const _reconcilePosBefore = new THREE.Vector3();
  const _replayLoco = createFpLocomotionState();

  const {
    doorDebugState: __mmDoorDebugState,
    wallProbeState: __mmWallProbeState,
    logDoorDebugFrame,
    logDoorDebugReconcile,
    probeWallHit,
    tickElevDebug: tickFpSessionElevDebug,
    dispose: disposeFpSessionDevDebug,
  } = installFpSessionDevDebugApis({
    playerPos: pos,
    camera,
    buildingRoot,
    building,
    staticCollisionIndex,
    fpApartmentDoors,
    fpElevators,
  });

  const { _mainStepOpts, _elevSupportEval, simulatePredictedPlayerStep, reconcileLocalPredictionToServer } =
    wireFpSessionLocomotionPrediction({
      pos,
      prevPos,
      loco,
      keys,
      _input,
      _replayInput,
      _replayPos,
      _replayPrevPos,
      _replayLoco,
      _reconcilePosBefore,
      moveIntentQueue,
      mainRaf,
      displayOffset: _displayOffset,
      netDtSec: NET_DT_SEC,
      sampleWalkTopBase,
      fpElevators,
      fpApartmentDoors,
      staticCollisionIndex,
      doorDebugState: __mmDoorDebugState,
      logDoorDebugFrame,
      logDoorDebugReconcile,
      elevatorRiderLockSkipUpwardVyMps: ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS,
    });

  const { intentSeq, sendMoveIntent, maybeSendMoveIntent } = createFpSessionMoveIntentChannel({
    conn,
    mainRaf,
    moveIntentQueue,
    maxPendingIntents: MAX_PENDING_INTENTS,
  });

  /** Footsteps: Web Audio, up to six `public/audio/ui/footstep*.wav`; see `audio/localGameAudio.ts`. */
  const localAudio = new LocalGameAudio();
  registerHotbarConsumePrimeAudio(() => localAudio.unlock());
  registerHotbarConsumeLocalPlayback((profile) => localAudio.playHotbarConsumeLocal(profile));
  const worldAudio = new WorldProximityAudio(conn, () => camera);
  let worldAudioReady = false;
  const cabMotionAudio = new ElevatorCabMotionAudio(() => camera);
  let cabMotionAudioReady = false;
  const _backgroundAudioWorldPos = new THREE.Vector3();
  const backgroundMusic = new FpBackgroundMusic(() => {
    camera.updateMatrixWorld(true);
    camera.getWorldPosition(_backgroundAudioWorldPos);
    return _backgroundAudioWorldPos;
  });
  backgroundMusic.setEnabled(getFpBackgroundMusicEnabled());
  const unsubscribeBackgroundMusicEnabled = subscribeFpBackgroundMusicEnabled(() => {
    backgroundMusic.setEnabled(getFpBackgroundMusicEnabled());
  });

  /** Subscribes immediately with pose AOI — must not wait for audio unlock: inserts are only replicated for active `world_sound_event` queries. */
  const refreshWorldSoundSubscription = () => {
    worldAudio.subscribeAoi(poseAoiAnchor.x, poseAoiAnchor.z, WORLD_SOUND_AOI_HALF);
  };

  const attachSpatialWorldAudio = async (): Promise<void> => {
    await localAudio.unlock();
    const actx = localAudio.getAudioContext();
    if (!actx) return;
    await worldAudio.attachSharedContext(actx, localAudio.getFootstepBuffers());
    worldAudioReady = true;
    cabMotionAudioReady = await cabMotionAudio.attachSharedContext(actx);
    void backgroundMusic.attachSharedContext(actx);
    refreshWorldSoundSubscription();
  };
  registerGameAudioPrime(attachSpatialWorldAudio);

  /**
   * Browsers often skip `keyup` when the tab/window loses focus — keys (including Alt) stay in
   * `keys`, so free-look stays latched and mouse X only drives `headLookYaw` until Alt “releases”.
   *
   * Before clearing keys, **bake** `headLookYaw` into `bodyYaw` so the horizontal view direction
   * (body + free-look) does not jump when we drop Alt from `keys` or zero out free-look. Intentional
   * Alt key-up still clears head offset without merging — see `onKeyUp`.
   */
  const commitFreeLookIntoBodyYaw = () => {
    if (mainRaf.headLookYaw !== 0) {
      mainRaf.bodyYaw += mainRaf.headLookYaw;
      mainRaf.headLookYaw = 0;
      mainRaf.bodyYaw = Math.atan2(Math.sin(mainRaf.bodyYaw), Math.cos(mainRaf.bodyYaw));
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
        mainRaf.bodyYaw = row.yaw;
        _displayOffset.set(0, 0, 0);
        mainRaf.fpRigViewSmoothedReady = false;
        spawnSynced = true;
      } else {
        reconcileLocalPredictionToServer(row);
      }
      const serverSeq = poseSeqAsBigint(row.seq);
      if (serverSeq > intentSeq.current) intentSeq.current = serverSeq;
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
      await attachSpatialWorldAudio();
      localAudio.playItemPickLocal();
    },
  });

  let poseAoiSub: SubscriptionHandle | null = null;
  const poseAoiAnchor = { x: pos.x, y: pos.y, z: pos.z };

  const subscribePoseAoi = (cx: number, cy: number, cz: number) => {
    const selfId = conn.identity;
    if (!selfId) return;
    if (poseAoiSub?.isActive()) {
      poseAoiSub.unsubscribe();
    }
    const x0 = cx - POSE_AOI_HALF;
    const x1 = cx + POSE_AOI_HALF;
    const y0 = cy - POSE_AOI_Y_HALF_M;
    const y1 = cy + POSE_AOI_Y_HALF_M;
    const z0 = cz - POSE_AOI_HALF;
    const z1 = cz + POSE_AOI_HALF;
    const query = tables.player_pose.where((r) =>
      or(
        r.identity.eq(selfId),
        and(
          r.x.gte(x0),
          r.x.lte(x1),
          r.y.gte(y0),
          r.y.lte(y1),
          r.z.gte(z0),
          r.z.lte(z1),
        ),
      ),
    );
    poseAoiSub = conn
      .subscriptionBuilder()
      .onApplied(() => {
        syncAllPoses();
      })
      .subscribe(query);
    poseAoiAnchor.x = cx;
    poseAoiAnchor.y = cy;
    poseAoiAnchor.z = cz;
    refreshWorldSoundSubscription();
    droppedWorld.subscribeAoi(cx, cz);
  };

  subscribePoseAoi(poseAoiAnchor.x, poseAoiAnchor.y, poseAoiAnchor.z);

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, FP_SESSION_MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(canvas);

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

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isTextInputFocused()) keys.add(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      e.preventDefault();
    }
    if (
      e.code === "KeyZ" &&
      e.altKey &&
      !e.repeat &&
      !isTextInputFocused()
    ) {
      e.preventDefault();
      toggleFpSessionGameUiHidden();
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
      /** Same blend as RAF pickup prompts ({@link resolveAuthoritativeInteractionPose}). */
      const feet = getInteractionPos();
      if (fpElevators.consumeInteractKey(pos, camera)) return;
      const suppressElevPickup = fpElevators.shouldSuppressEpickup(feet, camera);
      const lookedAtStash = conn.identity
        ? fpApartmentFurniture.getStashPrompt(feet, camera)
        : null;
      const aptKey = conn.identity
        ? getApartmentSystemPrompt(conn, feet, {
            lookedAtStashUnitKey: lookedAtStash?.unitKey ?? null,
          })
        : null;
      /** Wardrobe/stash HUD must win overlaps with hoistway/corridor elevator volumes (parity with RAF). */
      const interiorBeatElevPickup =
        aptKey !== null && apartmentFurnitureInteriorsPreferOverUnitDoor(aptKey);
      if (suppressElevPickup && !interiorBeatElevPickup) return;
      if (!conn.identity) {
        droppedWorld.tryPickupNearest(feet.x, feet.y, feet.z);
        return;
      }

      if (
        aptKey?.kind === "apartment_claim" ||
        aptKey?.kind === "apartment_claim_blocked_gear"
      ) {
        // Hold-to-claim uses RAF pulses; do not let a nearby world-anchor drop steal this keypress.
        return;
      }

      if (fpApartmentDoors.consumeInteractKey(feet, camera)) return;
      if (fpApartmentDoors.shouldSuppressEpickup(feet, camera)) return;

      if (aptKey?.kind === "apartment_stash") {
        const slot = getFpHotbarSelectedSlot();
        if (slot !== null) {
          const it = getHotbarSlotInventoryItem(conn, conn.identity, slot);
          if (it) {
            void conn.reducers.stashPushItem({
              itemInstanceId: it.instanceId,
              unitKey: aptKey.unitKey,
            });
            return;
          }
        }
      }

      const nearWorld = findNearestDroppedPickup(
        conn,
        feet.x,
        feet.y,
        feet.z,
        MAMMOTH_PICKUP_RADIUS_M,
        droppedItemIsWorldAnchor,
      );
      if (nearWorld) {
        void conn.reducers.pickupDroppedItem({ droppedItemId: nearWorld.droppedItemId });
        return;
      }

      droppedWorld.tryPickupNearest(feet.x, feet.y, feet.z);
    }
    if (e.code === "KeyC" && !e.repeat && !isTextInputFocused()) {
      mainRaf.crouchToggle = !mainRaf.crouchToggle;
    }
    if (e.code === "Space" && !e.repeat && !isTextInputFocused()) {
      if (isInsideElevatorCabHudForJump()) {
        e.preventDefault();
        return;
      }
      queueFpJump(loco);
      // Build a one-shot input snapshot for the jump intent; _input may not be current yet
      // (tick hasn't run), so read keys directly here.
      const jumpInput: FpLocomotionInput = {
        forward: keys.has("KeyW"),
        backward: keys.has("KeyS"),
        left: keys.has("KeyA"),
        right: keys.has("KeyD"),
        sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        crouch: mainRaf.crouchToggle,
        jumpHeld: keys.has("Space"),
      };
      sendMoveIntent(jumpInput, true, performance.now());
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    if (e.code === "AltLeft" || e.code === "AltRight") {
      mainRaf.headLookYaw = 0;
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    const freeLook = keys.has("AltLeft") || keys.has("AltRight");
    if (freeLook) {
      mainRaf.headLookYaw -= e.movementX * MOUSE_SENS;
      mainRaf.headLookYaw = Math.max(
        -FREE_LOOK_YAW_MAX,
        Math.min(FREE_LOOK_YAW_MAX, mainRaf.headLookYaw),
      );
    } else {
      mainRaf.bodyYaw -= e.movementX * MOUSE_SENS;
    }
    mainRaf.pitch -= e.movementY * MOUSE_SENS;
    mainRaf.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, mainRaf.pitch));
  };

  const onClick = () => {
    void attachSpatialWorldAudio();
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };

  /** HUD layers use `pointer-events: none` in gaps; suppress the browser menu on the world view. */
  const onCanvasContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (fpAuthoringActiveRef.active) return;
    if (document.pointerLockElement !== canvas) return;
    // Match server combat rail (`player_active_hotbar`) to HUD selection before enqueueing attack.
    syncActiveHotbarSlotToServer();
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
    if (conn.identity && fpApartmentDoors.consumeInteractKey(getInteractionPos(), camera)) return;
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
    mainRaf.meleePressPending = true;
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

  const fpInteractInputBlocked = () => mammothInventoryOpen() || isTextInputFocused();

  const { runFrame } = createFpSessionMainRafFrame({
    mainRaf,
    canvas,
    scene,
    renderer,
    camera,
    conn,
    keys,
    loco,
    pos,
    prevPos,
    _input,
    _mainStepOpts,
    simulatePredictedPlayerStep,
    fpCollisionDebug,
    fpElevators,
    fpApartmentDoors,
    fpApartmentFurniture,
    sampleWalkTopBase,
    _elevSupportEval,
    _displayOffset,
    _rigViewScratch,
    _aimShotWorldDir,
    _audioMovement,
    playerRig,
    headPivot,
    headPitch,
    headCameraPitch,
    headFreeLook,
    worldAudio,
    getWorldAudioReady: () => worldAudioReady,
    cabMotionAudio,
    getCabMotionAudioReady: () => cabMotionAudioReady,
    localAudio,
    presentation,
    hotbarConsumableVisual,
    cabMirrors,
    fpEnvironment,
    buildingWorldBounds,
    stairShaftInteriorLightBounds,
    interp,
    _remoteSnapshots,
    _floorVisCamWorld,
    _floorVisCamDir,
    poseAoiAnchor,
    subscribePoseAoi,
    syncActiveHotbarSlotToServer,
    maybeSendMoveIntent,
    syncBuildingFloorPlateVisibility,
    isInsideElevatorCabHudForJump,
    selectedHotbarRow,
    logFpPerf,
    tickFpSessionElevDebug,
    fpInteractInputBlocked,
    apartmentClaimsAllowed: opts.apartmentClaimsAllowed !== false,
    fpInteractionFeet: getInteractionPos,
  });

  let raf = 0;
  let lastFrameMs = performance.now();

  /**
   * Single RAF driver for the whole FP session. Chrome’s “[Violation] requestAnimationFrame
   * handler took N ms” points at an **early line inside this function** (often the first
   * `performance.now()`), not the line that consumed the time — the whole body from input
   * through `renderer.render` is attributed to that handler.
   */
  const tick = () => {
    raf = requestAnimationFrame(tick);
    // Single performance.now() for the whole tick — avoids redundant syscalls and keeps
    // sub-systems consistent with the same timestamp.
    const nowMs = performance.now();
    const dt = Math.min((nowMs - lastFrameMs) / 1000, 0.05);
    lastFrameMs = nowMs;
    runFrame(nowMs, dt);
  };
  tick();

  return () => {
    sessionDisposed = true;
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
    fpApartmentFurniture.dispose();
    fpApartmentDoors.dispose();
    disposeFpSessionDevDebug();
    droppedWorld.dispose();
    conn.db.player_pose.removeOnInsert(onPoseInsert);
    conn.db.player_pose.removeOnUpdate(onPoseUpdate);
    fpEnvironment.dispose();
    decalManager.dispose();
    disposeFpAuthoring();
    disposeWeaponPresentationHotReload();
    disposeWorldContentHotReload();
    unsubHotbarRail();
    cabMotionAudio.dispose();
    cabMotionAudioReady = false;
    backgroundMusic.dispose();
    unsubscribeBackgroundMusicEnabled();
    worldAudio.dispose();
    worldAudioReady = false;
    registerGameAudioPrime(null);
    unregisterHotbarConsumeLocalAudio();
    localAudio.dispose();
    hotbarConsumableVisual.dispose();
    for (const mirror of cabMirrors) mirror.dispose();
    presentation.dispose();
    renderer.dispose();
    scene.clear();
    resetFpSessionFpsDisplay();
    resetFpSessionGameUiHidden();
    resetFpPerfStore();
    if (document.pointerLockElement === canvas) void document.exitPointerLock();
  };
}

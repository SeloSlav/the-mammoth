import * as THREE from "three";
import type { DbConnection } from "../../module_bindings";
import type { InventoryItem } from "../../module_bindings/types";
import { APARTMENT_CLAIM_UI_ENABLED } from "../../featureFlags";
import {
  equippedHeldItemIdFromDefId,
  fpLocomotionConstants,
  type FpLocomotionInput,
  PlayerPresentationManager,
  createFpLocomotionState,
} from "@the-mammoth/engine";
import type { HeldItemId } from "@the-mammoth/game";
import { buildLocalPlayerGameplayState } from "./localPlayerGameplay.js";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog.js";
import {
  findNearestDroppedPickupsHud,
  MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
  MAMMOTH_PICKUP_RADIUS_M,
  type MammothDroppedPickupBandOpts,
} from "../worldRuntime/droppedItemWorldRuntime.js";
import {
  apartmentFurnitureInteriorsPreferOverUnitDoor,
  getApartmentSystemPrompt,
  APARTMENT_CLAIM_FULL_SECS,
  formatApartmentPublicLabel,
  playerOwnsDoorLock,
  playerOwnsScrewdriver,
} from "../fpApartment/fpApartmentGameplay.js";
import {
  computeOptimisticClaimProgressSecs,
  type ApartmentClaimHoldSmooth,
} from "../fpApartment/fpApartmentClaimHoldSmooth.js";
import { attachFpSessionEnvironment } from "./fpSessionEnvironment.js";
import type { MountFpApartmentDoorsResult } from "../fpApartment/fpApartmentDoors.js";
import type { MountFpApartmentFurnitureResult } from "../fpApartment/fpApartmentFurniture.js";
import type { MountFpApartmentDecorMeshesResult } from "../fpApartment/fpApartmentDecorMeshes.js";
import type { MountFpElevatorWorldResult } from "../fpElevator/fpElevatorWorld.js";
import { setFpPickupPrompt } from "../fpInteraction/fpPickupPrompt.js";
import { LocalGameAudio } from "../audio/localGameAudio.js";
import { WorldProximityAudio } from "../audio/worldProximityAudio.js";
import { ElevatorCabMotionAudio } from "../audio/elevatorCabMotionAudio.js";
import {
  getKinematicSupportVerticalVelocityMps,
  type FpKinematicSupportSampleOpts,
} from "../fpPhysics/fpKinematicSupport.js";
import { pushFpPerfFrame, type FpRendererInfo } from "./fpSessionPerfStore.js";
import { FpHotbarConsumableVisual } from "../fpHotbar/fpHotbarConsumableVisual.js";
import { createFpCollisionDebugOverlay } from "./fpSessionCollisionDebug.js";
import type { FpPlanarMirror } from "../fpRendering/fpPlanarMirror.js";
import {
  FP_CAB_MIRROR_REFLECTION_UPDATE_INTERVAL_MS,
  FP_CAB_MIRROR_SKIP_REFLECTION_ABS_FORWARD_Y,
  pickCabMirrorPrimaryUpdateIndex,
} from "../fpRendering/fpCabMirrorReflectionGate.js";
import {
  CAM_BOB_DIP_Y,
  clampTinyDisplayOffsetComponents,
  FP_MIRROR_SELF_RENDER_LAYER,
  FP_VIEWMODEL_RENDER_LAYER,
  MELEE_COOLDOWN_MS,
  POSE_AOI_RECENTER,
  POSE_AOI_RECENTER_Y_M,
} from "./fpSessionConstants.js";
import {
  fpExpSmoothToward,
  fpSampleStairwellInteriorDarkTarget,
  STAIRWELL_INTERIOR_DARK_HALF_LIFE_SEC,
} from "./fpSessionStairwellInteriorDark.js";
import {
  hotbarDefIdSupportsMeleeAttack,
  hotbarDefIdSupportsRangedAttack,
  localPlayerHasCarriedAmmoForWeapon,
} from "../fpHotbar/fpHotbarResolve.js";
import type { FpSessionElevDebugTickCtx } from "./fpSessionDevDebugApis.js";
import { publishFpSessionCompassHeadingFromForwardXZ } from "./fpSessionCompassHeading.js";
import { onFpSessionPostRenderFrame } from "./fpSessionFpsDisplay.js";
import type { FpStairShaftInteriorLightBounds } from "./fpSessionWorldMount.js";
import type { FpFirearmImpactDecals } from "./fpFirearmImpactDecals.js";
import type { FpPlayerDamageBloodSquirt } from "./fpPlayerDamageBloodSquirt.js";

/** Scratch for world yaw extraction (avoid per-frame alloc). */
const _fpPerfCamQuat = new THREE.Quaternion();
const _fpPerfCamEuler = new THREE.Euler();

function fpCameraYawRad(camera: THREE.Camera): number {
  camera.getWorldQuaternion(_fpPerfCamQuat);
  _fpPerfCamEuler.setFromQuaternion(_fpPerfCamQuat, "YXZ");
  return _fpPerfCamEuler.y;
}

/** Squared XZ distance (m²); below this + small dy we may reuse the last dropped-item HUD scan. */
const HUD_DROP_SCAN_STATIONARY_R2 = 0.28 * 0.28;

const FIREARM_COOLDOWN_MS = 170;

/** Min interval between claim pulses while holding E — balances UX vs reducer throughput. */
const APARTMENT_CLAIM_HOLD_PULSE_INTERVAL_MS = 250;

/** Blended (kinematic vs HUD-predicted cab) vertical speed gate for elevator view smoothing. */
const ELEVATOR_KINEMATIC_FAST_ABS_VY_MPS = 0.14;
/** While HUD reports meaningful cab Vy, skip stride bob so it does not fight cab motion. */
const ELEV_HEAD_BOB_SUPPRESS_MIN_HUD_CAB_VY_MPS = 0.02;
/**
 * Exponential decay for `_displayOffset` (prediction-error smoothing). Lower = slower decay =
 * camera eases for more frames after a reconcile (less “micro-jerk”). Tuned vs 12 which felt
 * snappy enough to reveal every 20 Hz nudge as hitching.
 */
const DISPLAY_OFFSET_DAMP = 5;
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
/** Slight fade-in/out when crossing apartment thresholds so lighting does not hard-pop at doors. */
const APARTMENT_INTERIOR_DARK_HALF_LIFE_SEC = 0.12;

type FpLocoState = ReturnType<typeof createFpLocomotionState>;

/** Mutable fields shared by input handlers, spawn reconcile, and the main RAF tick. */
export type FpSessionMainRafState = {
  bodyYaw: number;
  pitch: number;
  headLookYaw: number;
  crouchToggle: boolean;
  meleePressPending: boolean;
  /** LMB held after a combat-committed pointerdown (cleared on up/cancel/blur / pointer-lock loss). */
  primaryAttackHeld: boolean;
  fpRigViewSmoothedReady: boolean;
  lastTickElevSupportVyMps: number;
  lastTickHudCabVyMps: number;
  lastTickElevVyBlendAbs: number;
  stairwellInteriorDarkSmoothed: number;
  apartmentInteriorDarkSmoothed: number;
  meleeAttackSeq: number;
  firearmShotSeq: number;
  lastMeleeMs: number;
  lastRangedMs: number;
};

export type FpSessionMainStepOpts = {
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  locoState: FpLocoState;
  input: FpLocomotionInput;
  dtSec: number;
  evalWallClockMs: number;
  crouch: boolean;
  jumpPressedThisFrame: boolean;
  bodyYawRad: number;
  kinematicSupport: MountFpElevatorWorldResult["kinematicSupport"];
};

export type FpSessionMainRafFrameDeps = {
  mainRaf: FpSessionMainRafState;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  conn: DbConnection;
  keys: Set<string>;
  loco: FpLocoState;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  _input: FpLocomotionInput;
  _mainStepOpts: FpSessionMainStepOpts;
  simulatePredictedPlayerStep: (opts: FpSessionMainStepOpts) => number;
  fpCollisionDebug: ReturnType<typeof createFpCollisionDebugOverlay>;
  fpElevators: MountFpElevatorWorldResult;
  fpApartmentDoors: MountFpApartmentDoorsResult;
  fpApartmentFurniture: MountFpApartmentFurnitureResult;
  fpApartmentDecorMeshes: MountFpApartmentDecorMeshesResult;
  sampleWalkTopBase: (x: number, z: number, probeTopY: number) => number;
  _elevSupportEval: FpKinematicSupportSampleOpts;
  _displayOffset: THREE.Vector3;
  _rigViewScratch: THREE.Vector3;
  /** World-space camera aim direction for `submitFirearmShot` (reused, no alloc). */
  _aimShotWorldDir: THREE.Vector3;
  _audioMovement: {
    horizontalSpeed: number;
    stridePhaseRad: number;
    grounded: boolean;
    crouch: boolean;
    sprint: boolean;
    freeLook: boolean;
  };
  playerRig: THREE.Group;
  headPivot: THREE.Object3D;
  headPitch: THREE.Object3D;
  headCameraPitch: THREE.Object3D;
  headFreeLook: THREE.Object3D;
  worldAudio: WorldProximityAudio;
  getWorldAudioReady: () => boolean;
  cabMotionAudio: ElevatorCabMotionAudio;
  getCabMotionAudioReady: () => boolean;
  localAudio: LocalGameAudio;
  presentation: PlayerPresentationManager;
  hotbarConsumableVisual: FpHotbarConsumableVisual;
  cabMirrors: FpPlanarMirror[];
  fpEnvironment: ReturnType<typeof attachFpSessionEnvironment>;
  stairShaftInteriorLightBounds: readonly FpStairShaftInteriorLightBounds[];
  _floorVisCamWorld: THREE.Vector3;
  _floorVisCamDir: THREE.Vector3;
  poseAoiAnchor: { x: number; y: number; z: number };
  /** Mammoth building vertical bands for drop HUD proximity (matches server pickup storey gate). */
  droppedPickupHudBands: MammothDroppedPickupBandOpts;
  /** Recenters world-sound + dropped-item AOI subscriptions when the feet drift far from the anchor. */
  syncSpatialAoiFromFeet: (cx: number, cy: number, cz: number) => void;
  syncActiveHotbarSlotToServer: () => void;
  maybeSendMoveIntent: (input: FpLocomotionInput, jump: boolean, nowMs: number) => void;
  /** Immediate intent publish (bypasses periodic coalesce) so reducers see fresh local pose / `aim_yaw`. */
  sendMoveIntent: (input: FpLocomotionInput, jump: boolean, nowMs: number) => Promise<void>;
  syncBuildingFloorPlateVisibility: (nowMs: number) => void;
  isInsideElevatorCabHudForJump: () => boolean;
  isInsideResidentialUnit: () => boolean;
  getContainingResidentialUnitKey: () => string | null;
  getContainingResidentialUnitBounds: () => {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  } | null;
  isApartmentFurnitureInteriorVisible: () => boolean;
  selectedHotbarRow: () => InventoryItem | undefined;
  logFpPerf: () => void;
  tickFpSessionElevDebug: (ctx: FpSessionElevDebugTickCtx) => void;
  /** True when interact (e.g. hold-to-claim) should ignore KeyE — inventory UI or typing. */
  fpInteractInputBlocked: () => boolean;
  /**
   * True when WASD / sprint / jump should be ignored. Narrower than {@link fpInteractInputBlocked}:
   * inventory stays playable (Tab panel) while crafting/debug menus still freeze locomotion.
   */
  fpLocomotionInputBlocked: () => boolean;
  /** Guests can fight/loot, but only registered accounts can claim apartments. */
  apartmentClaimsAllowed: boolean;
  /** Authoritative-blended feet for interaction range queries (elevator/residential/drops HUD). */
  fpInteractionFeet: () => THREE.Vector3;
  /** Local feet for dropped-item HUD / pickup; pickup publishes this pose before reducer validation. */
  fpDroppedPickupFeet: () => THREE.Vector3;
  fpFirearmImpactDecals: FpFirearmImpactDecals;
  fpPlayerDamageBloodSquirt: FpPlayerDamageBloodSquirt;
  /** Scene visibility/frustum counts sampled on an interval; excludes drawCalls/triangles (from renderer.info). */
  getFpPerfSceneCounters: () => Omit<FpRendererInfo, "drawCalls" | "triangles">;
  /** No-op when GPU timestamp queries are unavailable. */
  scheduleGpuTimestampResolve: () => void;
};

/**
 * Builds the per-frame driver for the FP session (physics → presentation → render → perf hooks).
 * Keeps {@link mountFpSession} focused on wiring; all RAF-scoped temporaries stay closed over here.
 */
export function createFpSessionMainRafFrame(
  deps: FpSessionMainRafFrameDeps,
): { runFrame: (nowMs: number, dt: number) => void } {
  const _rigViewScratch = deps._rigViewScratch;
  let lastApartmentClaimHoldPulseMs = 0;
  let lastCabMirrorReflectionUpdateMs = -Infinity;
  let lastCabMirrorReflectionIdx = -1;
  /** Advances claim bar at wall-clock while E is held; cleared when HUD leaves apartment claim. */
  let claimHoldSmoothState: ApartmentClaimHoldSmooth | null = null;

  let hudHeavyFrame = 0;
  let cachedDropHud: ReturnType<typeof findNearestDroppedPickupsHud> = {
    worldAnchor: null,
    plain: null,
  };
  let dropHudCacheFx = 0;
  let dropHudCacheFy = 0;
  let dropHudCacheFz = 0;

  let hudAptInitialized = false;
  let cachedAptSys: ReturnType<typeof getApartmentSystemPrompt> | null = null;
  let aptSysStashKey: string | null = null;
  let aptSysWardrobeKey: string | null = null;
  let aptSysCoarseFx = 0;
  let aptSysCoarseFy = 0;
  let aptSysCoarseFz = 0;

  const runFrame = (nowMs: number, dt: number): void => {
    const { mainRaf } = deps;

    deps.fpFirearmImpactDecals.tick(nowMs);
    deps.fpPlayerDamageBloodSquirt.tick(nowMs, dt);

    // Combat reducers (`submit_firearm_shot`, `submit_melee_swing`) read `player_active_hotbar` on
    // the server. Sync selected slot before resolving primary attack so a click right after a
    // scroll / slot change cannot outrun `set_active_hotbar_slot` (previously synced at frame end).
    deps.syncActiveHotbarSlotToServer();

    const locomotionBlockedEarly = deps.fpLocomotionInputBlocked();
    const flushCombatFacingIntent = (): void => {
      deps.sendMoveIntent(
        {
          forward: locomotionBlockedEarly ? false : deps.keys.has("KeyW"),
          backward: locomotionBlockedEarly ? false : deps.keys.has("KeyS"),
          left: locomotionBlockedEarly ? false : deps.keys.has("KeyA"),
          right: locomotionBlockedEarly ? false : deps.keys.has("KeyD"),
          sprint: locomotionBlockedEarly
            ? false
            : deps.keys.has("ShiftLeft") || deps.keys.has("ShiftRight"),
          crouch: mainRaf.crouchToggle,
          jumpHeld: locomotionBlockedEarly ? false : deps.keys.has("Space"),
        },
        false,
        nowMs,
      );
    };

    const primaryPressEdge = mainRaf.meleePressPending;
    if (mainRaf.meleePressPending) mainRaf.meleePressPending = false;
    const hbCombat = deps.selectedHotbarRow();

    if (
      primaryPressEdge &&
      hbCombat &&
      deps.conn.identity &&
      hotbarDefIdSupportsRangedAttack(hbCombat.defId) &&
      nowMs - mainRaf.lastRangedMs >= FIREARM_COOLDOWN_MS
    ) {
      if (localPlayerHasCarriedAmmoForWeapon(deps.conn, deps.conn.identity, hbCombat.defId)) {
        mainRaf.lastRangedMs = nowMs;
        mainRaf.firearmShotSeq += 1;
        deps.camera.updateMatrixWorld(true);
        deps.camera.getWorldDirection(deps._aimShotWorldDir);
        flushCombatFacingIntent();
        void deps.conn.reducers.submitFirearmShot({
          aimDirX: deps._aimShotWorldDir.x,
          aimDirY: deps._aimShotWorldDir.y,
          aimDirZ: deps._aimShotWorldDir.z,
        });
        deps.fpFirearmImpactDecals.spawnForShot({
          nowMs,
          camera: deps.camera,
          aimWorldDir: deps._aimShotWorldDir,
          heldItemId: hbCombat.defId as HeldItemId,
          shotSeq: mainRaf.firearmShotSeq,
        });
      } else {
        mainRaf.lastRangedMs = nowMs;
        deps.localAudio.playFirearmDryFireLocal();
      }
    } else if (
      (primaryPressEdge || mainRaf.primaryAttackHeld) &&
      hbCombat &&
      hotbarDefIdSupportsMeleeAttack(hbCombat.defId) &&
      nowMs - mainRaf.lastMeleeMs >= MELEE_COOLDOWN_MS
    ) {
      mainRaf.lastMeleeMs = nowMs;
      mainRaf.meleeAttackSeq += 1;
      deps.localAudio.playMeleeWeaponSwingLocal();
      if (deps.conn.identity) {
        flushCombatFacingIntent();
        deps.camera.updateMatrixWorld(true);
        deps.camera.getWorldDirection(deps._aimShotWorldDir);
        void deps.conn.reducers.submitMeleeSwing({
          aimDirX: deps._aimShotWorldDir.x,
          aimDirY: deps._aimShotWorldDir.y,
          aimDirZ: deps._aimShotWorldDir.z,
        });
      }
    }

    const locomotionBlocked = deps.fpLocomotionInputBlocked();
    deps._input.forward = locomotionBlocked ? false : deps.keys.has("KeyW");
    deps._input.backward = locomotionBlocked ? false : deps.keys.has("KeyS");
    deps._input.left = locomotionBlocked ? false : deps.keys.has("KeyA");
    deps._input.right = locomotionBlocked ? false : deps.keys.has("KeyD");
    deps._input.sprint = locomotionBlocked
      ? false
      : deps.keys.has("ShiftLeft") || deps.keys.has("ShiftRight");
    deps._input.crouch = mainRaf.crouchToggle;
    deps._input.jumpHeld = locomotionBlocked ? false : deps.keys.has("Space");

    const jumpQueuedBeforeStep = deps.loco.jumpQueued;
    const jumpBlockedInElevatorCab = deps.isInsideElevatorCabHudForJump();
    if (jumpBlockedInElevatorCab) deps.loco.jumpQueued = false;
    deps.fpElevators.syncCabEvalClock(nowMs, dt);
    deps.prevPos.copy(deps.pos);

    // --- Physics section timing ---
    deps._mainStepOpts.dtSec = dt;
    deps._mainStepOpts.evalWallClockMs = nowMs;
    deps._mainStepOpts.crouch = mainRaf.crouchToggle;
    deps._mainStepOpts.jumpPressedThisFrame = jumpQueuedBeforeStep && !jumpBlockedInElevatorCab;
    deps._mainStepOpts.bodyYawRad = mainRaf.bodyYaw;
    const headY = deps.simulatePredictedPlayerStep(deps._mainStepOpts);
    const _t_physicsEnd = performance.now();
    deps.fpCollisionDebug.update(deps.pos, deps.loco.velocity, {
      crouch: mainRaf.crouchToggle,
      displayOffset: deps._displayOffset,
    });

    // --- Elevator section timing ---
    deps.fpElevators.tick(dt, nowMs, deps.pos);
    deps.fpElevators.syncLandingHailUi(deps.camera, deps.pos, nowMs);
    deps.fpApartmentDoors.tick(nowMs);
    const _t_elevEnd = performance.now();

    const probeTopElevDecay = deps.pos.y + fpLocomotionConstants.walkProbeDy;
    deps._elevSupportEval.worldX = deps.pos.x;
    deps._elevSupportEval.worldZ = deps.pos.z;
    deps._elevSupportEval.probeTopY = probeTopElevDecay;
    deps._elevSupportEval.baseTop = deps.sampleWalkTopBase(
      deps.pos.x,
      deps.pos.z,
      probeTopElevDecay,
    );
    deps._elevSupportEval.evalWallClockMs = nowMs;
    mainRaf.lastTickElevSupportVyMps = getKinematicSupportVerticalVelocityMps(
      deps.fpElevators.kinematicSupport,
      deps._elevSupportEval,
    );
    mainRaf.lastTickHudCabVyMps = deps.fpElevators.getHudMovingCabVyMps(
      deps.pos.x,
      deps.pos.y,
      deps.pos.z,
      nowMs,
    );
    mainRaf.lastTickElevVyBlendAbs = Math.max(
      Math.abs(mainRaf.lastTickElevSupportVyMps),
      Math.abs(mainRaf.lastTickHudCabVyMps),
    );
    const fastElevY = mainRaf.lastTickElevVyBlendAbs >= ELEVATOR_KINEMATIC_FAST_ABS_VY_MPS;
    const hs = Math.hypot(deps.loco.velocity.x, deps.loco.velocity.z);
    const inputIdle =
      !deps._input.forward && !deps._input.backward && !deps._input.left && !deps._input.right;
    const viewSettledIdle =
      inputIdle && hs < VIEW_SETTLED_IDLE_MAX_HS && !fastElevY;
    const offNonZero =
      deps._displayOffset.x !== 0 || deps._displayOffset.y !== 0 || deps._displayOffset.z !== 0;
    if (viewSettledIdle) {
      if (offNonZero) {
        deps.pos.x += deps._displayOffset.x;
        deps.pos.y += deps._displayOffset.y;
        deps.pos.z += deps._displayOffset.z;
        deps._displayOffset.set(0, 0, 0);
      }
    } else if (!inputIdle && offNonZero) {
      const k = Math.exp(-DISPLAY_OFFSET_DAMP * dt);
      const kY = fastElevY
        ? Math.exp(-DISPLAY_OFFSET_DAMP * DISPLAY_OFFSET_ELEVATOR_Y_DAMP_SCALE * dt)
        : k;
      deps._displayOffset.x *= k;
      deps._displayOffset.y *= kY;
      deps._displayOffset.z *= k;
      clampTinyDisplayOffsetComponents(deps._displayOffset);
    } else if (inputIdle && fastElevY && offNonZero) {
      const k = Math.exp(-DISPLAY_OFFSET_DAMP * dt);
      const kY = Math.exp(-DISPLAY_OFFSET_DAMP * DISPLAY_OFFSET_ELEVATOR_Y_DAMP_SCALE * dt);
      deps._displayOffset.x *= k;
      deps._displayOffset.y *= kY;
      deps._displayOffset.z *= k;
      clampTinyDisplayOffsetComponents(deps._displayOffset);
    }

    const rtx = deps.pos.x + deps._displayOffset.x;
    const rty = deps.pos.y + deps._displayOffset.y;
    const rtz = deps.pos.z + deps._displayOffset.z;
    const ridingMovingCabView =
      Math.abs(mainRaf.lastTickHudCabVyMps) >= ELEV_HEAD_BOB_SUPPRESS_MIN_HUD_CAB_VY_MPS;
    if (!mainRaf.fpRigViewSmoothedReady) {
      _rigViewScratch.set(rtx, rty, rtz);
      mainRaf.fpRigViewSmoothedReady = true;
    } else if (ridingMovingCabView) {
      _rigViewScratch.set(rtx, rty, rtz);
    } else if (viewSettledIdle) {
      _rigViewScratch.set(rtx, rty, rtz);
    } else if (PLAYER_RIG_VIEW_LERP_PER_S > 1e-3) {
      const rigLerpPerS = PLAYER_RIG_VIEW_LERP_PER_S;
      const a = 1 - Math.exp(-rigLerpPerS * dt);
      const aXZ = fastElevY
        ? 1 - Math.exp(-rigLerpPerS * PLAYER_RIG_VIEW_XZ_ELEV_LERP_MULT * dt)
        : a;
      const aY = fastElevY
        ? 1 - Math.exp(-rigLerpPerS * PLAYER_RIG_VIEW_Y_ELEV_LERP_MULT * dt)
        : a;
      _rigViewScratch.x += (rtx - _rigViewScratch.x) * aXZ;
      _rigViewScratch.y += (rty - _rigViewScratch.y) * aY;
      _rigViewScratch.z += (rtz - _rigViewScratch.z) * aXZ;
    } else {
      _rigViewScratch.set(rtx, rty, rtz);
    }
    if (
      Math.hypot(rtx - _rigViewScratch.x, rty - _rigViewScratch.y, rtz - _rigViewScratch.z) > 2.5
    ) {
      _rigViewScratch.set(rtx, rty, rtz);
    }
    deps.playerRig.position.copy(_rigViewScratch);
    deps.playerRig.rotation.y = mainRaf.bodyYaw;
    deps.headPivot.position.y = headY;
    deps.headPivot.rotation.set(0, 0, 0);
    const freeLook =
      !deps.fpInteractInputBlocked() &&
      (deps.keys.has("AltLeft") || deps.keys.has("AltRight"));
    deps.headPitch.rotation.x = freeLook ? 0 : mainRaf.pitch;
    deps.headCameraPitch.rotation.x = mainRaf.pitch;
    deps.headFreeLook.rotation.y = mainRaf.headLookYaw;

    deps._audioMovement.horizontalSpeed = hs;
    deps._audioMovement.stridePhaseRad = deps.loco.headBobPhase;
    deps._audioMovement.grounded = deps.loco.grounded;
    deps._audioMovement.crouch = mainRaf.crouchToggle;
    deps._audioMovement.sprint = deps._input.sprint;
    deps._audioMovement.freeLook = freeLook;
    deps.localAudio.update(dt, deps._audioMovement);
    const walkStrength = THREE.MathUtils.clamp(
      hs / fpLocomotionConstants.sprintSpeedMps,
      0,
      1,
    );
    const suppressHeadBobForElev =
      Math.abs(mainRaf.lastTickHudCabVyMps) >= ELEV_HEAD_BOB_SUPPRESS_MIN_HUD_CAB_VY_MPS;
    if (
      deps.loco.grounded &&
      !mainRaf.crouchToggle &&
      !freeLook &&
      hs > 0.12 &&
      !suppressHeadBobForElev
    ) {
      const dip = Math.sin(deps.loco.headBobPhase * 2) * CAM_BOB_DIP_Y * walkStrength;
      deps.camera.rotation.z = 0;
      deps.camera.position.x = 0;
      deps.camera.position.y = dip;
    } else {
      deps.camera.rotation.z = THREE.MathUtils.damp(deps.camera.rotation.z, 0, 10, dt);
      deps.camera.position.x = THREE.MathUtils.damp(deps.camera.position.x, 0, 10, dt);
      deps.camera.position.y = THREE.MathUtils.damp(deps.camera.position.y, 0, 10, dt);
    }
    /**
     * Rig/head/camera transforms above drive culling, mirrors, environment, and spatial audio below.
     * Update world matrices now so those systems sample the **current** frame's view, not the previous one.
     */
    deps.playerRig.updateMatrixWorld(true);
    deps.camera.updateMatrixWorld(true);
    if (deps.getWorldAudioReady()) {
      deps.worldAudio.syncListener();
      if (deps.getCabMotionAudioReady()) {
        deps.cabMotionAudio.syncListener();
        deps.cabMotionAudio.sync(deps.fpElevators.getCabMotionAudioEmitters(nowMs));
      }
    }

    deps.maybeSendMoveIntent(
      deps._input,
      jumpQueuedBeforeStep && !jumpBlockedInElevatorCab,
      nowMs,
    );

    if (deps.conn.identity) {
      const drift = Math.hypot(
        deps.pos.x - deps.poseAoiAnchor.x,
        deps.pos.z - deps.poseAoiAnchor.z,
      );
      const verticalDrift = Math.abs(deps.pos.y - deps.poseAoiAnchor.y);
      if (drift > POSE_AOI_RECENTER || verticalDrift > POSE_AOI_RECENTER_Y_M) {
        deps.syncSpatialAoiFromFeet(deps.pos.x, deps.pos.y, deps.pos.z);
      }
    }

    /**
     * Fills {@link FpSessionMainRafFrameDeps._floorVisCamWorld} / `_floorVisCamDir` and applies
     * floor/furniture visibility before presentation work (single camera sample for the frame).
     */
    deps.syncBuildingFloorPlateVisibility(nowMs);
    publishFpSessionCompassHeadingFromForwardXZ(deps._floorVisCamDir.x, deps._floorVisCamDir.z);
    const containingResidentialUnitKey = deps.getContainingResidentialUnitKey();
    deps.fpApartmentFurniture.syncVisibility(
      deps.camera,
      deps.isApartmentFurnitureInteriorVisible(),
      containingResidentialUnitKey,
    );
    deps.fpApartmentDecorMeshes.syncVisibility(
      deps.camera,
      deps.isApartmentFurnitureInteriorVisible(),
      containingResidentialUnitKey,
    );

    const localId = deps.conn.identity?.toHexString() ?? "local-unknown";
    const hotbarRow = deps.selectedHotbarRow();
    const hotbarHeld = hotbarRow
      ? equippedHeldItemIdFromDefId(hotbarRow.defId)
      : ("unarmed" as const);
    const hotbarConsumableDefId =
      hotbarRow && getMammothItemDef(hotbarRow.defId)?.category === "consumable"
        ? hotbarRow.defId
        : null;

    deps.presentation.setLocalFpGameplayStockHandVisible(
      hotbarHeld !== "unarmed" || hotbarConsumableDefId !== null,
    );

    const localState = buildLocalPlayerGameplayState({
      playerIdHex: localId,
      pos: deps.pos,
      yawRad: mainRaf.bodyYaw + mainRaf.headLookYaw,
      pitchRad: mainRaf.pitch,
      freeLookActive: freeLook,
      stridePhaseRad: deps.loco.headBobPhase,
      vel: deps.loco.velocity,
      grounded: deps.loco.grounded,
      crouch: mainRaf.crouchToggle,
      meleeAttackSeq: mainRaf.meleeAttackSeq,
      firearmShotSeq: mainRaf.firearmShotSeq,
      equippedPrimaryFromHotbar: hotbarHeld,
    });
    // --- Presentation section timing ---
    deps.presentation.update(dt, localState, nowMs);
    deps.hotbarConsumableVisual.syncSelected(
      hotbarConsumableDefId,
      deps.presentation.getLocalFpGripAnchorObject(),
    );
    const _t_presentEnd = performance.now();

    if (deps.conn.identity) {
      const ft = deps.fpInteractionFeet();
      const ftPick = deps.fpDroppedPickupFeet();
      hudHeavyFrame += 1;

      const ddx = ftPick.x - dropHudCacheFx;
      const ddy = ftPick.y - dropHudCacheFy;
      const ddz = ftPick.z - dropHudCacheFz;
      const movedDrops =
        ddx * ddx + ddz * ddz > HUD_DROP_SCAN_STATIONARY_R2 || Math.abs(ddy) > 0.38;
      const scanDrops = deps.keys.has("KeyE") || movedDrops || (hudHeavyFrame & 1) === 0;
      if (scanDrops) {
        cachedDropHud = findNearestDroppedPickupsHud(
          deps.conn,
          ftPick.x,
          ftPick.y,
          ftPick.z,
          MAMMOTH_PICKUP_RADIUS_M,
          MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
          deps.droppedPickupHudBands,
        );
        dropHudCacheFx = ftPick.x;
        dropHudCacheFy = ftPick.y;
        dropHudCacheFz = ftPick.z;
      }
      const droppedHud = cachedDropHud;

      const lookedAtStash = deps.fpApartmentDecorMeshes.getStashPrompt(ft, deps.camera);
      const lookedAtWardrobeUnitKey = APARTMENT_CLAIM_UI_ENABLED
        ? deps.fpApartmentDecorMeshes.getWardrobeClaimLookAtUnitKey(ft, deps.camera)
        : null;
      const stashUk = lookedAtStash?.stashKey ?? null;
      const wardrobeUk = lookedAtWardrobeUnitKey ?? null;
      const cfx = Math.floor(ft.x * 2);
      const cfy = Math.floor(ft.y * 2);
      const cfz = Math.floor(ft.z * 2);
      const ctxChanged =
        stashUk !== aptSysStashKey ||
        wardrobeUk !== aptSysWardrobeKey ||
        cfx !== aptSysCoarseFx ||
        cfy !== aptSysCoarseFy ||
        cfz !== aptSysCoarseFz;
      const runFullAptSys =
        !hudAptInitialized ||
        deps.keys.has("KeyE") ||
        cachedAptSys != null ||
        ctxChanged ||
        (hudHeavyFrame & 1) === 0;
      if (runFullAptSys) {
        hudAptInitialized = true;
        aptSysStashKey = stashUk;
        aptSysWardrobeKey = wardrobeUk;
        aptSysCoarseFx = cfx;
        aptSysCoarseFy = cfy;
        aptSysCoarseFz = cfz;
        cachedAptSys = getApartmentSystemPrompt(deps.conn, ft, {
          apartmentClaimsAllowed: deps.apartmentClaimsAllowed,
          ...(stashUk !== null ? { lookedAtStashKey: stashUk } : {}),
          lookedAtWardrobeUnitKey,
        });
      }
      const aSys = cachedAptSys;

      if (deps.keys.has("KeyE") && !deps.fpInteractInputBlocked()) {
        const holdPrompt = aSys;
        const doorSuppressBlocksClaimHold =
          holdPrompt?.kind !== "apartment_claim" &&
          deps.fpApartmentDoors.shouldSuppressEpickup(ft, deps.camera);
        const elevatorBlocksClaimHold =
          deps.fpElevators.shouldSuppressEpickup(ft, deps.camera) &&
          !(holdPrompt !== null && apartmentFurnitureInteriorsPreferOverUnitDoor(holdPrompt));
        if (
          !elevatorBlocksClaimHold &&
          !doorSuppressBlocksClaimHold
        ) {
          const worldLootBlocksClaimPulse =
            droppedHud.worldAnchor !== null && holdPrompt?.kind !== "apartment_claim";
          if (!worldLootBlocksClaimPulse) {
            const aSysHold = holdPrompt;
            if (
              aSysHold?.kind === "apartment_claim" &&
              nowMs - lastApartmentClaimHoldPulseMs >= APARTMENT_CLAIM_HOLD_PULSE_INTERVAL_MS
            ) {
              lastApartmentClaimHoldPulseMs = nowMs;
              void deps.conn.reducers.claimApartmentPulse({ unitKey: aSysHold.unitKey });
            }
          }
        }
      }

      let nextClaimSmoothCarry: ApartmentClaimHoldSmooth | null = null;
      const rawElevDoorPrompt = deps.fpElevators.getExteriorDoorInteractPrompt(ft, deps.camera);
      const doorPrompt =
        rawElevDoorPrompt !== null &&
        !(aSys !== null && apartmentFurnitureInteriorsPreferOverUnitDoor(aSys))
          ? rawElevDoorPrompt
          : null;
      const apartmentDoorHud =
        doorPrompt !== null
          ? null
          : apartmentFurnitureInteriorsPreferOverUnitDoor(aSys)
            ? null
            : deps.fpApartmentDoors.getInteractPrompt(ft, deps.camera);
      if (doorPrompt) {
        setFpPickupPrompt({
          kind: "elevator_exterior_door",
          willClose: doorPrompt.willClose,
          floorLabel: doorPrompt.floorLabel,
        });
      } else if (apartmentDoorHud) {
        setFpPickupPrompt({
          kind: "apartment_door",
          willClose: apartmentDoorHud.willClose,
          promptKind: apartmentDoorHud.promptKind,
        });
      } else {
        const nearWorld = droppedHud.worldAnchor;
        const hitPlain = droppedHud.plain;
        const aptSystemBeatsWorldAnchor = aSys !== null;
        if (!aptSystemBeatsWorldAnchor && nearWorld) {
          const def = getMammothItemDef(nearWorld.defId);
          setFpPickupPrompt({
            kind: "dropped_item",
            droppedItemIdStr: nearWorld.droppedItemId.toString(),
            displayName: def?.displayName ?? nearWorld.defId,
            worldAnchorSpawn: true,
          });
        } else if (aSys?.kind === "apartment_claim_blocked_gear") {
          let displayLabel = aSys.unitKey;
          for (const row of deps.conn.db.apartment_unit) {
            if (row.unitKey === aSys.unitKey) {
              displayLabel = formatApartmentPublicLabel(row);
              break;
            }
          }
          const id = deps.conn.identity!;
          setFpPickupPrompt({
            kind: "apartment_claim_blocked_gear",
            unitKey: aSys.unitKey,
            displayLabel,
            missingDoorLock: !playerOwnsDoorLock(deps.conn, id),
            missingScrewdriver: !playerOwnsScrewdriver(deps.conn, id),
          });
        } else if (aSys?.kind === "apartment_claim_blocked_guest") {
          let displayLabel = aSys.unitKey;
          for (const row of deps.conn.db.apartment_unit) {
            if (row.unitKey === aSys.unitKey) {
              displayLabel = formatApartmentPublicLabel(row);
              break;
            }
          }
          setFpPickupPrompt({
            kind: "apartment_claim_blocked_guest",
            unitKey: aSys.unitKey,
            displayLabel,
          });
        } else if (aSys?.kind === "apartment_claim") {
          let serverClaimSecs = 0;
          let displayLabel = aSys.unitKey;
          for (const row of deps.conn.db.apartment_unit) {
            if (row.unitKey === aSys.unitKey) {
              serverClaimSecs = row.claimProgressSecs;
              displayLabel = formatApartmentPublicLabel(row);
              break;
            }
          }
          let claimHoldEligible =
            deps.keys.has("KeyE") &&
            !deps.fpInteractInputBlocked() &&
            !(
              deps.fpElevators.shouldSuppressEpickup(ft, deps.camera) &&
              !(aSys !== null && apartmentFurnitureInteriorsPreferOverUnitDoor(aSys))
            );
          if (aSys?.kind !== "apartment_claim") {
            claimHoldEligible &&= !deps.fpApartmentDoors.shouldSuppressEpickup(ft, deps.camera);
          }
          const { displaySecs: claimProgressHudSecs, nextSmooth } =
            computeOptimisticClaimProgressSecs({
              fullSecs: APARTMENT_CLAIM_FULL_SECS,
              unitKey: aSys.unitKey,
              serverSecs: serverClaimSecs,
              nowMs,
              eligible: claimHoldEligible,
              prevSmooth: claimHoldSmoothState,
            });
          nextClaimSmoothCarry = nextSmooth;
          setFpPickupPrompt({
            kind: "apartment_claim",
            unitKey: aSys.unitKey,
            displayLabel,
            claimProgressSecs: claimProgressHudSecs,
            claimFullSecs: APARTMENT_CLAIM_FULL_SECS,
          });
        } else if (aSys?.kind === "apartment_stash") {
          setFpPickupPrompt({
            kind: "apartment_stash",
            stashKey: aSys.stashKey,
            unitKey: aSys.unitKey,
            stashLabel: aSys.stashLabel,
          });
        } else if (hitPlain) {
          const def = getMammothItemDef(hitPlain.defId);
          setFpPickupPrompt({
            kind: "dropped_item",
            droppedItemIdStr: hitPlain.droppedItemId.toString(),
            displayName: def?.displayName ?? hitPlain.defId,
            worldAnchorSpawn: false,
          });
        } else {
          setFpPickupPrompt(null);
        }
      }
      claimHoldSmoothState = nextClaimSmoothCarry;
    } else {
      setFpPickupPrompt(null);
      claimHoldSmoothState = null;
    }

    // --- Render section timing (see pushFpPerfFrame render split) ---
    const _t_renderStart = performance.now();
    const darkTarget = fpSampleStairwellInteriorDarkTarget(
      deps._floorVisCamWorld.x,
      deps._floorVisCamWorld.y,
      deps._floorVisCamWorld.z,
      deps.stairShaftInteriorLightBounds,
    );
    mainRaf.stairwellInteriorDarkSmoothed = fpExpSmoothToward(
      mainRaf.stairwellInteriorDarkSmoothed,
      darkTarget,
      dt,
      STAIRWELL_INTERIOR_DARK_HALF_LIFE_SEC,
    );
    const apartmentDarkTarget = deps.isInsideResidentialUnit() ? 1 : 0;
    mainRaf.apartmentInteriorDarkSmoothed = fpExpSmoothToward(
      mainRaf.apartmentInteriorDarkSmoothed,
      apartmentDarkTarget,
      dt,
      APARTMENT_INTERIOR_DARK_HALF_LIFE_SEC,
    );
    /**
     * Runs every frame (not just band-change frames) because door openness mutates without shifting
     * the plate band. The call is idempotent — each shaft visual no-ops when its landing
     * visibility matches the requested state — so the cost is one `getDoor`/`isInsideCarHud` pair
     * per shaft plus a handful of comparisons.
     */
    deps.fpElevators.syncShaftVisualCulling(
      deps.pos.x,
      deps.pos.y,
      deps.pos.z,
      nowMs,
      deps.isInsideResidentialUnit(),
      deps._floorVisCamWorld.x,
      deps._floorVisCamWorld.y,
      deps._floorVisCamWorld.z,
      deps._floorVisCamDir.x,
      deps._floorVisCamDir.z,
    );
    const _t_afterFloorVis = performance.now();
    const fpEnvTimings = deps.fpEnvironment.onFrame({
      camera: deps.camera,
      nowSec: nowMs * 0.001,
      viewWidthPx: deps.canvas.clientWidth,
      viewHeightPx: deps.canvas.clientHeight,
      apartmentInteriorBounds: deps.getContainingResidentialUnitBounds(),
      apartmentInteriorDark01: mainRaf.apartmentInteriorDarkSmoothed,
      stairwellInteriorDark01: mainRaf.stairwellInteriorDarkSmoothed,
    });
    const _t_afterFpEnv = performance.now();
    const primaryMirrorIdx = pickCabMirrorPrimaryUpdateIndex(deps.cabMirrors, {
      cameraWorld: deps._floorVisCamWorld,
      cameraForward: deps._floorVisCamDir,
      opts: { maxDistanceM: 4.5, minFacingDot: 0.22 },
      skipReflectionWhenVerticalLookAboveAbsY: FP_CAB_MIRROR_SKIP_REFLECTION_ABS_FORWARD_Y,
    });
    const forceMirrorReflectionUpdate =
      primaryMirrorIdx >= 0 &&
      (primaryMirrorIdx !== lastCabMirrorReflectionIdx ||
        nowMs - lastCabMirrorReflectionUpdateMs >=
          FP_CAB_MIRROR_REFLECTION_UPDATE_INTERVAL_MS);
    if (forceMirrorReflectionUpdate) {
      lastCabMirrorReflectionUpdateMs = nowMs;
      lastCabMirrorReflectionIdx = primaryMirrorIdx;
    }
    for (let i = 0; i < deps.cabMirrors.length; i++) {
      const mirror = deps.cabMirrors[i]!;
      mirror.syncForCamera({
        camera: deps.camera,
        dynamicActive: i === primaryMirrorIdx,
        forceReflectionUpdate: forceMirrorReflectionUpdate && i === primaryMirrorIdx,
        configureVirtualCamera: (virtualCamera) => {
          virtualCamera.layers.mask = deps.camera.layers.mask;
          virtualCamera.layers.disable(FP_VIEWMODEL_RENDER_LAYER);
          virtualCamera.layers.enable(FP_MIRROR_SELF_RENDER_LAYER);
        },
      });
    }
    const _t_beforeThreeRender = performance.now();
    deps.renderer.info.reset();
    const drawCallsBefore = deps.renderer.info.render.calls;
    const trianglesBefore = deps.renderer.info.render.triangles;
    deps.renderer.render(deps.scene, deps.camera);
    const frameDrawCalls = Math.max(0, deps.renderer.info.render.calls - drawCallsBefore);
    const frameTriangles = Math.max(0, deps.renderer.info.render.triangles - trianglesBefore);
    deps.scheduleGpuTimestampResolve();
    const _t_renderEnd = performance.now();
    const renderFloorPlateVisMs = _t_afterFloorVis - _t_renderStart;
    const renderFpEnvironmentMs = _t_afterFpEnv - _t_afterFloorVis;
    const renderSetupMs = _t_beforeThreeRender - _t_afterFpEnv;
    const renderThreeMs = _t_renderEnd - _t_beforeThreeRender;
    const physicsMs = _t_physicsEnd - nowMs;
    const elevatorMs = _t_elevEnd - _t_physicsEnd;
    const presentMs = _t_presentEnd - _t_elevEnd;
    const renderMs = _t_renderEnd - _t_presentEnd;
    const totalFrameMs = _t_renderEnd - nowMs;

    deps.tickFpSessionElevDebug({
      nowMs,
      dt,
      totalFrameMs,
      physicsMs,
      elevatorMs,
      presentMs,
      renderMs,
      playerPos: deps.pos,
      camera: deps.camera,
      fpElevators: deps.fpElevators,
      displayOffset: deps._displayOffset,
      playerRig: deps.playerRig,
      lastTickElevSupportVyMps: mainRaf.lastTickElevSupportVyMps,
      lastTickHudCabVyMps: mainRaf.lastTickHudCabVyMps,
      lastTickElevVyBlendAbs: mainRaf.lastTickElevVyBlendAbs,
      floorVisCamWorld: deps._floorVisCamWorld,
      floorVisCamDir: deps._floorVisCamDir,
    });

    onFpSessionPostRenderFrame(nowMs);
    deps.logFpPerf();
    pushFpPerfFrame(
      nowMs,
      totalFrameMs,
      {
        physicsMs,
        elevatorMs,
        presentMs,
        renderMs,
        renderFloorPlateVisMs,
        renderFpEnvironmentMs,
        renderFpEnvironmentSkyMs: fpEnvTimings.skyMs,
        renderFpEnvironmentLightingMs: fpEnvTimings.lightingMs,
        renderSetupMs,
        renderThreeMs,
      },
      {
        drawCalls: frameDrawCalls,
        triangles: frameTriangles,
        ...deps.getFpPerfSceneCounters(),
      },
      fpCameraYawRad(deps.camera),
    );
  };

  return { runFrame };
}

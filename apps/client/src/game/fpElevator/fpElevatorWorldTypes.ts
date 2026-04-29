import * as THREE from "three";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import type { CollisionAabb } from "@the-mammoth/world";
import type { DbConnection } from "../../module_bindings";
import type { FpElevCabMotionAudioEmitter } from "../audio/elevatorCabMotionAudio.js";
import type { FpKinematicSupportProvider } from "../fpPhysics/fpKinematicSupport.js";
import type { DynamicCollisionQueryPose } from "../fpPhysics/fpPlayerCollision.js";

export type MountFpElevatorWorldOpts = {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  building: BuildingDoc;
  getFloorDoc: (floorDocId: string) => FloorDoc;
  floorSpacingM?: number;
  /**
   * World XZ bounds of the building mesh (e.g. `Box3` from `buildingRoot`). When set, pitch-based
   * floor-band widening (looking up/down toward distant storeys) is **only** applied when the camera
   * is outside the footprint core (see {@link fpBuildingExteriorViewShouldRevealFullStack}). While
   * in the core — typical apartments, corridors, hoistway not at edge — upward pitch no longer
   * expands the band to the roof (which was ~2M submitted triangles in multi-storey shells).
   */
  floorVisPitchLookaheadWorldBoundsXz?: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
};

/**
 * Snapshot of replicated + predicted cab state while the local player is inside a **moving** car.
 * Used by `window.__mmElevDebug` to correlate hitches with prediction / clock / visibility band.
 */
export type FpElevatorRideDebugSnapshot = {
  shaftKey: string;
  phase: number;
  currentLevel: number;
  moveFromLevel: number;
  moveToLevel: number;
  moveU: number;
  /** Raw replica feet Y at last server sample (prediction uses this + elapsed time while moving). */
  replicaCabFloorY: number;
  cabFeetY: number;
  cabVyMps: number;
  doorOpen01: number;
  /** Seconds from server-stamped sample time to this frame's eval time (prediction input). */
  elapsedSecSinceServerSample: number;
  /** Estimated `client_epoch - server_epoch` (ms); 0 before first replica. */
  serverClockOffsetMs: number;
  /** Offset actually used for this moving leg's prediction (prevents mid-ride offset step-ups). */
  serverClockRideOffsetMs: number;
  clockHasEstimate: boolean;
  floorVisBand: { lo: number; hi: number };
};

export type MountFpElevatorWorldResult = {
  dispose(): void;
  /**
   * Advance replicated cab evaluation time before locomotion/support sampling so moving-cab prediction stays aligned.
   * Pass `frameDtSec` from the main rAF tick so move-`u` smoothing advances once per frame; omit it during reconcile
   * replay so `getCabY` uses raw replica extrapolation for those steps.
   */
  syncCabEvalClock(nowMs: number, frameDtSec?: number): void;
  tick(dt: number, nowMs: number, playerPos: THREE.Vector3): void;
  /** Crosshair hover + click flash for per-landing hail meshes (no reducer). */
  syncLandingHailUi(camera: THREE.PerspectiveCamera, playerPos: THREE.Vector3, nowMs: number): void;
  readonly kinematicSupport: FpKinematicSupportProvider;
  tryRaycastFloorPick(
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean;
  consumeInteractKey(playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean;
  shouldSuppressEpickup(playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean;
  /** When in the narrow sill strip, drive the shared bottom interact prompt (see `fpPickupPrompt`). */
  getExteriorDoorInteractPrompt(
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): {
    willClose: boolean;
    floorLabel: string;
  } | null;
  visitCollisionAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ): void;
  /**
   * After horizontal collision resolution, snap feet onto a cab roof if the body crossed down
   * onto it (client mirrors server `resolve_player_generated_collision_aabbs` roof landing).
   */
  applyCabRoofFeetSnap(
    pos: { x: number; y: number; z: number },
    prevPos: { y: number },
    bodyHeightM: number,
    footRadiusM: number,
  ): boolean;
  getFloorVisibilityBand(
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    /** Camera / eye world Y — widens visible storeys above the feet when looking up. */
    bandEyeWorldY?: number,
    /** Camera forward Y — extends the upper bound toward storeys above the player. */
    bandViewDirY?: number,
    /**
     * Camera / eye world XZ — with {@link bandEyeWorldY}, OR'd into hoistway-column detection so
     * shaft-adjacent shells stay visible when the view is inside the shaft but feet are not.
     */
    bandEyeWorldX?: number,
    bandEyeWorldZ?: number,
    /** Camera forward world XZ — used to tell whether the doorway is actually in view from the cab. */
    bandViewDirX?: number,
    bandViewDirZ?: number,
  ): {
    lo: number;
    hi: number;
  };
  /**
   * Hide auxiliary landing visuals (hail panels + pick boxes) on every shaft while the current cab
   * view is occluded by the cab walls (sealed or simply not on a doorway sightline). The actual
   * landing door mesh stays visible so the stopped-floor red corridor door does not disappear from
   * inside the cab. Call once per frame from the same pass that runs
   * {@link syncBuildingFloorPlateVisibility} — the toggle is a no-op when the state is unchanged.
   */
  syncShaftVisualCulling(
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): void;
  /**
   * True when the player is inside the HUD cab volume of any shaft and the current camera view is
   * fully occluded by cab walls (door shut, or not positioned/facing through the doorway).
   * Session-level visibility passes use this to skip plates, stair segments, and unit shells that
   * cannot contribute pixels (see `mountFpSession` → `syncBuildingFloorPlateVisibility`).
   */
  isInsideCabOccludedView(
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): boolean;
  /** True when feet or eye are inside any elevator cab HUD volume. */
  isInsideAnyCabHud(
    px: number,
    py: number,
    pz: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
  ): boolean;
  /**
   * When {@link isInsideCabOccludedView} is true, returns the cab's current display storey so the
   * session visibility pass can collapse to that floor instead of guessing from the widened band.
   */
  getCabOccludedViewStorey(
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): number | null;
  /**
   * When the player is inside the HUD cab volume and the car is in {@link import("./fpElevatorConstants.js").ELEVATOR_PHASE_MOVING},
   * returns prediction + visibility-band fields for hitch debugging. Otherwise `null`.
   */
  sampleRideDebug(
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    bandEyeWorldY?: number,
    bandViewDirY?: number,
  ): FpElevatorRideDebugSnapshot | null;
  /**
   * Predicted cab vertical velocity (m/s) when inside the HUD car volume during {@link import("./fpElevatorConstants.js").ELEVATOR_PHASE_MOVING};
   * otherwise `0`. Use with kinematic support Vy: `max(abs(support), abs(this))` so view smoothing matches
   * the same source as `sampleRideDebug().cabVyMps` when feet sampling lags.
   */
  getHudMovingCabVyMps(px: number, py: number, pz: number, nowMs: number): number;
  /**
   * True when the car is {@link import("./fpElevatorConstants.js").ELEVATOR_PHASE_MOVING} and the feet point is inside the **rider snap /
   * physics cab volume** (door-aware), not just the HUD pick volume. Used by prediction reconcile:
   * replay uses different dt than the server tick, so small phantom error hits **X, Y, and Z** — skipping
   * only Y still pumped `_displayOffset` from horizontal corrections (see `mountFpSession`).
   */
  ignoreSmallPoseReconcileWhileMovingElevatorRider(
    px: number,
    py: number,
    pz: number,
    nowMs: number,
  ): boolean;
  /**
   * World-space emitters for looping cab motion audio — one entry per shaft in
   * {@link import("./fpElevatorConstants.js").ELEVATOR_PHASE_MOVING}. Playback gates on vertical speed in `elevatorCabMotionAudio.sync`.
   */
  getCabMotionAudioEmitters(nowMs: number): readonly FpElevCabMotionAudioEmitter[];
};

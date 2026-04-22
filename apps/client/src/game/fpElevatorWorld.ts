import * as THREE from "three";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import { ElevatorCabDefSchema, LandingKitDefSchema } from "@the-mammoth/schemas";
import { fpLocomotionConstants } from "@the-mammoth/engine";
import cabAuthoringJson from "../../../../content/elevator/cab.json";
import landingKitAuthoringJson from "../../../../content/elevator/landing_kit.json";
import {
  buildFloorShortLabelMap,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  type CollisionAabb,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  estimateStoreyFromFeetY,
  EXTERIOR_DOOR_ANIM_SPEED,
  FP_LOCOMOTION_SKIN,
  listElevatorShaftLayouts,
  MAMMOTH_MERGED_CAB_FLOOR_PICK_UD,
  maxBuildingLevelIndex,
  resolveMergedCabFloorPickLevel,
  type ElevatorShaftLayout,
  type MergedCabFloorPickLayout,
} from "@the-mammoth/world";
import type { DbConnection } from "../module_bindings";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types";
import {
  ELEVATOR_PHASE_MOVING,
  ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M,
  ELEVATOR_WALK_MERGE_GATE_XZ_EXTRA_M,
  ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_ABOVE_M,
  ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_BELOW_M,
  ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M,
  ELEVATOR_WALK_MERGE_FEET_MAX_OFFSET_ABOVE_CAB_FLOOR_M,
  FLOOR_PICK_MAX_RAY_M,
  FP_ELEV_FLOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
  type FpElevFloorPickUserData,
  type FpElevLandingHailPickUserData,
} from "./fpElevatorConstants.js";
import {
  fpBuildingExteriorViewShouldRevealFullStack,
  fpBuildingFloorPlateVisibilityBand,
} from "./fpBuildingFloorPlateVisibilityBand.js";
import {
  predictMovingCabFeetWorldY,
  predictMovingCabFeetWorldYVelocityMps,
} from "./fpElevatorCabPredict.js";
import {
  nextElevatorCarReplicaSample,
  pruneElevatorCarReplicaHistory,
  selectElevatorCarReplicaSample,
  type FpElevatorCarReplicaSample,
} from "./fpElevatorReplicaHistory.js";
import { createFpElevatorServerClock } from "./fpElevatorServerClock.js";
import { FpElevatorShaftVisual } from "./fpElevatorShaftVisual.js";
import { floorButtonLabel, type ElevatorDoorFace } from "./fpElevatorLabels.js";
import {
  fpElevCarPanelDoorwayViewLocal,
  fpElevFeetInHoistwayColumnForFloorStack,
  fpElevFloorPickMeshesShouldShow,
  fpElevFloorPickRaycastShouldProceed,
  fpElevatorClampWorldXZToCabIfRider,
  fpElevatorHudCarContainsLocalPoint,
  fpElevCabWalkMergeSupportFeetAllowed,
  fpElevPlayerInsideCabAuthoritativePlateLocal,
  fpElevatorRiderSnapContainsLocalPoint,
} from "./fpElevatorVolumes.js";
import {
  fpElevLandingExteriorDoorInCabDockedInteract,
  fpElevLandingExteriorDoorInteractPlateLocal,
  fpElevLandingExteriorDoorNearWhileShaftAuthorized,
  EXTERIOR_DOOR_COLLISION_OPEN_THRESH,
  EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
  EXTERIOR_INTERACT_WORLD_RADIUS_M,
  fpElevLandingExteriorDoorNearWorldPose,
  landingExteriorDoorRowKey,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
} from "./fpElevatorLandingExteriorDoor.js";
import {
  DOOR_SWING_OPEN01_VIS_SMOOTH_PER_S,
  ELEVATOR_MOVE_SPEED_MPS,
} from "./fpElevatorConstants.js";
import { visitFpElevatorWorldCollisionAabbsInXZ } from "./fpElevatorWorldCollision.js";
import type {
  FpKinematicAttachment,
  FpKinematicSupportProvider,
  FpKinematicSupportSampleOpts,
  FpKinematicSupportSurface,
} from "./fpKinematicSupport.js";
import type { DynamicCollisionQueryPose } from "./fpPlayerCollision.js";

export { floorButtonLabel } from "./fpElevatorLabels.js";
export {
  FP_ELEV_FLOOR_PICK_UD,
  type FpElevFloorPickUserData,
} from "./fpElevatorConstants.js";
export {
  fpElevCarPanelDoorwayViewLocal,
  fpElevFeetInHoistwayColumnForFloorStack,
  fpElevFloorPickMeshesShouldShow,
  fpElevFloorPickRaycastShouldProceed,
  fpElevatorClampWorldXZToCabIfRider,
  fpElevatorDoorSideSlackM,
  fpElevatorInDoorOutwardPadShellOnly,
  fpElevatorHudCarContainsLocalPoint,
  fpElevCabWalkMergeSupportFeetAllowed,
  fpElevPlayerInsideCabAuthoritativePlateLocal,
  fpElevatorPlateLocalClampBounds,
  fpElevatorPlateLocalInCabPhysicsVolume,
  fpElevatorRiderSnapContainsLocalPoint,
} from "./fpElevatorVolumes.js";

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
  /** Seconds from server-stamped sample time to this frame’s eval time (prediction input). */
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
     * Camera / eye world XZ — with {@link bandEyeWorldY}, OR’d into hoistway-column detection so
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
   * When the player is inside the HUD cab volume and the car is in {@link ELEVATOR_PHASE_MOVING},
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
   * Predicted cab vertical velocity (m/s) when inside the HUD car volume during {@link ELEVATOR_PHASE_MOVING};
   * otherwise `0`. Use with kinematic support Vy: `max(abs(support), abs(this))` so view smoothing matches
   * the same source as `sampleRideDebug().cabVyMps` when feet sampling lags.
   */
  getHudMovingCabVyMps(px: number, py: number, pz: number, nowMs: number): number;
  /**
   * True when the car is {@link ELEVATOR_PHASE_MOVING} and the feet point is inside the **rider snap /
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
};

function parseElevatorVisualDefs():
  | { cabDef?: undefined; landingKitDef?: undefined }
  | { cabDef?: import("@the-mammoth/schemas").ElevatorCabDef; landingKitDef?: import("@the-mammoth/schemas").LandingKitDef } {
  const cab = ElevatorCabDefSchema.safeParse(cabAuthoringJson);
  const kit = LandingKitDefSchema.safeParse(landingKitAuthoringJson);
  return {
    cabDef: cab.success ? cab.data : undefined,
    landingKitDef: kit.success ? kit.data : undefined,
  };
}

const elevatorVisualAuthoring = parseElevatorVisualDefs();

const EXTERIOR_INTERACT_SHAFT_CENTER_PAD_M = EXTERIOR_INTERACT_WORLD_RADIUS_M + 0.45;
const LANDING_HAIL_PICK_SHAFT_CENTER_PAD_M = 9.0;

/**
 * Door openness required before the opening is visually wide enough to justify doorway-sightline
 * logic. It no longer forces a full-stack reveal from inside the cab; it only decides when the
 * doorway can count as a real view out for cab-occlusion / landing-visibility decisions.
 */
const DOOR_OPEN_REVEAL_THRESHOLD = 0.16;
/** Horizontal look component toward the doorway required before we assume the camera can see out. */
const DOORWAY_VIEW_DIR_DOT_MIN = 0.2;

function fpElevDoorwayViewFacingDoor(
  face: ElevatorDoorFace,
  viewDirX: number,
  viewDirZ: number,
): boolean {
  if (face === "e") return viewDirX > DOORWAY_VIEW_DIR_DOT_MIN;
  if (face === "w") return viewDirX < -DOORWAY_VIEW_DIR_DOT_MIN;
  if (face === "n") return viewDirZ > DOORWAY_VIEW_DIR_DOT_MIN;
  return viewDirZ < -DOORWAY_VIEW_DIR_DOT_MIN;
}

export function mountFpElevatorWorld(opts: MountFpElevatorWorldOpts): MountFpElevatorWorldResult {
  const floorSpacingM = opts.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const floorVisPitchLookaheadWorldBoundsXz = opts.floorVisPitchLookaheadWorldBoundsXz;
  const ox = opts.building.worldOrigin?.[0] ?? 0;
  const oy = opts.building.worldOrigin?.[1] ?? 0;
  const oz = opts.building.worldOrigin?.[2] ?? 0;
  const maxLevel = maxBuildingLevelIndex(opts.building);
  const floorLabelByLevel = buildFloorShortLabelMap(opts.building);
  const layouts = listElevatorShaftLayouts(opts.building, opts.getFloorDoc);
  const layoutByKey = new Map(layouts.map((l) => [l.planKey, l] as const));
  const shaftSpatialByKey = new Map(
    layouts.map((layout) => {
      const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
      const halfSpan = Math.max(hx, hz);
      return [
        layout.planKey,
        {
          exteriorInteractMaxCenterDistSq: (halfSpan + EXTERIOR_INTERACT_SHAFT_CENTER_PAD_M) ** 2,
          hailPickMaxCenterDistSq: (halfSpan + LANDING_HAIL_PICK_SHAFT_CENTER_PAD_M) ** 2,
        },
      ] as const;
    }),
  );

  const storeyOpts = {
    buildingWorldOriginY: oy,
    floorSpacingM,
    maxLevel,
  };

  const visuals = new Map<string, FpElevatorShaftVisual>();
  for (const layout of layouts) {
    const v = new FpElevatorShaftVisual(
      layout,
      [ox, oy, oz],
      {
        shaftKey: layout.planKey,
        maxLevel,
        floorLabelByLevel,
        floorSpacingM,
        buildingWorldOriginY: oy,
      },
      elevatorVisualAuthoring,
    );
    visuals.set(layout.planKey, v);
    opts.buildingRoot.add(v.root);
  }

  const raycaster = new THREE.Raycaster();
  const screenCenterNdc = new THREE.Vector2(0, 0);
  const _cameraWorldPos = new THREE.Vector3();
  // Pooled roots array — reused every frame to avoid per-frame allocation in raycast queries.
  const _hailPickRoots: THREE.Object3D[] = [];
  // Throttle the hail-hover raycast to every 3rd render frame.  Hover state changes don't
  // need 60 Hz resolution, and the raycast itself allocates internally in Three.js.
  let _hailSyncFrameCounter = 0;
  const pendingExteriorDoorToggle = {
    shaftKey: "",
    level: 0,
    interactHintY: 0,
    expectedDesiredOpen: 0 as 0 | 1,
    retryCount: 0,
    nextRetryAtMs: 0,
    expireAtMs: 0,
  };

  /** Brief glow on the button that accepted a floor request (client-only). */
  const pickFlash = { shaftKey: "", level: 0, untilMs: 0 };
  /** Brief glow on the landing hail mesh that accepted a hail (client-only). */
  const hailPickFlash = { shaftKey: "", level: 0, untilMs: 0 };

  const latest = new Map<string, ElevatorCar>();
  const landingByRowKey = new Map<string, ElevatorLandingDoor>();
  /** Short local history so reconcile can replay against the cab state that existed for each input. */
  const replicaHistoryByKey = new Map<string, FpElevatorCarReplicaSample[]>();
  /** Cab `doorOpen01` smooth chase toward replica (cab motion is server state-machine driven). */
  const cabDoorOpenSmoothed = new Map<string, number>();
  /**
   * Landing corridor swing: client-integrated toward `desiredOpen` at {@link EXTERIOR_DOOR_ANIM_SPEED}
   * (same rate as server physics) so the leaf is smooth at frame rate instead of 20 Hz replica steps.
   */
  const landingSwingVisual = new Map<string, number>();
  /** Evaluation time for cab Y this frame (set in {@link syncCabEvalClock} before locomotion). */
  let cabEvalNowMs = performance.now();
  /**
   * When true, MOVING cabs use smoothed move-u toward the replica-predicted target (reduces 20 Hz row hitches).
   * False during reconcile replay (`syncCabEvalClock` without `frameDtSec`).
   */
  let cabEvalUseSmoothedMoveU = false;
  const performanceEpochOriginMs =
    typeof performance.timeOrigin === "number"
      ? performance.timeOrigin
      : Date.now() - performance.now();
  /**
   * Tracks the apparent client↔server wall-clock offset so cab prediction elapsed-time is
   * measured on the server's timeline instead of the client's.  A fixed 100–500 ms clock skew
   * (NTP drift, `performance.timeOrigin` quantisation, OS clock adjustments) would otherwise bake
   * a constant prediction offset into every frame — which the reconcile pass then paints over as
   * per-tick corrections, i.e. the residual hitch during rides.
   */
  const serverClock = createFpElevatorServerClock();
  /** Pre-allocated map reused each tick to pass swing values to per-shaft visuals — no allocation per shaft per frame. */
  const _swingByLevel = new Map<number, number>();
  /**
   * Live MOVING cab: integrate+clamp `u` in {@link cabIntegrateUByKey}, then EMA into
   * {@link cabSmoothedUByKey} for **display** (integration must not feed off smoothed values).
   * Ceiling chain: elapsed low-pass → soft-ceiling EMA → hard raw cap.
   */
  /** Integrate+clamp only; never read back smoothed display `u`. */
  const cabIntegrateUByKey = new Map<string, number>();
  /** Low-pass of {@link cabIntegrateUByKey} for {@link getCabY} / rider support. */
  const cabSmoothedUByKey = new Map<string, number>();
  const cabMoveLegByKey = new Map<string, string>();
  /**
   * Per moving leg, hold the smallest client-server clock offset seen so far. This lets the
   * predictor benefit from newer lower-latency samples, but avoids stepping the cab backward when
   * the rolling min-offset estimator jumps upward mid-ride.
   */
  const cabRideClockOffsetFloorMsByKey = new Map<string, number>();
  /** Elapsed low-pass **only** for {@link advanceCabSmoothU} soft ceiling (not for integration). */
  const ELAPSED_FOR_U_CEILING_SMOOTH_PER_S = 11;
  const cabFilteredElapsedSecByKey = new Map<string, number>();
  /** Second-stage EMA on soft ceiling U before {@link advanceCabSmoothU} clamps with hard cap. */
  const CEILING_U_SOFT_EMA_PER_S = 9;
  const cabSoftCeilingUByKey = new Map<string, number>();
  /** Final low-pass on displayed move-u (damps clamp/ceiling kinks without drifting integration). */
  const CAB_MOVE_U_DISPLAY_SMOOTH_PER_S = 14;

  const advanceCabDoorOpenVisual = (dtSec: number) => {
    if (!(dtSec > 0)) return;
    const k = DOOR_SWING_OPEN01_VIS_SMOOTH_PER_S;
    const alpha = 1 - Math.exp(-k * dtSec);
    for (const [key, row] of latest) {
      const t = row.doorOpen01;
      const p = cabDoorOpenSmoothed.get(key) ?? t;
      cabDoorOpenSmoothed.set(key, p + (t - p) * alpha);
    }
  };

  const advanceLandingSwingClientVisual = (dtSec: number) => {
    if (!(dtSec > 0)) return;
    const maxStep = EXTERIOR_DOOR_ANIM_SPEED * dtSec;
    for (const [rk, row] of landingByRowKey) {
      const goal = (row.desiredOpen ?? 0) !== 0 ? 1 : 0;
      let v = landingSwingVisual.get(rk) ?? row.swingOpen01;
      if (v < goal - 1e-5) v = Math.min(goal, v + maxStep);
      else if (v > goal + 1e-5) v = Math.max(goal, v - maxStep);
      else v = goal;
      landingSwingVisual.set(rk, v);
    }
  };
  const feetYForLayout = (layout: ElevatorShaftLayout, level: number): number =>
    elevatorSupportFeetWorldY({
      buildingWorldOriginY: oy,
      levelIndex: Math.max(1, Math.min(maxLevel, level)),
      floorSpacingM,
      shaftPlateLocalY: layout.plateLocalY,
      shaftSy: layout.sy,
    });

  /** Which floor button to light in the cab from world cab feet Y (smooth while traveling). */
  const cabFloorButtonDisplayLevel = (layout: ElevatorShaftLayout, cabFeetWorldY: number): number => {
    const y1 = feetYForLayout(layout, 1);
    const y2 = feetYForLayout(layout, 2);
    const delta = y2 - y1;
    if (!(delta > 1e-6)) return 1;
    const frac = 1 + (cabFeetWorldY - y1) / delta;
    return Math.max(1, Math.min(maxLevel, Math.round(frac)));
  };

  const ingest = (row: ElevatorCar) => {
    const history = replicaHistoryByKey.get(row.shaftKey) ?? [];
    const prev = history[history.length - 1];
    const now = performance.now();
    const nowEpochMs = performanceEpochOriginMs + now;
    const sampleServerEpochMs = Number(row.sampleServerMicros) / 1000;
    if (sampleServerEpochMs > 0) {
      serverClock.observe(nowEpochMs, sampleServerEpochMs);
    }
    history.push(nextElevatorCarReplicaSample(prev, row, now));
    pruneElevatorCarReplicaHistory(history, now);
    replicaHistoryByKey.set(row.shaftKey, history);
    latest.set(row.shaftKey, row);
    if (!cabDoorOpenSmoothed.has(row.shaftKey)) {
      cabDoorOpenSmoothed.set(row.shaftKey, row.doorOpen01);
    }
  };

  for (const row of opts.conn.db.elevator_car) {
    ingest(row as ElevatorCar);
  }

  const ingestLanding = (row: ElevatorLandingDoor) => {
    landingByRowKey.set(row.rowKey, row);
    if (!landingSwingVisual.has(row.rowKey)) {
      landingSwingVisual.set(row.rowKey, row.swingOpen01);
    }
  };
  for (const row of opts.conn.db.elevator_landing_door) {
    ingestLanding(row as ElevatorLandingDoor);
  }

  const onElevRow = (_ctx: unknown, row: ElevatorCar) => {
    ingest(row);
  };
  opts.conn.db.elevator_car.onInsert(onElevRow);
  opts.conn.db.elevator_car.onUpdate(onElevRow);

  const onLandingInsert = (_ctx: unknown, row: ElevatorLandingDoor) => {
    ingestLanding(row);
  };
  const onLandingUpdate = (_ctx: unknown, _old: ElevatorLandingDoor, row: ElevatorLandingDoor) => {
    ingestLanding(row);
  };
  const onLandingDelete = (_ctx: unknown, row: ElevatorLandingDoor) => {
    landingByRowKey.delete(row.rowKey);
    landingSwingVisual.delete(row.rowKey);
  };
  opts.conn.db.elevator_landing_door.onInsert(onLandingInsert);
  opts.conn.db.elevator_landing_door.onUpdate(onLandingUpdate);
  opts.conn.db.elevator_landing_door.onDelete(onLandingDelete);

  const getReplicaSample = (
    key: string,
    evalWallClockMs?: number,
  ): FpElevatorCarReplicaSample | null => {
    const history = replicaHistoryByKey.get(key);
    if (!history || history.length === 0) return null;
    if (evalWallClockMs === undefined) return history[history.length - 1] ?? null;
    return selectElevatorCarReplicaSample(history, evalWallClockMs);
  };

  const evalEpochMs = (wallClockMs: number): number => performanceEpochOriginMs + wallClockMs;

  const getRideClockOffsetMs = (row: ElevatorCar): number => {
    const estimatedOffsetMs = serverClock.estimatedOffsetMs();
    if (row.phase !== ELEVATOR_PHASE_MOVING) return estimatedOffsetMs;
    const floorOffsetMs = cabRideClockOffsetFloorMsByKey.get(row.shaftKey);
    if (floorOffsetMs === undefined) return estimatedOffsetMs;
    return Math.min(estimatedOffsetMs, floorOffsetMs);
  };

  /**
   * Elapsed seconds from the server-stamp time of `row` to the server-side moment corresponding
   * to `evalWallClockMs` on the client — using the estimated clock offset so prediction tracks
   * the server's physics clock rather than the raw browser wall clock.
   */
  const elapsedSecSinceServerSample = (row: ElevatorCar, evalWallClockMs: number): number => {
    if (row.sampleServerMicros === 0n) return 0;
    const serverNowEpochMs = evalEpochMs(evalWallClockMs) - getRideClockOffsetMs(row);
    const sampleServerEpochMs = Number(row.sampleServerMicros) / 1000;
    return Math.max(0, (serverNowEpochMs - sampleServerEpochMs) * 0.001);
  };

  const advanceCabSmoothU = (dtSec: number, nowMs: number) => {
    if (!(dtSec > 0) || !Number.isFinite(dtSec)) return;
    const elapsedBlend = 1 - Math.exp(-ELAPSED_FOR_U_CEILING_SMOOTH_PER_S * dtSec);
    const softCeilingBlend = 1 - Math.exp(-CEILING_U_SOFT_EMA_PER_S * dtSec);
    const displayUBlend = 1 - Math.exp(-CAB_MOVE_U_DISPLAY_SMOOTH_PER_S * dtSec);
    const speed = ELEVATOR_MOVE_SPEED_MPS;
    for (const key of latest.keys()) {
      const row = latest.get(key);
      const layout = layoutByKey.get(key);
      if (!row || !layout) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) {
        cabIntegrateUByKey.delete(key);
        cabSmoothedUByKey.delete(key);
        cabMoveLegByKey.delete(key);
        cabRideClockOffsetFloorMsByKey.delete(key);
        cabFilteredElapsedSecByKey.delete(key);
        cabSoftCeilingUByKey.delete(key);
        continue;
      }

      const leg = `${row.moveFromLevel}:${row.moveToLevel}`;
      const legChanged = cabMoveLegByKey.get(key) !== leg;
      if (legChanged) {
        cabMoveLegByKey.set(key, leg);
        cabIntegrateUByKey.delete(key);
        cabSmoothedUByKey.delete(key);
        cabRideClockOffsetFloorMsByKey.set(key, serverClock.estimatedOffsetMs());
        cabFilteredElapsedSecByKey.delete(key);
        cabSoftCeilingUByKey.delete(key);
      }

      const y0 = feetYForLayout(layout, row.moveFromLevel);
      const y1 = feetYForLayout(layout, row.moveToLevel);
      const dist = Math.abs(y1 - y0);
      const need = Math.max(1e-4, dist / Math.max(0.08, speed));

      const rawElapsed = elapsedSecSinceServerSample(row, nowMs);
      const prevF = cabFilteredElapsedSecByKey.get(key);
      const filtElapsed =
        prevF === undefined
          ? rawElapsed
          : prevF + (rawElapsed - prevF) * elapsedBlend;
      cabFilteredElapsedSecByKey.set(key, filtElapsed);
      const elapsedForCeiling = Math.min(rawElapsed, filtElapsed);
      const softCeilingU = Math.min(1, row.moveU + elapsedForCeiling / need);
      const hardCapU = Math.min(1, row.moveU + rawElapsed / need);
      const prevSoftCeil = cabSoftCeilingUByKey.get(key);
      const softCeilSmoothed =
        prevSoftCeil === undefined
          ? softCeilingU
          : prevSoftCeil + (softCeilingU - prevSoftCeil) * softCeilingBlend;
      cabSoftCeilingUByKey.set(key, softCeilSmoothed);
      const ceilingU = Math.min(hardCapU, softCeilSmoothed);

      let uInt = legChanged ? row.moveU : (cabIntegrateUByKey.get(key) ?? row.moveU);
      uInt = Math.min(1, uInt + dtSec / need);
      uInt = Math.min(uInt, ceilingU);
      uInt = Math.min(1, Math.max(uInt, row.moveU));
      cabIntegrateUByKey.set(key, uInt);

      const uPrevDisp = cabSmoothedUByKey.get(key);
      const uDisp =
        uPrevDisp === undefined || legChanged
          ? uInt
          : uPrevDisp + (uInt - uPrevDisp) * displayUBlend;
      const uOut = Math.min(ceilingU, Math.max(row.moveU, uDisp));
      cabSmoothedUByKey.set(key, uOut);
    }
    for (const key of cabSmoothedUByKey.keys()) {
      if (!latest.has(key)) {
        cabIntegrateUByKey.delete(key);
        cabSmoothedUByKey.delete(key);
        cabMoveLegByKey.delete(key);
        cabRideClockOffsetFloorMsByKey.delete(key);
        cabFilteredElapsedSecByKey.delete(key);
        cabSoftCeilingUByKey.delete(key);
      }
    }
  };

  const getCabY = (key: string, evalWallClockMs?: number): number => {
    const sample = getReplicaSample(key, evalWallClockMs ?? cabEvalNowMs);
    const row = sample?.row;
    if (!row) return Number.NaN;
    if (row.phase !== ELEVATOR_PHASE_MOVING) {
      return row.cabFloorY;
    }
    const layout = layoutByKey.get(key);
    if (!layout) return row.cabFloorY;
    const tEval = evalWallClockMs ?? cabEvalNowMs;
    const uSmooth = cabSmoothedUByKey.get(key);
    if (cabEvalUseSmoothedMoveU && uSmooth !== undefined) {
      return predictMovingCabFeetWorldY({
        moveFromLevel: row.moveFromLevel,
        moveToLevel: row.moveToLevel,
        moveUAtReplica: uSmooth,
        elapsedSecSinceReplica: 0,
        feetYForLevel: (lv) => feetYForLayout(layout, lv),
      });
    }
    return predictMovingCabFeetWorldY({
      moveFromLevel: row.moveFromLevel,
      moveToLevel: row.moveToLevel,
      moveUAtReplica: row.moveU,
      elapsedSecSinceReplica: elapsedSecSinceServerSample(row, tEval),
      feetYForLevel: (lv) => feetYForLayout(layout, lv),
    });
  };

  const getCabVerticalVelocityMps = (key: string, evalWallClockMs?: number): number => {
    const sample = getReplicaSample(key, evalWallClockMs ?? cabEvalNowMs);
    const row = sample?.row;
    if (!row || row.phase !== ELEVATOR_PHASE_MOVING) return 0;
    const layout = layoutByKey.get(key);
    if (!layout) return 0;
    const tEval = evalWallClockMs ?? cabEvalNowMs;
    const uSmooth = cabSmoothedUByKey.get(key);
    if (cabEvalUseSmoothedMoveU && uSmooth !== undefined) {
      return predictMovingCabFeetWorldYVelocityMps({
        moveFromLevel: row.moveFromLevel,
        moveToLevel: row.moveToLevel,
        moveUAtReplica: uSmooth,
        elapsedSecSinceReplica: 0,
        feetYForLevel: (lv) => feetYForLayout(layout, lv),
      });
    }
    return predictMovingCabFeetWorldYVelocityMps({
      moveFromLevel: row.moveFromLevel,
      moveToLevel: row.moveToLevel,
      moveUAtReplica: row.moveU,
      elapsedSecSinceReplica: elapsedSecSinceServerSample(row, tEval),
      feetYForLevel: (lv) => feetYForLayout(layout, lv),
    });
  };

  const getDoor = (key: string, nowMs: number): number => {
    const latestSample = getReplicaSample(key);
    const evalSample = getReplicaSample(key, nowMs);
    if (!evalSample) return 1;
    if (!latestSample || evalSample !== latestSample) {
      return evalSample.row.doorOpen01;
    }
    return THREE.MathUtils.clamp(
      cabDoorOpenSmoothed.get(key) ?? evalSample.row.doorOpen01,
      0,
      1,
    );
  };

  const sampleSupportSurface = (
    opts: FpKinematicSupportSampleOpts,
  ): FpKinematicSupportSurface | null => {
    let bestVy = 0;
    let bestCabGeom = -Infinity;
    const feetY = opts.probeTopY - fpLocomotionConstants.walkProbeDy;
    const fx0 = opts.worldX - opts.footRadiusXZ;
    const fx1 = opts.worldX + opts.footRadiusXZ;
    const fz0 = opts.worldZ - opts.footRadiusXZ;
    const fz1 = opts.worldZ + opts.footRadiusXZ;
    for (const [key] of latest) {
      const layout = layoutByKey.get(key);
      if (!layout) continue;
      const vis = visuals.get(key);
      if (!vis) continue;
      const row = latest.get(key);
      if (!row) continue;
      const { halfX: ihx, halfZ: ihz } = vis.inner;
      const wx = ox + row.plateX;
      const wz = oz + row.plateZ;
      const gateHx = ihx + ELEVATOR_WALK_MERGE_GATE_XZ_EXTRA_M;
      const gateHz = ihz + ELEVATOR_WALK_MERGE_GATE_XZ_EXTRA_M;
      if (fx1 < wx - gateHx || fx0 > wx + gateHx || fz1 < wz - gateHz || fz0 > wz + gateHz) {
        continue;
      }
      const innerAabbOverlap =
        fx1 >= wx - ihx && fx0 <= wx + ihx && fz1 >= wz - ihz && fz0 <= wz + ihz;
      const cabFeet = getCabY(key, opts.evalWallClockMs);
      if (!Number.isFinite(cabFeet)) continue;
      const vy = getCabVerticalVelocityMps(key, opts.evalWallClockMs);

      const yLo = cabFeet - ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M;
      const yHi = Math.min(
        cabFeet + vis.inner.innerH + ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M,
        cabFeet + ELEVATOR_WALK_MERGE_FEET_MAX_OFFSET_ABOVE_CAB_FLOOR_M,
      );
      if (
        feetY >= yLo &&
        feetY <= yHi &&
        fpElevCabWalkMergeSupportFeetAllowed({
          plateLocalX: opts.worldX - wx,
          plateLocalZ: opts.worldZ - wz,
          feetWorldY: feetY,
          cabFeetWorldY: cabFeet,
          inner: vis.inner,
          maxLevel,
          feetYForLevel: (level) => feetYForLayout(layout, level),
        })
      ) {
        const geomTop = cabFeet - FP_LOCOMOTION_SKIN;
        if (geomTop <= opts.probeTopY + opts.stepUpMargin && geomTop > bestCabGeom + 1e-5) {
          bestCabGeom = geomTop;
          bestVy = vy;
        }
      }

      if (innerAabbOverlap) {
        const roofFeetY = cabFeet + vis.inner.innerH;
        if (
          feetY >= roofFeetY - ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_BELOW_M &&
          feetY <= roofFeetY + ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_ABOVE_M
        ) {
          const geomTop = roofFeetY - FP_LOCOMOTION_SKIN;
          if (geomTop <= opts.probeTopY + opts.stepUpMargin && geomTop > bestCabGeom + 1e-5) {
            bestCabGeom = geomTop;
            bestVy = vy;
          }
        }
      }
    }
    if (bestCabGeom === -Infinity) return null;
    if (Number.isFinite(opts.baseTop) && opts.baseTop > bestCabGeom + 0.05) return null;
    return {
      topY: bestCabGeom,
      verticalVelocityMps: bestVy,
    };
  };

  const isInsideCarHud = (px: number, py: number, pz: number, key: string): boolean => {
    const row = latest.get(key);
    const vis = visuals.get(key);
    if (!row || !vis) return false;
    const lx = px - (ox + row.plateX);
    const lz = pz - (oz + row.plateZ);
    const cabY = getCabY(key);
    if (!Number.isFinite(cabY)) return false;
    return fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabY, vis.inner);
  };

  const hasCabDoorwaySightline = (
    key: string,
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): boolean => {
    const row = latest.get(key);
    const vis = visuals.get(key);
    if (!row || !vis) return false;
    const cabY = getCabY(key);
    if (!Number.isFinite(cabY)) return false;
    const doorOpen = getDoor(key, nowMs);
    if (doorOpen <= DOOR_OPEN_REVEAL_THRESHOLD) return false;
    const sightX = eyeWorldX ?? px;
    const sightY = eyeWorldY ?? py;
    const sightZ = eyeWorldZ ?? pz;
    const lx = sightX - (ox + row.plateX);
    const lz = sightZ - (oz + row.plateZ);
    if (!fpElevCarPanelDoorwayViewLocal(vis.layout.doorFace, lx, lz, sightY, cabY, vis.inner)) {
      return false;
    }
    if (viewDirX === undefined || viewDirZ === undefined) return true;
    return fpElevDoorwayViewFacingDoor(vis.layout.doorFace, viewDirX, viewDirZ);
  };

  const candidateLandingLevelRangeForFeetY = (py: number): [number, number] => {
    const storey = estimateStoreyFromFeetY(py, storeyOpts);
    return [Math.max(1, storey - 1), Math.min(maxLevel, storey + 1)];
  };

  const collectNearbyLandingHailPickRoots = (playerPos: THREE.Vector3): THREE.Object3D[] => {
    _hailPickRoots.length = 0;
    const [levelLo, levelHi] = candidateLandingLevelRangeForFeetY(playerPos.y);
    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      const spatial = shaftSpatialByKey.get(key);
      if (!row || !spatial) continue;
      const dx = playerPos.x - (ox + row.plateX);
      const dz = playerPos.z - (oz + row.plateZ);
      if (dx * dx + dz * dz > spatial.hailPickMaxCenterDistSq) continue;
      for (let level = levelLo; level <= levelHi; level++) {
        const pick = vis.getLandingHailPickForLevel(level);
        if (pick) _hailPickRoots.push(pick);
      }
    }
    return _hailPickRoots;
  };

  const resolveExteriorDoorInteractByPose = (
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null => {
    let best:
      | {
          shaftKey: string;
          level: number;
          score: number;
        }
      | null = null;
    const [levelLo, levelHi] = candidateLandingLevelRangeForFeetY(py);
    for (const [shaftKey, rowCar] of latest) {
      const layout = layoutByKey.get(shaftKey);
      const vis = visuals.get(shaftKey);
      const spatial = shaftSpatialByKey.get(shaftKey);
      if (!layout || !vis || !spatial) continue;
      const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
      const plateX = ox + rowCar.plateX;
      const plateZ = oz + rowCar.plateZ;
      const lx = px - plateX;
      const lz = pz - plateZ;
      if (lx * lx + lz * lz > spatial.exteriorInteractMaxCenterDistSq) continue;
      const cabY = getCabY(shaftKey);
      const phaseMoving = rowCar.phase === ELEVATOR_PHASE_MOVING;
      for (let level = levelLo; level <= levelHi; level++) {
        const fy = feetYForLayout(layout, level);
        const rawNearDoor =
          fpElevLandingExteriorDoorNearWorldPose(
            layout.doorFace,
            plateX,
            plateZ,
            hx,
            hz,
            px,
            py,
            pz,
            fy,
          ) ||
          fpElevLandingExteriorDoorInteractPlateLocal(
            layout.doorFace,
            hx,
            hz,
            lx,
            lz,
            py,
            fy,
          );
        const inAuthoritativeCab =
          Number.isFinite(cabY) &&
          fpElevPlayerInsideCabAuthoritativePlateLocal(lx, lz, py, cabY, vis.inner);
        const inHudCab =
          Number.isFinite(cabY) && fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabY, vis.inner);
        const nearDoor = fpElevLandingExteriorDoorNearWhileShaftAuthorized({
          rawNear: rawNearDoor,
          phaseMoving,
          inAuthoritativeCab,
          inHudCab,
        });
        const inCabDocked =
          Number.isFinite(cabY) &&
          fpElevLandingExteriorDoorInCabDockedInteract({
            plateWorldX: plateX,
            plateWorldZ: plateZ,
            px,
            py,
            pz,
            landingFeetWorldY: fy,
            cabFeetWorldY: cabY,
            inner: vis.inner,
            phaseMoving,
            dockYTolM: LANDING_PASSAGE_DOCK_Y_TOL_M,
          });
        if (!nearDoor && !inCabDocked) {
          continue;
        }
        const aimY = fy + 1.1;
        let aimX = plateX;
        let aimZ = plateZ;
        if (layout.doorFace === "e") aimX += hx;
        else if (layout.doorFace === "w") aimX -= hx;
        else if (layout.doorFace === "n") aimZ += hz;
        else aimZ -= hz;
        const dist = Math.hypot(px - aimX, py - aimY, pz - aimZ);
        const score = inCabDocked ? 1_000_000 - dist : -dist;
        if (best == null || score > best.score) {
          best = { shaftKey, level, score };
        }
      }
    }
    return best == null ? null : { shaftKey: best.shaftKey, level: best.level };
  };

  // Use the camera/eye sample for vertical targeting so prompts stay on the door in front of the
  // player when they're standing on the cab roof between landings.
  const exteriorDoorInteractHintY = (
    playerPos: Pick<THREE.Vector3, "y">,
    camera: THREE.PerspectiveCamera,
  ): number => {
    camera.getWorldPosition(_cameraWorldPos);
    return Number.isFinite(_cameraWorldPos.y) ? _cameraWorldPos.y : playerPos.y;
  };

  const resolveExteriorDoorInteract = (
    camera: THREE.PerspectiveCamera,
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null =>
    resolveExteriorDoorInteractByPose(
      px,
      exteriorDoorInteractHintY({ y: py }, camera),
      pz,
    );

  const landingDoorPendingSatisfied = (
    row: ElevatorLandingDoor | undefined,
    expectedDesiredOpen: 0 | 1,
    rowKey?: string,
  ): boolean => {
    if (!row) return false;
    const desired = (row.desiredOpen ?? 0) !== 0 ? 1 : 0;
    if (desired === expectedDesiredOpen) return true;
    const client =
      rowKey != null ? landingSwingVisual.get(rowKey) : undefined;
    const swing =
      client !== undefined && Number.isFinite(client) ? client : row.swingOpen01;
    // Rows often show `swingOpen01` before `desiredOpen` on the subscription; treat as acked.
    if (
      expectedDesiredOpen === 1 &&
      swing >= EXTERIOR_DOOR_COLLISION_OPEN_THRESH - 0.05
    ) {
      return true;
    }
    if (
      expectedDesiredOpen === 0 &&
      swing <= EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING + 0.08
    ) {
      return true;
    }
    return false;
  };

  const queueExteriorDoorToggleAttempt = (
    shaftKey: string,
    level: number,
    nowMs: number,
    interactHintY: number,
  ) => {
    const rowKey = landingExteriorDoorRowKey(shaftKey, level);
    const currentDesired = (landingByRowKey.get(rowKey)?.desiredOpen ?? 0) !== 0 ? 1 : 0;
    pendingExteriorDoorToggle.shaftKey = shaftKey;
    pendingExteriorDoorToggle.level = level;
    pendingExteriorDoorToggle.interactHintY = interactHintY;
    pendingExteriorDoorToggle.expectedDesiredOpen = currentDesired === 0 ? 1 : 0;
    pendingExteriorDoorToggle.retryCount = 0;
    pendingExteriorDoorToggle.nextRetryAtMs = nowMs;
    pendingExteriorDoorToggle.expireAtMs = nowMs + 1200;
  };

  const flushPendingExteriorDoorToggle = (nowMs: number, px: number, py: number, pz: number) => {
    if (!pendingExteriorDoorToggle.shaftKey) return;
    const pendingHit = resolveExteriorDoorInteractByPose(
      px,
      pendingExteriorDoorToggle.interactHintY || py,
      pz,
    );
    const stillSameTarget =
      pendingHit != null &&
      pendingHit.shaftKey === pendingExteriorDoorToggle.shaftKey &&
      pendingHit.level === pendingExteriorDoorToggle.level;
    if (!stillSameTarget) {
      pendingExteriorDoorToggle.shaftKey = "";
      pendingExteriorDoorToggle.interactHintY = 0;
      return;
    }
    const rowKey = landingExteriorDoorRowKey(
      pendingExteriorDoorToggle.shaftKey,
      pendingExteriorDoorToggle.level,
    );
    const landingRow = landingByRowKey.get(rowKey);
    if (
      landingDoorPendingSatisfied(landingRow, pendingExteriorDoorToggle.expectedDesiredOpen, rowKey)
    ) {
      pendingExteriorDoorToggle.shaftKey = "";
      pendingExteriorDoorToggle.interactHintY = 0;
      return;
    }
    if (nowMs >= pendingExteriorDoorToggle.expireAtMs) {
      const sk = pendingExteriorDoorToggle.shaftKey;
      const lv = pendingExteriorDoorToggle.level;
      const want = pendingExteriorDoorToggle.expectedDesiredOpen;
      if (!landingDoorPendingSatisfied(landingByRowKey.get(rowKey), want, rowKey)) {
        const hit = resolveExteriorDoorInteractByPose(
          px,
          pendingExteriorDoorToggle.interactHintY || py,
          pz,
        );
        const stillEligible =
          hit != null && hit.shaftKey === sk && hit.level === lv;
        if (stillEligible) {
          const got =
            (landingByRowKey.get(landingExteriorDoorRowKey(sk, lv))?.desiredOpen ?? 0) !== 0
              ? 1
              : 0;
          const swing =
            landingByRowKey.get(landingExteriorDoorRowKey(sk, lv))?.swingOpen01 ?? Number.NaN;
          console.warn(
            "[fpElevatorWorld] exterior door toggle not confirmed on replica (server may have rejected; see elevator_landing_exterior_door* module logs)",
            {
              shaftKey: sk,
              level: lv,
              expectedDesiredOpen: want,
              replicatedDesiredOpen: got,
              swingOpen01: swing,
              player: { x: px, y: py, z: pz },
            },
          );
        }
      }
      pendingExteriorDoorToggle.shaftKey = "";
      pendingExteriorDoorToggle.interactHintY = 0;
      return;
    }
    if (nowMs < pendingExteriorDoorToggle.nextRetryAtMs) return;
    try {
      void opts.conn.reducers.elevatorLandingExteriorDoorSet({
        shaftKey: pendingExteriorDoorToggle.shaftKey,
        level: pendingExteriorDoorToggle.level >>> 0,
        desiredOpen: pendingExteriorDoorToggle.expectedDesiredOpen,
        clientFeetX: px,
        clientFeetY: pendingExteriorDoorToggle.interactHintY || py,
        clientFeetZ: pz,
      });
      pendingExteriorDoorToggle.retryCount += 1;
      pendingExteriorDoorToggle.nextRetryAtMs = nowMs + 90;
    } catch (e) {
      console.warn("[fpElevatorWorld] elevatorLandingExteriorDoorSet retry", e);
      pendingExteriorDoorToggle.shaftKey = "";
    }
  };

  const tryRaycastLandingHail = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = 8.5;
    const roots = collectNearbyLandingHailPickRoots(playerPos);
    if (roots.length === 0) return false;
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const pick =
        (mesh.userData as Partial<FpElevLandingHailPickUserData>)[FP_ELEV_LANDING_HAIL_PICK_UD];
      if (!pick) continue;
      try {
        void opts.conn.reducers.elevatorHail({
          shaftKey: pick.shaftKey,
          level: pick.level >>> 0,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorHail ray", e);
        return false;
      }
      hailPickFlash.shaftKey = pick.shaftKey;
      hailPickFlash.level = pick.level;
      hailPickFlash.untilMs = nowMs + 520;
      return true;
    }
    return false;
  };

  const syncLandingHailUi = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ) => {
    // Skip 2 out of every 3 frames — hover-highlight update doesn't need 60 Hz resolution
    // and raycaster.intersectObjects() allocates internally every call.
    _hailSyncFrameCounter = (_hailSyncFrameCounter + 1) % 3;
    if (_hailSyncFrameCounter !== 0) return;

    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = 8.5;
    const roots = collectNearbyLandingHailPickRoots(playerPos);
    if (roots.length === 0) {
      for (const [key, vis] of visuals) {
        vis.setLandingHailHighlight({
          hoverLevel: 0,
          flashLevel: hailPickFlash.shaftKey === key ? hailPickFlash.level : 0,
          flashUntilMs: hailPickFlash.untilMs,
          nowMs,
        });
      }
      return;
    }
    const hits = raycaster.intersectObjects(roots, true);
    let best: { shaftKey: string; level: number; d: number } | null = null;
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const pick =
        (mesh.userData as Partial<FpElevLandingHailPickUserData>)[FP_ELEV_LANDING_HAIL_PICK_UD];
      if (!pick) continue;
      const d = h.distance;
      if (best == null || d < best.d) {
        best = { shaftKey: pick.shaftKey, level: pick.level, d };
      }
    }
    for (const [key, vis] of visuals) {
      vis.setLandingHailHighlight({
        hoverLevel: best != null && best.shaftKey === key ? best.level : 0,
        flashLevel: hailPickFlash.shaftKey === key ? hailPickFlash.level : 0,
        flashUntilMs: hailPickFlash.untilMs,
        nowMs,
      });
    }
  };

  const tryRaycastFloorPick = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
    if (tryRaycastLandingHail(camera, playerPos, nowMs)) return true;
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = FLOOR_PICK_MAX_RAY_M;
    const roots: THREE.Object3D[] = [];
    for (const v of visuals.values()) {
      if (!v.floorPickRoot.visible) continue;
      roots.push(v.floorPickRoot);
    }
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const mergedLayout = mesh.userData[MAMMOTH_MERGED_CAB_FLOOR_PICK_UD] as
        | MergedCabFloorPickLayout
        | undefined;
      let pick: { shaftKey: string; level: number } | undefined;
      if (mergedLayout?.shaftKey) {
        const panelRoot = mesh.parent;
        if (!panelRoot) continue;
        pick = {
          shaftKey: mergedLayout.shaftKey,
          level: resolveMergedCabFloorPickLevel(h.point, panelRoot, mergedLayout),
        };
      } else {
        const ud = (mesh.userData as Partial<FpElevFloorPickUserData>)[FP_ELEV_FLOOR_PICK_UD];
        if (!ud) continue;
        pick = { shaftKey: ud.shaftKey, level: ud.level };
      }
      const row = latest.get(pick.shaftKey);
      const layout = layoutByKey.get(pick.shaftKey);
      const vis = visuals.get(pick.shaftKey);
      if (!row || !layout || !vis) return false;
      const cabY = getCabY(pick.shaftKey);
      if (!Number.isFinite(cabY)) return false;
      const lx = playerPos.x - (ox + row.plateX);
      const lz = playerPos.z - (oz + row.plateZ);
      const py = playerPos.y;
      const inCab = fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabY, vis.inner);
      const inDoorway = fpElevCarPanelDoorwayViewLocal(layout.doorFace, lx, lz, py, cabY, vis.inner);
      if (
        !fpElevFloorPickRaycastShouldProceed(inCab, inDoorway, getDoor(pick.shaftKey, nowMs))
      ) {
        return false;
      }
      try {
        void opts.conn.reducers.elevatorSelectFloor({
          shaftKey: pick.shaftKey,
          level: pick.level >>> 0,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorSelectFloor ray", e);
        return false;
      }
      pickFlash.shaftKey = pick.shaftKey;
      pickFlash.level = pick.level;
      pickFlash.untilMs = nowMs + 520;
      return true;
    }
    return false;
  };

  const getFloorVisibilityBand = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    bandEyeWorldY?: number,
    bandViewDirY?: number,
    bandEyeWorldX?: number,
    bandEyeWorldZ?: number,
    bandViewDirX?: number,
    bandViewDirZ?: number,
  ) => {
    const sFeet = estimateStoreyFromFeetY(py, storeyOpts);
    const sEye =
      bandEyeWorldY === undefined
        ? sFeet
        : estimateStoreyFromFeetY(bandEyeWorldY, storeyOpts);
    const playerStorey = Math.max(sFeet, sEye);
    const gatingCamX = bandEyeWorldX ?? px;
    const gatingCamZ = bandEyeWorldZ ?? pz;
    const b = floorVisPitchLookaheadWorldBoundsXz;
    const suppressPitchLookahead =
      b != null &&
      !fpBuildingExteriorViewShouldRevealFullStack({
        cameraX: gatingCamX,
        cameraZ: gatingCamZ,
        boundsMinX: b.minX,
        boundsMaxX: b.maxX,
        boundsMinZ: b.minZ,
        boundsMaxZ: b.maxZ,
      });
    const upperLookAheadStorey =
      bandEyeWorldY === undefined || suppressPitchLookahead
        ? undefined
        : estimateStoreyFromFeetY(
            bandEyeWorldY + Math.max(0, bandViewDirY ?? 0) * floorSpacingM * 20,
            storeyOpts,
          );
    const lowerLookAheadStorey =
      bandEyeWorldY === undefined || suppressPitchLookahead
        ? undefined
        : estimateStoreyFromFeetY(
            bandEyeWorldY + Math.min(0, bandViewDirY ?? 0) * floorSpacingM * 20,
            storeyOpts,
          );
    let revealFullStack = false;
    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      if (!row) continue;
      const cabY = getCabY(key);
      if (!Number.isFinite(cabY)) continue;
      const doorOpen = getDoor(key, nowMs);
      const hoistwayProbe = (wx: number, wy: number, wz: number) =>
        fpElevFeetInHoistwayColumnForFloorStack(wx, wy, wz, {
          buildingWorldOriginX: ox,
          buildingWorldOriginY: oy,
          buildingWorldOriginZ: oz,
          floorSpacingM,
          maxLevel,
          layout: vis.layout,
        });
      const feetInColumn = hoistwayProbe(px, py, pz);
      const eyeInColumn =
        bandEyeWorldY !== undefined &&
        bandEyeWorldX !== undefined &&
        bandEyeWorldZ !== undefined &&
        hoistwayProbe(bandEyeWorldX, bandEyeWorldY, bandEyeWorldZ);
      const feetInCab = isInsideCarHud(px, py, pz, key);
      const eyeInCab =
        bandEyeWorldY !== undefined &&
        bandEyeWorldX !== undefined &&
        bandEyeWorldZ !== undefined &&
        isInsideCarHud(bandEyeWorldX, bandEyeWorldY, bandEyeWorldZ, key);
      if (
        doorOpen > DOOR_OPEN_REVEAL_THRESHOLD &&
        (feetInColumn || eyeInColumn) &&
        !feetInCab &&
        !eyeInCab
      ) {
        revealFullStack = true;
        break;
      }
    }
    return fpBuildingFloorPlateVisibilityBand({
      maxLevel,
      playerStorey,
      revealFullStack,
      upperTargetStorey: upperLookAheadStorey,
      lowerTargetStorey: lowerLookAheadStorey,
    });
  };

  /**
   * True when the player is inside the HUD volume of any cab and the current view is fully occluded
   * by cab walls. This covers both a literally sealed cab and the common "door is open but the
   * camera is turned toward a side/back wall" case that was still submitting the whole building.
   */
  const isInsideCabOccludedView = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): boolean => {
    for (const key of visuals.keys()) {
      const insideFeet = isInsideCarHud(px, py, pz, key);
      const insideEye =
        eyeWorldX !== undefined &&
        eyeWorldY !== undefined &&
        eyeWorldZ !== undefined &&
        isInsideCarHud(eyeWorldX, eyeWorldY, eyeWorldZ, key);
      if (!insideFeet && !insideEye) continue;
      if (
        !hasCabDoorwaySightline(
          key,
          px,
          py,
          pz,
          nowMs,
          eyeWorldX,
          eyeWorldY,
          eyeWorldZ,
          viewDirX,
          viewDirZ,
        )
      ) {
        return true;
      }
    }
    return false;
  };

  const isInsideAnyCabHud = (
    px: number,
    py: number,
    pz: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
  ): boolean => {
    for (const key of visuals.keys()) {
      if (isInsideCarHud(px, py, pz, key)) return true;
      if (
        eyeWorldX !== undefined &&
        eyeWorldY !== undefined &&
        eyeWorldZ !== undefined &&
        isInsideCarHud(eyeWorldX, eyeWorldY, eyeWorldZ, key)
      ) {
        return true;
      }
    }
    return false;
  };

  const getCabOccludedViewStorey = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): number | null => {
    for (const [key, vis] of visuals) {
      const insideFeet = isInsideCarHud(px, py, pz, key);
      const insideEye =
        eyeWorldX !== undefined &&
        eyeWorldY !== undefined &&
        eyeWorldZ !== undefined &&
        isInsideCarHud(eyeWorldX, eyeWorldY, eyeWorldZ, key);
      if (!insideFeet && !insideEye) continue;
      if (
        hasCabDoorwaySightline(
          key,
          px,
          py,
          pz,
          nowMs,
          eyeWorldX,
          eyeWorldY,
          eyeWorldZ,
          viewDirX,
          viewDirZ,
        )
      ) {
        continue;
      }
      const row = latest.get(key);
      if (row) {
        if (row.phase === ELEVATOR_PHASE_MOVING) {
          /**
           * While the cab fully occludes the world, the rider cannot see intermediate landings. Pin
           * the hidden world band to the trip target instead of the continuously changing predicted
           * cab Y; otherwise every storey crossing churns `visible` flags across the building root.
           */
          return Math.max(
            1,
            Math.min(maxLevel, Number(row.moveToLevel ?? row.currentLevel ?? 1)),
          );
        }
        return Math.max(1, Math.min(maxLevel, Number(row.currentLevel ?? 1)));
      }
      const cabFeetWorldY = getCabY(key, nowMs);
      if (Number.isFinite(cabFeetWorldY)) {
        return cabFloorButtonDisplayLevel(vis.layout, cabFeetWorldY);
      }
      return 1;
    }
    return null;
  };

  /**
   * Per-frame visibility hook for shaft visuals. While the current cab view is occluded by cab
   * walls, auxiliary landing UI / helper meshes on every shaft — hail panels and invisible pick
   * boxes — cannot contribute pixels, so skip them until the camera regains a real doorway
   * sightline. The visible corridor / landing door mesh is intentionally left on.
   */
  const syncShaftVisualCulling = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    eyeWorldX?: number,
    eyeWorldY?: number,
    eyeWorldZ?: number,
    viewDirX?: number,
    viewDirZ?: number,
  ): void => {
    const landingsVisible = !isInsideCabOccludedView(
      px,
      py,
      pz,
      nowMs,
      eyeWorldX,
      eyeWorldY,
      eyeWorldZ,
      viewDirX,
      viewDirZ,
    );
    for (const vis of visuals.values()) {
      vis.setLandingsVisible(landingsVisible);
    }
  };

  const sampleRideDebug = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    bandEyeWorldY?: number,
    bandViewDirY?: number,
  ): FpElevatorRideDebugSnapshot | null => {
    const eyeY = bandEyeWorldY ?? py;
    const vdy = bandViewDirY ?? 0;
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) continue;
      if (!isInsideCarHud(px, py, pz, key)) continue;
      const cabFeet = getCabY(key, nowMs);
      const cabVy = getCabVerticalVelocityMps(key, nowMs);
      const doorOpen = getDoor(key, nowMs);
      const elapsed =
        row.sampleServerMicros !== 0n
          ? elapsedSecSinceServerSample(row, nowMs)
          : 0;
      const band = getFloorVisibilityBand(px, py, pz, nowMs, eyeY, vdy);
      return {
        shaftKey: key,
        phase: row.phase,
        currentLevel: row.currentLevel,
        moveFromLevel: row.moveFromLevel,
        moveToLevel: row.moveToLevel,
        moveU: row.moveU,
        replicaCabFloorY: row.cabFloorY,
        cabFeetY: cabFeet,
        cabVyMps: cabVy,
        doorOpen01: doorOpen,
        elapsedSecSinceServerSample: elapsed,
        serverClockOffsetMs: serverClock.estimatedOffsetMs(),
        serverClockRideOffsetMs: getRideClockOffsetMs(row),
        clockHasEstimate: serverClock.hasEstimate(),
        floorVisBand: { lo: band.lo, hi: band.hi },
      };
    }
    return null;
  };

  const getHudMovingCabVyMps = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
  ): number => {
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) continue;
      if (!isInsideCarHud(px, py, pz, key)) continue;
      return getCabVerticalVelocityMps(key, nowMs);
    }
    return 0;
  };

  const ignoreSmallPoseReconcileWhileMovingElevatorRider = (
    px: number,
    py: number,
    pz: number,
    nowMs: number,
  ): boolean => {
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      if (row.phase !== ELEVATOR_PHASE_MOVING) continue;
      const cabFeet = getCabY(key, nowMs);
      if (!Number.isFinite(cabFeet)) continue;
      const lx = px - (ox + row.plateX);
      const lz = pz - (oz + row.plateZ);
      const doorOpen = getDoor(key, nowMs);
      const insideRiderSnap = fpElevatorRiderSnapContainsLocalPoint(
        lx,
        lz,
        py,
        cabFeet,
        vis.inner,
        vis.layout.doorFace,
        doorOpen,
      );
      const insideClosedMovingCabHud =
        doorOpen <= DOOR_OPEN_REVEAL_THRESHOLD &&
        fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabFeet, vis.inner);
      if (insideRiderSnap || insideClosedMovingCabHud) {
        return true;
      }
    }
    return false;
  };

  const tick = (_dtSec: number, nowMs: number, playerPos: THREE.Vector3) => {
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;
    flushPendingExteriorDoorToggle(nowMs, px, py, pz);
    advanceCabDoorOpenVisual(_dtSec);
    advanceLandingSwingClientVisual(_dtSec);

    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      const rawCabY = row != null ? getCabY(key, nowMs) : Number.NaN;
      const d = getDoor(key, nowMs);
      if (Number.isFinite(rawCabY)) {
        vis.updateFromServer(rawCabY, d);
      }
      _swingByLevel.clear();
      for (const row of landingByRowKey.values()) {
        if (row.shaftKey === key) {
          const u = THREE.MathUtils.clamp(
            landingSwingVisual.get(row.rowKey) ?? row.swingOpen01,
            0,
            1,
          );
          _swingByLevel.set(row.level, u);
        }
      }
      vis.updateLandingExteriorDoorSwings(_swingByLevel);
      const flashActive = pickFlash.untilMs > nowMs && pickFlash.shaftKey === key;
      const floorPickLevel = Number.isFinite(rawCabY)
        ? cabFloorButtonDisplayLevel(vis.layout, rawCabY)
        : Number(row?.currentLevel ?? 1);
      vis.updateFloorPickMaterials(
        floorPickLevel,
        flashActive ? pickFlash.level : 0,
        pickFlash.untilMs,
        nowMs,
      );
      vis.updateLandingHailCabFloorDisplay(floorPickLevel);
      if (!row || !Number.isFinite(rawCabY)) {
        vis.setFloorPickRootVisible(false);
        continue;
      }
      const insideThis = isInsideCarHud(px, py, pz, key);
      const lx = px - (ox + row.plateX);
      const lz = pz - (oz + row.plateZ);
      const doorwayView = fpElevCarPanelDoorwayViewLocal(
        vis.layout.doorFace,
        lx,
        lz,
        py,
        rawCabY,
        vis.inner,
      );
      vis.setFloorPickRootVisible(fpElevFloorPickMeshesShouldShow(insideThis, doorwayView, d));
    }

  };

  const consumeInteractKey = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): boolean => {
    const nowMs = performance.now();
    const exterior = resolveExteriorDoorInteract(
      camera,
      playerPos.x,
      playerPos.y,
      playerPos.z,
    );
    if (exterior) {
      const interactHintY = exteriorDoorInteractHintY(playerPos, camera);
      queueExteriorDoorToggleAttempt(exterior.shaftKey, exterior.level, nowMs, interactHintY);
      try {
        void opts.conn.reducers.elevatorLandingExteriorDoorSet({
          shaftKey: exterior.shaftKey,
          level: exterior.level >>> 0,
          desiredOpen: pendingExteriorDoorToggle.expectedDesiredOpen,
          clientFeetX: playerPos.x,
          clientFeetY: interactHintY,
          clientFeetZ: playerPos.z,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorLandingExteriorDoorSet", e);
      }
      return true;
    }
    return false;
  };

  const shouldSuppressEpickup = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): boolean => resolveExteriorDoorInteract(camera, playerPos.x, playerPos.y, playerPos.z) !== null;

  const getExteriorDoorInteractPrompt = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => {
    const ext = resolveExteriorDoorInteract(
      camera,
      playerPos.x,
      playerPos.y,
      playerPos.z,
    );
    if (!ext) return null;
    const rk = landingExteriorDoorRowKey(ext.shaftKey, ext.level);
    const ld = landingByRowKey.get(rk);
    const willClose = (ld?.desiredOpen ?? 0) !== 0;
    const shortLabel = floorButtonLabel(ext.level, floorLabelByLevel);
    const floorLabel = shortLabel === "PR" ? "PR / Ground" : `Floor ${shortLabel}`;
    return { willClose, floorLabel };
  };

  const visitCollisionAabbsInXZ = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ) =>
    visitFpElevatorWorldCollisionAabbsInXZ(
      {
        buildingOriginX: ox,
        buildingOriginZ: oz,
        maxLevel,
        latestCars: latest,
        layoutByKey,
        landingByRowKey,
        feetYForLayout,
        getCabFloorY: (shaftKey) => getCabY(shaftKey, cabEvalNowMs),
        getCabDoorOpen01: (shaftKey) => getDoor(shaftKey, cabEvalNowMs),
        getLandingExteriorSwingOpen01: (shaftKey, level) =>
          landingSwingVisual.get(landingExteriorDoorRowKey(shaftKey, level)),
      },
      x0,
      x1,
      z0,
      z1,
      visit,
      queryPose,
    );

  const syncCabEvalClock = (nowMs: number, frameDtSec?: number) => {
    cabEvalNowMs = nowMs;
    if (frameDtSec !== undefined) {
      cabEvalUseSmoothedMoveU = true;
      if (frameDtSec > 0) {
        advanceCabSmoothU(frameDtSec, nowMs);
      }
    } else {
      cabEvalUseSmoothedMoveU = false;
    }
  };

  const resolveAttachment = (
    worldPos: { x: number; y: number; z: number },
    evalWallClockMs: number,
  ): FpKinematicAttachment | null => {
    const px = worldPos.x;
    const py = worldPos.y;
    const pz = worldPos.z;
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      const cabFeet = getCabY(key, evalWallClockMs);
      const lx = px - (ox + row.plateX);
      const lz = pz - (oz + row.plateZ);
      const doorOpen = getDoor(key, evalWallClockMs);
      const insideRiderSnap = fpElevatorRiderSnapContainsLocalPoint(
        lx,
        lz,
        py,
        cabFeet,
        vis.inner,
        vis.layout.doorFace,
        doorOpen,
      );
      /**
       * Moving-cab rides should feel welded to the slab even if the narrower rider-snap physics
       * volume jitters at a boundary for one frame. While the doors are effectively shut, fall back
       * to the broader HUD cab volume so vertical foot snap + XZ clamp stay continuous.
       */
      const insideClosedMovingCabHud =
        row.phase === ELEVATOR_PHASE_MOVING &&
        doorOpen <= DOOR_OPEN_REVEAL_THRESHOLD &&
        fpElevatorHudCarContainsLocalPoint(lx, lz, py, cabFeet, vis.inner);
      if (!insideRiderSnap && !insideClosedMovingCabHud) {
        continue;
      }
      const plateX = ox + row.plateX;
      const plateZ = oz + row.plateZ;
      return {
        supportFeetY: cabFeet,
        clampWorldXZ: (wx: number, wz: number) =>
          fpElevatorClampWorldXZToCabIfRider(
            wx,
            wz,
            py,
            cabFeet,
            plateX,
            plateZ,
            vis.layout.doorFace,
            doorOpen,
            vis.inner,
          ),
      };
    }
    return null;
  };

  const kinematicSupport: FpKinematicSupportProvider = {
    sampleSupportSurface,
    resolveAttachment,
  };

  const applyCabRoofFeetSnap = (
    pos: { x: number; y: number; z: number },
    prevPos: { y: number },
    bodyHeightM: number,
    footRadiusM: number,
  ): boolean => {
    const head = pos.y + bodyHeightM;
    const prevHead = prevPos.y + bodyHeightM;
    const r = footRadiusM;
    const tEval = cabEvalNowMs;
    for (const [key, row] of latest) {
      const layout = layoutByKey.get(key);
      const vis = visuals.get(key);
      if (!layout || !vis) continue;
      const { halfX: hx, halfZ: hz } = vis.inner;
      const innerH = vis.inner.innerH;
      const plateX = ox + row.plateX;
      const plateZ = oz + row.plateZ;
      const cabFeet = getCabY(key, tEval);
      if (!Number.isFinite(cabFeet)) continue;
      const roofTop = cabFeet + innerH;
      const minX = plateX - hx * 0.92;
      const maxX = plateX + hx * 0.92;
      const minZ = plateZ - hz * 0.92;
      const maxZ = plateZ + hz * 0.92;
      if (pos.x + r <= minX || pos.x - r >= maxX || pos.z + r <= minZ || pos.z - r >= maxZ) {
        continue;
      }
      if (prevHead <= roofTop + 0.04) continue;
      if (head < roofTop - 0.05) continue;
      if (pos.y > roofTop + 0.35) continue;
      pos.y = roofTop + FP_LOCOMOTION_SKIN;
      return true;
    }
    return false;
  };

  return {
    dispose: () => {
      opts.conn.db.elevator_car.removeOnInsert(onElevRow);
      opts.conn.db.elevator_car.removeOnUpdate(onElevRow);
      opts.conn.db.elevator_landing_door.removeOnInsert(onLandingInsert);
      opts.conn.db.elevator_landing_door.removeOnUpdate(onLandingUpdate);
      opts.conn.db.elevator_landing_door.removeOnDelete(onLandingDelete);
      for (const vis of visuals.values()) {
        opts.buildingRoot.remove(vis.root);
        vis.dispose();
      }
      latest.clear();
      cabIntegrateUByKey.clear();
      cabSmoothedUByKey.clear();
      cabMoveLegByKey.clear();
      cabFilteredElapsedSecByKey.clear();
      cabSoftCeilingUByKey.clear();
      landingByRowKey.clear();
      replicaHistoryByKey.clear();
      cabDoorOpenSmoothed.clear();
      landingSwingVisual.clear();
    },
    syncCabEvalClock,
    tick,
    syncLandingHailUi,
    kinematicSupport,
    tryRaycastFloorPick,
    consumeInteractKey,
    shouldSuppressEpickup,
    getExteriorDoorInteractPrompt,
    visitCollisionAabbsInXZ,
    applyCabRoofFeetSnap,
    getFloorVisibilityBand,
    syncShaftVisualCulling,
    isInsideCabOccludedView,
    isInsideAnyCabHud,
    getCabOccludedViewStorey,
    sampleRideDebug,
    getHudMovingCabVyMps,
    ignoreSmallPoseReconcileWhileMovingElevatorRider,
  };
}

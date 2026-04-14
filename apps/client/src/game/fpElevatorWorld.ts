import * as THREE from "three";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import { fpLocomotionConstants, type FpLocomotionState } from "@the-mammoth/engine";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  estimateStoreyFromFeetY,
  FP_LOCOMOTION_SKIN,
  listElevatorShaftLayouts,
  maxBuildingLevelIndex,
  resolveLandingHailLevel,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { DbConnection } from "../module_bindings";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types";
import {
  CALL_RADIUS_XZ,
  CALL_Y_HALF_WINDOW,
  ELEVATOR_PHASE_MOVING,
  ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS,
  FP_ELEV_EXTERIOR_DOOR_PICK_UD,
  ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M,
  ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M,
  FLOOR_PICK_MAX_RAY_M,
  FP_ELEV_FLOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
  type FpElevExteriorDoorPickUserData,
  type FpElevFloorPickUserData,
  type FpElevLandingHailPickUserData,
} from "./fpElevatorConstants.js";
import { fpBuildingFloorPlateVisibilityBand } from "./fpBuildingFloorPlateVisibilityBand.js";
import {
  predictMovingCabFeetWorldY,
  predictMovingCabFeetWorldYVelocityMps,
} from "./fpElevatorCabPredict.js";
import { FpElevatorCabInterpScalar, FpElevatorShaftVisual } from "./fpElevatorShaftVisual.js";
import {
  fpElevCarPanelDoorwayViewLocal,
  fpElevFeetInHoistwayColumnForFloorStack,
  fpElevFloorPickMeshesShouldShow,
  fpElevFloorPickRaycastShouldProceed,
  fpElevatorClampWorldXZToCabIfRider,
  fpElevatorHudCarContainsLocalPoint,
  fpElevatorRiderSnapContainsLocalPoint,
} from "./fpElevatorVolumes.js";
import { setFpElevatorHudView } from "./fpElevatorHud.js";
import { fpElevSuppressLandingHailBecauseCabAtLandingSupport } from "./fpElevatorLandingHailSuppress.js";
import {
  fpElevApplyClosedCabDoorOutsideClamp,
  fpElevApplyClosedExteriorDoorCollisionClamp,
  fpElevLandingExteriorDoorInteractPlateLocal,
  landingExteriorDoorRowKey,
} from "./fpElevatorLandingExteriorDoor.js";

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
};

/** Arguments for {@link MountFpElevatorWorldResult.getElevatorKinematicSupportVyMps}. */
export type FpElevatorKinematicSupportVyOpts = {
  worldX: number;
  worldZ: number;
  probeTopY: number;
  footRadiusXZ: number;
  stepUpMargin: number;
  baseTop: number;
  /** Same monotonic clock as {@link mountFpElevatorWorld} `syncCabEvalClock` / locomotion end. */
  evalWallClockMs: number;
};

export type MountFpElevatorWorldResult = {
  dispose(): void;
  /** Advance replicated cab evaluation time before `stepFpLocomotion` so `mergeWalkTop` matches this frame. */
  syncCabEvalClock(nowMs: number): void;
  tick(dt: number, nowMs: number, playerPos: THREE.Vector3): void;
  mergeWalkTop(
    worldX: number,
    worldZ: number,
    probeTopY: number,
    footRadiusXZ: number,
    stepUpMargin: number,
    baseTop: number,
    evalWallClockMs?: number,
  ): number;
  /**
   * Vertical velocity (m/s) of the elevator walk surface that wins {@link mergeWalkTop} for this
   * probe (0 if static geometry wins or no overlapping cab).
   */
  getElevatorKinematicSupportVyMps(opts: FpElevatorKinematicSupportVyOpts): number;
  /**
   * After locomotion: if feet are in the in-car HUD volume, snap `pos.y` to the predicted
   * authoritative cab feet Y and zero vertical velocity — prevents fall-through and micro-seams.
   */
  snapLocalRiderFeetToAuthoritativeCabIfNeeded(
    pos: THREE.Vector3,
    loco: FpLocomotionState,
    evalWallClockMs: number,
    jumpPressedThisFrame: boolean,
  ): void;
  /**
   * When feet are in the rider envelope, clamp world X/Z to cab inner walls (matches server
   * `clamp_player_to_elevators`) so merge/snap widened volumes cannot be walked off the sides.
   */
  clampLocalRiderXZToAuthoritativeCabIfNeeded(
    pos: THREE.Vector3,
    loco: FpLocomotionState,
    evalWallClockMs: number,
  ): void;
  tryRaycastFloorPick(
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean;
  consumeInteractKey(playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean;
  shouldSuppressEpickup(playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean;
  /** Client-side closed-door block so FP prediction matches server before rubber-band. */
  clampLocalClosedExteriorLandingDoors(pos: THREE.Vector3, vel: THREE.Vector3): void;
  /** When in the narrow sill strip, drive the shared bottom interact prompt (see `fpPickupPrompt`). */
  getExteriorDoorInteractPrompt(
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): {
    willClose: boolean;
    floorLabel: string;
  } | null;
  getFloorVisibilityBand(
    px: number,
    py: number,
    pz: number,
    nowMs: number,
    /** Camera / eye world Y — widens visible storeys above the feet when looking up. */
    bandEyeWorldY?: number,
  ): {
    lo: number;
    hi: number;
  };
};

export function mountFpElevatorWorld(opts: MountFpElevatorWorldOpts): MountFpElevatorWorldResult {
  const floorSpacingM = opts.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const ox = opts.building.worldOrigin?.[0] ?? 0;
  const oy = opts.building.worldOrigin?.[1] ?? 0;
  const oz = opts.building.worldOrigin?.[2] ?? 0;
  const maxLevel = maxBuildingLevelIndex(opts.building);
  const layouts = listElevatorShaftLayouts(opts.building, opts.getFloorDoc);
  const layoutByKey = new Map(layouts.map((l) => [l.planKey, l] as const));

  const storeyOpts = {
    buildingWorldOriginY: oy,
    floorSpacingM,
    maxLevel,
  };

  const visuals = new Map<string, FpElevatorShaftVisual>();
  for (const layout of layouts) {
    const v = new FpElevatorShaftVisual(layout, [ox, oy, oz], {
      shaftKey: layout.planKey,
      maxLevel,
      floorSpacingM,
      buildingWorldOriginY: oy,
    });
    visuals.set(layout.planKey, v);
    opts.buildingRoot.add(v.root);
  }

  const raycaster = new THREE.Raycaster();
  const screenCenterNdc = new THREE.Vector2(0, 0);

  /** Brief glow on the button that accepted a floor request (client-only). */
  const pickFlash = { shaftKey: "", level: 0, untilMs: 0 };

  const latest = new Map<string, ElevatorCar>();
  const landingByRowKey = new Map<string, ElevatorLandingDoor>();
  /** Monotonic clock sample when `elevator_car` row last arrived (moving phase only). */
  const moveReplicaAtMs = new Map<string, number>();
  const doorInterp = new Map<string, FpElevatorCabInterpScalar>();
  /** Evaluation time for cab Y this frame (set at start of `tick` so walk merge matches visuals). */
  let cabEvalNowMs = performance.now();

  const ensureInterp = (key: string) => {
    if (!doorInterp.has(key)) doorInterp.set(key, new FpElevatorCabInterpScalar());
  };

  const feetYForLayout = (layout: ElevatorShaftLayout, level: number): number =>
    elevatorSupportFeetWorldY({
      buildingWorldOriginY: oy,
      levelIndex: Math.max(1, Math.min(maxLevel, level)),
      floorSpacingM,
      shaftPlateLocalY: layout.plateLocalY,
      shaftSy: layout.sy,
    });

  const ingest = (row: ElevatorCar) => {
    const prev = latest.get(row.shaftKey);
    latest.set(row.shaftKey, row);
    ensureInterp(row.shaftKey);
    const now = performance.now();
    doorInterp.get(row.shaftKey)!.setTarget(row.doorOpen01, now);
    if (row.phase === ELEVATOR_PHASE_MOVING) {
      const movingReplicaChanged =
        !prev ||
        prev.phase !== row.phase ||
        prev.moveU !== row.moveU ||
        prev.moveFromLevel !== row.moveFromLevel ||
        prev.moveToLevel !== row.moveToLevel;
      if (movingReplicaChanged) {
        moveReplicaAtMs.set(row.shaftKey, now);
      }
    } else {
      moveReplicaAtMs.delete(row.shaftKey);
    }
  };

  for (const row of opts.conn.db.elevator_car) {
    ingest(row as ElevatorCar);
  }

  const ingestLanding = (row: ElevatorLandingDoor) => {
    landingByRowKey.set(row.rowKey, row);
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
  };
  opts.conn.db.elevator_landing_door.onInsert(onLandingInsert);
  opts.conn.db.elevator_landing_door.onUpdate(onLandingUpdate);
  opts.conn.db.elevator_landing_door.onDelete(onLandingDelete);

  const getCabY = (key: string, evalWallClockMs?: number): number => {
    const row = latest.get(key);
    if (!row) return Number.NaN;
    if (row.phase !== ELEVATOR_PHASE_MOVING) {
      return row.cabFloorY;
    }
    const layout = layoutByKey.get(key);
    if (!layout) return row.cabFloorY;
    const tEval = evalWallClockMs ?? cabEvalNowMs;
    const t0 = moveReplicaAtMs.get(key) ?? tEval;
    const elapsedSec = Math.max(0, (tEval - t0) * 0.001);
    return predictMovingCabFeetWorldY({
      moveFromLevel: row.moveFromLevel,
      moveToLevel: row.moveToLevel,
      moveUAtReplica: row.moveU,
      elapsedSecSinceReplica: elapsedSec,
      feetYForLevel: (lv) => feetYForLayout(layout, lv),
    });
  };

  const getCabVerticalVelocityMps = (key: string, evalWallClockMs: number): number => {
    const row = latest.get(key);
    if (!row || row.phase !== ELEVATOR_PHASE_MOVING) return 0;
    const layout = layoutByKey.get(key);
    if (!layout) return 0;
    const t0 = moveReplicaAtMs.get(key) ?? evalWallClockMs;
    const elapsedSec = Math.max(0, (evalWallClockMs - t0) * 0.001);
    return predictMovingCabFeetWorldYVelocityMps({
      moveFromLevel: row.moveFromLevel,
      moveToLevel: row.moveToLevel,
      moveUAtReplica: row.moveU,
      elapsedSecSinceReplica: elapsedSec,
      feetYForLevel: (lv) => feetYForLayout(layout, lv),
    });
  };

  const getDoor = (key: string, nowMs: number): number =>
    doorInterp.get(key)?.eval(nowMs) ?? latest.get(key)?.doorOpen01 ?? 1;

  const mergeWalkTop = (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    footRadiusXZ: number,
    stepUpMargin: number,
    baseTop: number,
    evalWallClockMs?: number,
  ): number => {
    let best = baseTop;
    const fx0 = worldX - footRadiusXZ;
    const fx1 = worldX + footRadiusXZ;
    const fz0 = worldZ - footRadiusXZ;
    const fz1 = worldZ + footRadiusXZ;
    for (const [key, row] of latest) {
      const layout = layoutByKey.get(key);
      if (!layout) continue;
      const vis = visuals.get(key);
      if (!vis) continue;
      const { halfX: ihx, halfZ: ihz } = vis.inner;
      const wx = ox + row.plateX;
      const wz = oz + row.plateZ;
      if (fx1 < wx - ihx || fx0 > wx + ihx || fz1 < wz - ihz || fz0 > wz + ihz) {
        continue;
      }
      const cabFeet = getCabY(key, evalWallClockMs);
      if (!Number.isFinite(cabFeet)) continue;
      const feetY = probeTopY - fpLocomotionConstants.walkProbeDy;
      const yLo = cabFeet - ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M;
      const yHi = cabFeet + vis.inner.innerH + ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M;
      if (feetY < yLo || feetY > yHi) {
        continue;
      }
      const geomTop = cabFeet - FP_LOCOMOTION_SKIN;
      /** Match `elevator::merge_elevator_walk_top_lerped` inclusion (no dead band above the probe). */
      if (geomTop <= probeTopY + stepUpMargin) {
        if (!Number.isFinite(best)) best = geomTop;
        else best = Math.max(best, geomTop);
      }
    }
    return best;
  };

  const getElevatorKinematicSupportVyMps = (opts: FpElevatorKinematicSupportVyOpts): number => {
    const merged = mergeWalkTop(
      opts.worldX,
      opts.worldZ,
      opts.probeTopY,
      opts.footRadiusXZ,
      opts.stepUpMargin,
      opts.baseTop,
      opts.evalWallClockMs,
    );
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
      if (fx1 < wx - ihx || fx0 > wx + ihx || fz1 < wz - ihz || fz0 > wz + ihz) {
        continue;
      }
      const cabFeet = getCabY(key, opts.evalWallClockMs);
      if (!Number.isFinite(cabFeet)) continue;
      const yLo = cabFeet - ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M;
      const yHi = cabFeet + vis.inner.innerH + ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M;
      if (feetY < yLo || feetY > yHi) {
        continue;
      }
      const geomTop = cabFeet - FP_LOCOMOTION_SKIN;
      if (geomTop > opts.probeTopY + opts.stepUpMargin) continue;
      if (geomTop > bestCabGeom + 1e-5) {
        bestCabGeom = geomTop;
        bestVy = getCabVerticalVelocityMps(key, opts.evalWallClockMs);
      }
    }
    if (!Number.isFinite(merged) || bestCabGeom === -Infinity) return 0;
    // Only inherit cab motion when the merged walk top is the cab (not a higher static plate).
    if (Math.abs(merged - bestCabGeom) > 0.05) return 0;
    return bestVy;
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

  /**
   * Landing hail from this pose: same rules as the HUD “Press E” prompt and server `near_call_pose`,
   * plus suppression when the cab is already docked at that landing’s support height (see
   * `fpElevSuppressLandingHailBecauseCabAtLandingSupport`).
   * Returns `null` when inside any cab (landing call does not apply) or when outside call volumes.
   */
  const resolveLandingCallAtPose = (
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null => {
    for (const key of visuals.keys()) {
      if (isInsideCarHud(px, py, pz, key)) return null;
    }
    for (const key of visuals.keys()) {
      const layout = layoutByKey.get(key);
      const row = latest.get(key);
      if (!layout || !row) continue;
      const landingLevel = resolveLandingHailLevel(px, py, pz, {
        buildingWorldOriginY: oy,
        floorSpacingM,
        maxLevel,
        plateWorldX: ox + row.plateX,
        plateWorldZ: oz + row.plateZ,
        shaft: layout,
        callRadiusXZ: CALL_RADIUS_XZ,
        callYHalfWindow: CALL_Y_HALF_WINDOW,
      });
      if (landingLevel === null) continue;
      const landingSupportY = feetYForLayout(layout, landingLevel);
      const cabY = getCabY(key);
      if (!Number.isFinite(cabY)) continue;
      if (fpElevSuppressLandingHailBecauseCabAtLandingSupport(cabY, landingSupportY)) {
        continue;
      }
      return { shaftKey: key, level: landingLevel };
    }
    return null;
  };

  const resolveExteriorDoorInteractAtPose = (
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null => {
    for (const layout of layouts) {
      const rowCar = latest.get(layout.planKey);
      if (!rowCar) continue;
      const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
      const plateX = ox + rowCar.plateX;
      const plateZ = oz + rowCar.plateZ;
      const lx = px - plateX;
      const lz = pz - plateZ;
      for (let level = 1; level <= maxLevel; level++) {
        const fy = feetYForLayout(layout, level);
        if (
          fpElevLandingExteriorDoorInteractPlateLocal(
            layout.doorFace,
            hx,
            hz,
            lx,
            lz,
            py,
            fy,
          )
        ) {
          return { shaftKey: layout.planKey, level };
        }
      }
    }
    return null;
  };

  const resolveExteriorDoorInteractByRay = (
    camera: THREE.PerspectiveCamera,
  ): { shaftKey: string; level: number } | null => {
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = 4.8;
    const roots: THREE.Object3D[] = [];
    for (const v of visuals.values()) {
      roots.push(v.landingDoorPickRoot);
    }
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const pick =
        (mesh.userData as Partial<FpElevExteriorDoorPickUserData>)[FP_ELEV_EXTERIOR_DOOR_PICK_UD];
      if (!pick) continue;
      return { shaftKey: pick.shaftKey, level: pick.level };
    }
    return null;
  };

  const resolveExteriorDoorInteract = (
    camera: THREE.PerspectiveCamera,
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null =>
    resolveExteriorDoorInteractByRay(camera) ?? resolveExteriorDoorInteractAtPose(px, py, pz);

  const tryRaycastLandingHail = (
    camera: THREE.PerspectiveCamera,
    _playerPos: THREE.Vector3,
  ): boolean => {
    raycaster.setFromCamera(screenCenterNdc, camera);
    raycaster.far = 4.8;
    const roots: THREE.Object3D[] = [];
    for (const v of visuals.values()) {
      roots.push(v.landingHailPickRoot);
    }
    const hits = raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      const pick =
        (mesh.userData as Partial<FpElevLandingHailPickUserData>)[FP_ELEV_LANDING_HAIL_PICK_UD];
      if (!pick) continue;
      const layout = layoutByKey.get(pick.shaftKey);
      const row = latest.get(pick.shaftKey);
      if (!layout || !row) return false;
      const landingSupportY = feetYForLayout(layout, pick.level);
      const cabY = getCabY(pick.shaftKey);
      if (!Number.isFinite(cabY)) return false;
      if (fpElevSuppressLandingHailBecauseCabAtLandingSupport(cabY, landingSupportY)) {
        return false;
      }
      try {
        void opts.conn.reducers.elevatorHail({
          shaftKey: pick.shaftKey,
          level: pick.level >>> 0,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorHail ray", e);
        return false;
      }
      return true;
    }
    return false;
  };

  const tryRaycastFloorPick = (
    camera: THREE.PerspectiveCamera,
    playerPos: THREE.Vector3,
    nowMs: number,
  ): boolean => {
    if (tryRaycastLandingHail(camera, playerPos)) return true;
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
      const pick = (mesh.userData as Partial<FpElevFloorPickUserData>)[FP_ELEV_FLOOR_PICK_UD];
      if (!pick) continue;
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
  ) => {
    const sFeet = estimateStoreyFromFeetY(py, storeyOpts);
    const sEye =
      bandEyeWorldY === undefined
        ? sFeet
        : estimateStoreyFromFeetY(bandEyeWorldY, storeyOpts);
    const playerStorey = Math.max(sFeet, sEye);
    let revealFullStack = false;
    for (const vis of visuals.values()) {
      if (
        fpElevFeetInHoistwayColumnForFloorStack(px, py, pz, {
          buildingWorldOriginX: ox,
          buildingWorldOriginY: oy,
          buildingWorldOriginZ: oz,
          floorSpacingM,
          maxLevel,
          layout: vis.layout,
        })
      ) {
        revealFullStack = true;
        break;
      }
    }
    for (const key of visuals.keys()) {
      if (revealFullStack) break;
      if (isInsideCarHud(px, py, pz, key)) {
        revealFullStack = true;
        break;
      }
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      const cabY = getCabY(key);
      if (!Number.isFinite(cabY)) continue;
      const lx = px - (ox + row.plateX);
      const lz = pz - (oz + row.plateZ);
      if (
        getDoor(key, nowMs) > 0.16 &&
        fpElevCarPanelDoorwayViewLocal(vis.layout.doorFace, lx, lz, py, cabY, vis.inner)
      ) {
        revealFullStack = true;
        break;
      }
    }
    return fpBuildingFloorPlateVisibilityBand({
      maxLevel,
      playerStorey,
      revealFullStack,
    });
  };

  const tick = (_dtSec: number, nowMs: number, playerPos: THREE.Vector3) => {
    cabEvalNowMs = nowMs;
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;

    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      const cabY = row != null ? getCabY(key, nowMs) : Number.NaN;
      const d = getDoor(key, nowMs);
      if (Number.isFinite(cabY)) {
        vis.updateFromServer(cabY, d);
      }
      const swingByLevel = new Map<number, number>();
      for (const row of landingByRowKey.values()) {
        if (row.shaftKey === key) swingByLevel.set(row.level, row.swingOpen01);
      }
      vis.updateLandingExteriorDoorSwings(swingByLevel);
      const flashActive = pickFlash.untilMs > nowMs && pickFlash.shaftKey === key;
      vis.updateFloorPickMaterials(
        Number(row?.currentLevel ?? 1),
        flashActive ? pickFlash.level : 0,
        pickFlash.untilMs,
        nowMs,
      );
      if (!row || !Number.isFinite(cabY)) {
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
        cabY,
        vis.inner,
      );
      vis.setFloorPickRootVisible(fpElevFloorPickMeshesShouldShow(insideThis, doorwayView, d));
    }

    const exterior = resolveExteriorDoorInteractAtPose(px, py, pz);
    if (exterior) {
      setFpElevatorHudView({ kind: "hidden" });
    } else {
      const hail = resolveLandingCallAtPose(px, py, pz);
      if (hail) {
      const label = hail.level <= 1 ? "Ground" : `Story ${hail.level}`;
      setFpElevatorHudView({
        kind: "call",
        shaftPlanKey: hail.shaftKey,
        callLevel: hail.level,
        floorLabel: label,
      });
      } else {
        setFpElevatorHudView({ kind: "hidden" });
      }
    }
  };

  const consumeInteractKey = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): boolean => {
    const exterior = resolveExteriorDoorInteract(
      camera,
      playerPos.x,
      playerPos.y,
      playerPos.z,
    );
    if (exterior) {
      try {
        void opts.conn.reducers.elevatorLandingExteriorDoorToggle({
          shaftKey: exterior.shaftKey,
          level: exterior.level >>> 0,
        });
      } catch (e) {
        console.warn("[fpElevatorWorld] elevatorLandingExteriorDoorToggle", e);
      }
      return true;
    }
    const hail = resolveLandingCallAtPose(playerPos.x, playerPos.y, playerPos.z);
    if (!hail) return false;
    try {
      void opts.conn.reducers.elevatorHail({
        shaftKey: hail.shaftKey,
        level: hail.level >>> 0,
      });
    } catch (e) {
      console.warn("[fpElevatorWorld] elevatorHail", e);
    }
    return true;
  };

  const shouldSuppressEpickup = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): boolean =>
    resolveExteriorDoorInteract(camera, playerPos.x, playerPos.y, playerPos.z) !== null ||
    resolveLandingCallAtPose(playerPos.x, playerPos.y, playerPos.z) !== null;

  const clampLocalClosedExteriorLandingDoors = (pos: THREE.Vector3, vel: THREE.Vector3) => {
    const carByShaft = new Map<string, { plateX: number; plateZ: number }>();
    for (const [k, row] of latest) {
      carByShaft.set(k, { plateX: row.plateX, plateZ: row.plateZ });
    }
    const landingRows = layouts.flatMap((layout) =>
      Array.from({ length: maxLevel }, (_v, i) => {
        const level = i + 1;
        const row = landingByRowKey.get(landingExteriorDoorRowKey(layout.planKey, level));
        return {
          shaftKey: layout.planKey,
          level,
          swingOpen01: row?.swingOpen01 ?? 0,
        };
      }),
    );
    fpElevApplyClosedExteriorDoorCollisionClamp(pos, vel, {
      ox,
      oz,
      landingRows,
      layoutByKey,
      carByShaft,
      feetYForLayout,
    });
    fpElevApplyClosedCabDoorOutsideClamp(pos, vel, {
      ox,
      oz,
      cars: latest.values(),
      layoutByKey,
    });
  };

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
    const floorLabel = ext.level <= 1 ? "Ground" : `Story ${ext.level}`;
    return { willClose, floorLabel };
  };

  const syncCabEvalClock = (nowMs: number) => {
    cabEvalNowMs = nowMs;
  };

  const snapLocalRiderFeetToAuthoritativeCabIfNeeded = (
    pos: THREE.Vector3,
    loco: FpLocomotionState,
    evalWallClockMs: number,
    jumpPressedThisFrame: boolean,
  ) => {
    if (jumpPressedThisFrame || loco.velocity.y > ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS) return;
    const px = pos.x;
    const py = pos.y;
    const pz = pos.z;
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      const cabFeet = getCabY(key, evalWallClockMs);
      const lx = px - (ox + row.plateX);
      const lz = pz - (oz + row.plateZ);
      const doorOpen = getDoor(key, evalWallClockMs);
      if (
        !fpElevatorRiderSnapContainsLocalPoint(
          lx,
          lz,
          py,
          cabFeet,
          vis.inner,
          vis.layout.doorFace,
          doorOpen,
        )
      )
        continue;
      pos.y = cabFeet;
      loco.velocity.y = 0;
      loco.grounded = true;
      return;
    }
  };

  const clampLocalRiderXZToAuthoritativeCabIfNeeded = (
    pos: THREE.Vector3,
    loco: FpLocomotionState,
    evalWallClockMs: number,
  ) => {
    const px = pos.x;
    const py = pos.y;
    const pz = pos.z;
    for (const key of visuals.keys()) {
      const row = latest.get(key);
      const vis = visuals.get(key);
      if (!row || !vis) continue;
      const cabFeet = getCabY(key, evalWallClockMs);
      if (!Number.isFinite(cabFeet)) continue;
      const plateX = ox + row.plateX;
      const plateZ = oz + row.plateZ;
      const doorOpen = getDoor(key, evalWallClockMs);
      const { x, z, didClamp } = fpElevatorClampWorldXZToCabIfRider(
        px,
        pz,
        py,
        cabFeet,
        plateX,
        plateZ,
        vis.layout.doorFace,
        doorOpen,
        vis.inner,
      );
      if (!didClamp) continue;
      pos.x = x;
      pos.z = z;
      if (x > px && loco.velocity.x < 0) loco.velocity.x = 0;
      if (x < px && loco.velocity.x > 0) loco.velocity.x = 0;
      if (z > pz && loco.velocity.z < 0) loco.velocity.z = 0;
      if (z < pz && loco.velocity.z > 0) loco.velocity.z = 0;
      return;
    }
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
      landingByRowKey.clear();
      moveReplicaAtMs.clear();
      doorInterp.clear();
      setFpElevatorHudView({ kind: "hidden" });
    },
    syncCabEvalClock,
    tick,
    mergeWalkTop,
    getElevatorKinematicSupportVyMps,
    snapLocalRiderFeetToAuthoritativeCabIfNeeded,
    clampLocalRiderXZToAuthoritativeCabIfNeeded,
    tryRaycastFloorPick,
    consumeInteractKey,
    shouldSuppressEpickup,
    clampLocalClosedExteriorLandingDoors,
    getExteriorDoorInteractPrompt,
    getFloorVisibilityBand,
  };
}

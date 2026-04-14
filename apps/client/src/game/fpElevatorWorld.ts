import * as THREE from "three";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import { ElevatorCabDefSchema, LandingKitDefSchema } from "@the-mammoth/schemas";
import { fpLocomotionConstants } from "@the-mammoth/engine";
import cabAuthoringJson from "../../../../content/elevator/cab.json";
import landingKitAuthoringJson from "../../../../content/elevator/landing_kit.json";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  type CollisionAabb,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  estimateStoreyFromFeetY,
  FP_LOCOMOTION_SKIN,
  listElevatorShaftLayouts,
  maxBuildingLevelIndex,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { DbConnection } from "../module_bindings";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types";
import {
  ELEVATOR_PHASE_MOVING,
  ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M,
  ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M,
  FLOOR_PICK_MAX_RAY_M,
  FP_ELEV_FLOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
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
  fpElevPlayerInsideCabAuthoritativePlateLocal,
  fpElevatorRiderSnapContainsLocalPoint,
} from "./fpElevatorVolumes.js";
import {
  fpElevLandingExteriorDoorAimTargetWorld,
  fpElevLandingExteriorDoorInCabDockedInteract,
  fpElevLandingExteriorDoorInteractPlateLocal,
  fpElevLandingExteriorDoorNearWhileShaftAuthorized,
  advanceExteriorDoorVisSwingTowardAuth,
  EXTERIOR_DOOR_ANIM_SPEED,
  fpElevLandingExteriorDoorNearWorldPose,
  landingExteriorDoorRowKey,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
} from "./fpElevatorLandingExteriorDoor.js";
import { visitFpElevatorWorldCollisionAabbsInXZ } from "./fpElevatorWorldCollision.js";
import type {
  FpKinematicAttachment,
  FpKinematicSupportProvider,
  FpKinematicSupportSampleOpts,
  FpKinematicSupportSurface,
} from "./fpKinematicSupport.js";

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
};

export type MountFpElevatorWorldResult = {
  dispose(): void;
  /** Advance replicated cab evaluation time before locomotion/support sampling so moving-cab prediction stays aligned. */
  syncCabEvalClock(nowMs: number): void;
  tick(dt: number, nowMs: number, playerPos: THREE.Vector3): void;
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
  ): void;
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
    const v = new FpElevatorShaftVisual(
      layout,
      [ox, oy, oz],
      {
        shaftKey: layout.planKey,
        maxLevel,
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
  const pendingExteriorDoorToggle = {
    shaftKey: "",
    level: 0,
    expectedDesiredOpen: 0 as 0 | 1,
    retryCount: 0,
    nextRetryAtMs: 0,
    expireAtMs: 0,
  };

  /** Brief glow on the button that accepted a floor request (client-only). */
  const pickFlash = { shaftKey: "", level: 0, untilMs: 0 };

  const latest = new Map<string, ElevatorCar>();
  const landingByRowKey = new Map<string, ElevatorLandingDoor>();
  /** Monotonic clock sample when `elevator_car` row last arrived (moving phase only). */
  const moveReplicaAtMs = new Map<string, number>();
  const doorInterp = new Map<string, FpElevatorCabInterpScalar>();
  /** Smoothed landing-door swing for visuals only (chases replicated `swingOpen01`). */
  const landingDoorVisSwing = new Map<string, number>();
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
    if (!landingDoorVisSwing.has(row.rowKey)) landingDoorVisSwing.set(row.rowKey, row.swingOpen01);
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
    landingDoorVisSwing.delete(row.rowKey);
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

  const getCabVerticalVelocityMps = (key: string, evalWallClockMs?: number): number => {
    const row = latest.get(key);
    if (!row || row.phase !== ELEVATOR_PHASE_MOVING) return 0;
    const layout = layoutByKey.get(key);
    if (!layout) return 0;
    const tEval = evalWallClockMs ?? cabEvalNowMs;
    const t0 = moveReplicaAtMs.get(key) ?? tEval;
    const elapsedSec = Math.max(0, (tEval - t0) * 0.001);
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
    for (const [shaftKey, rowCar] of latest) {
      const layout = layoutByKey.get(shaftKey);
      const vis = visuals.get(shaftKey);
      if (!layout || !vis) continue;
      const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
      const plateX = ox + rowCar.plateX;
      const plateZ = oz + rowCar.plateZ;
      const cabY = getCabY(shaftKey);
      const phaseMoving = rowCar.phase === ELEVATOR_PHASE_MOVING;
      for (let level = 1; level <= maxLevel; level++) {
        const fy = feetYForLayout(layout, level);
        const lx = px - plateX;
        const lz = pz - plateZ;
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
        const nearDoor = fpElevLandingExteriorDoorNearWhileShaftAuthorized({
          rawNear: rawNearDoor,
          phaseMoving,
          inAuthoritativeCab,
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
        const aim = fpElevLandingExteriorDoorAimTargetWorld(
          layout.doorFace,
          plateX,
          plateZ,
          hx,
          hz,
          fy,
        );
        const dist = Math.hypot(px - aim.x, py - aim.y, pz - aim.z);
        const score = inCabDocked ? 1_000_000 - dist : -dist;
        if (best == null || score > best.score) {
          best = { shaftKey, level, score };
        }
      }
    }
    return best == null ? null : { shaftKey: best.shaftKey, level: best.level };
  };

  const resolveExteriorDoorInteract = (
    _camera: THREE.PerspectiveCamera,
    px: number,
    py: number,
    pz: number,
  ): { shaftKey: string; level: number } | null =>
    resolveExteriorDoorInteractByPose(px, py, pz);

  const queueExteriorDoorToggleAttempt = (shaftKey: string, level: number, nowMs: number) => {
    const rowKey = landingExteriorDoorRowKey(shaftKey, level);
    const currentDesired = (landingByRowKey.get(rowKey)?.desiredOpen ?? 0) !== 0 ? 1 : 0;
    pendingExteriorDoorToggle.shaftKey = shaftKey;
    pendingExteriorDoorToggle.level = level;
    pendingExteriorDoorToggle.expectedDesiredOpen = currentDesired === 0 ? 1 : 0;
    pendingExteriorDoorToggle.retryCount = 0;
    pendingExteriorDoorToggle.nextRetryAtMs = nowMs;
    pendingExteriorDoorToggle.expireAtMs = nowMs + 420;
  };

  const flushPendingExteriorDoorToggle = (nowMs: number, px: number, py: number, pz: number) => {
    if (!pendingExteriorDoorToggle.shaftKey) return;
    const rowKey = landingExteriorDoorRowKey(
      pendingExteriorDoorToggle.shaftKey,
      pendingExteriorDoorToggle.level,
    );
    const desired = (landingByRowKey.get(rowKey)?.desiredOpen ?? 0) !== 0 ? 1 : 0;
    if (desired === pendingExteriorDoorToggle.expectedDesiredOpen) {
      pendingExteriorDoorToggle.shaftKey = "";
      return;
    }
    if (nowMs >= pendingExteriorDoorToggle.expireAtMs) {
      pendingExteriorDoorToggle.shaftKey = "";
      return;
    }
    if (nowMs < pendingExteriorDoorToggle.nextRetryAtMs) return;
    try {
      void opts.conn.reducers.elevatorLandingExteriorDoorSet({
        shaftKey: pendingExteriorDoorToggle.shaftKey,
        level: pendingExteriorDoorToggle.level >>> 0,
        desiredOpen: pendingExteriorDoorToggle.expectedDesiredOpen,
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
    const dt = Math.min(0.1, Math.max(0, _dtSec));
    for (const row of landingByRowKey.values()) {
      const cur = landingDoorVisSwing.get(row.rowKey) ?? row.swingOpen01;
      landingDoorVisSwing.set(
        row.rowKey,
        advanceExteriorDoorVisSwingTowardAuth({
          current: cur,
          authoritative: row.swingOpen01,
          dtSec: dt,
          animSpeedPerSec: EXTERIOR_DOOR_ANIM_SPEED,
        }),
      );
    }
    const px = playerPos.x;
    const py = playerPos.y;
    const pz = playerPos.z;
    flushPendingExteriorDoorToggle(nowMs, px, py, pz);

    for (const [key, vis] of visuals) {
      const row = latest.get(key);
      const cabY = row != null ? getCabY(key, nowMs) : Number.NaN;
      const d = getDoor(key, nowMs);
      if (Number.isFinite(cabY)) {
        vis.updateFromServer(cabY, d);
      }
      const swingByLevel = new Map<number, number>();
      for (const row of landingByRowKey.values()) {
        if (row.shaftKey === key) {
          swingByLevel.set(
            row.level,
            landingDoorVisSwing.get(row.rowKey) ?? row.swingOpen01,
          );
        }
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
      queueExteriorDoorToggleAttempt(exterior.shaftKey, exterior.level, nowMs);
      try {
        void opts.conn.reducers.elevatorLandingExteriorDoorSet({
          shaftKey: exterior.shaftKey,
          level: exterior.level >>> 0,
          desiredOpen: pendingExteriorDoorToggle.expectedDesiredOpen,
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
    const floorLabel = ext.level <= 1 ? "Ground" : `Story ${ext.level}`;
    return { willClose, floorLabel };
  };

  const visitCollisionAabbsInXZ = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
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
      },
      x0,
      x1,
      z0,
      z1,
      visit,
    );

  const syncCabEvalClock = (nowMs: number) => {
    cabEvalNowMs = nowMs;
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
      ) {
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
      landingDoorVisSwing.clear();
    },
    syncCabEvalClock,
    tick,
    kinematicSupport,
    tryRaycastFloorPick,
    consumeInteractKey,
    shouldSuppressEpickup,
    getExteriorDoorInteractPrompt,
    visitCollisionAabbsInXZ,
    getFloorVisibilityBand,
  };
}

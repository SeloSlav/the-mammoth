import { fpLocomotionConstants } from "@the-mammoth/engine";
import {
  FP_LOCOMOTION_SKIN,
  type CollisionAabb,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type {
  ElevatorCar,
  ElevatorLandingDoor,
} from "../../../module_bindings/types";
import {
  ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_ABOVE_M,
  ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_BELOW_M,
  ELEVATOR_PHASE_MOVING,
  ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M,
  ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M,
  ELEVATOR_WALK_MERGE_FEET_MAX_OFFSET_ABOVE_CAB_FLOOR_M,
  ELEVATOR_WALK_MERGE_GATE_XZ_EXTRA_M,
} from "../fpElevatorConstants.js";
import { landingExteriorDoorRowKey } from "../fpElevatorLandingExteriorDoor.js";
import type { FpElevatorShaftVisual } from "../fpElevatorShaftVisual.js";
import {
  fpElevatorClampWorldXZToCabIfRider,
  fpElevCabWalkMergeSupportFeetAllowed,
  fpElevatorHudCarContainsLocalPoint,
  fpElevatorRiderSnapContainsLocalPoint,
} from "../fpElevatorVolumes.js";
import { visitFpElevatorWorldCollisionAabbsInXZ } from "../fpElevatorWorldCollision.js";
import type {
  FpKinematicAttachment,
  FpKinematicSupportProvider,
  FpKinematicSupportSampleOpts,
  FpKinematicSupportSurface,
} from "../../fpPhysics/fpKinematicSupport.js";
import type { DynamicCollisionQueryPose } from "../../fpPhysics/fpPlayerCollision.js";
import { DOOR_OPEN_REVEAL_THRESHOLD } from "./fpElevatorMountVisualAuthoring.js";

export type CreateFpElevatorKinematicCollisionOpts = {
  buildingWorldOriginX: number;
  buildingWorldOriginZ: number;
  maxLevel: number;
  latest: ReadonlyMap<string, ElevatorCar>;
  visuals: ReadonlyMap<string, FpElevatorShaftVisual>;
  layoutByKey: ReadonlyMap<string, ElevatorShaftLayout>;
  landingByRowKey: ReadonlyMap<string, ElevatorLandingDoor>;
  landingSwingVisual: ReadonlyMap<string, number>;
  feetYForLayout: (layout: ElevatorShaftLayout, level: number) => number;
  getCabY: (key: string, evalWallClockMs?: number) => number;
  getDoor: (key: string, nowMs: number) => number;
  getCabVerticalVelocityMps: (key: string, evalWallClockMs?: number) => number;
  getCabEvalNowMs: () => number;
};

export function createFpElevatorKinematicCollision(
  opts: CreateFpElevatorKinematicCollisionOpts,
) {
  const {
    buildingWorldOriginX: ox,
    buildingWorldOriginZ: oz,
    maxLevel,
    latest,
    visuals,
    layoutByKey,
    landingByRowKey,
    landingSwingVisual,
    feetYForLayout,
    getCabY,
    getDoor,
    getCabVerticalVelocityMps,
    getCabEvalNowMs,
  } = opts;

  const sampleSupportSurface = (
    sampleOpts: FpKinematicSupportSampleOpts,
  ): FpKinematicSupportSurface | null => {
    let bestVy = 0;
    let bestCabGeom = -Infinity;
    const feetY = sampleOpts.probeTopY - fpLocomotionConstants.walkProbeDy;
    const fx0 = sampleOpts.worldX - sampleOpts.footRadiusXZ;
    const fx1 = sampleOpts.worldX + sampleOpts.footRadiusXZ;
    const fz0 = sampleOpts.worldZ - sampleOpts.footRadiusXZ;
    const fz1 = sampleOpts.worldZ + sampleOpts.footRadiusXZ;
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
      if (
        fx1 < wx - gateHx ||
        fx0 > wx + gateHx ||
        fz1 < wz - gateHz ||
        fz0 > wz + gateHz
      ) {
        continue;
      }
      const innerAabbOverlap =
        fx1 >= wx - ihx &&
        fx0 <= wx + ihx &&
        fz1 >= wz - ihz &&
        fz0 <= wz + ihz;
      const cabFeet = getCabY(key, sampleOpts.evalWallClockMs);
      if (!Number.isFinite(cabFeet)) continue;
      const vy = getCabVerticalVelocityMps(key, sampleOpts.evalWallClockMs);
      const yLo = cabFeet - ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M;
      const yHi = Math.min(
        cabFeet + vis.inner.innerH + ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M,
        cabFeet + ELEVATOR_WALK_MERGE_FEET_MAX_OFFSET_ABOVE_CAB_FLOOR_M,
      );
      if (
        feetY >= yLo &&
        feetY <= yHi &&
        fpElevCabWalkMergeSupportFeetAllowed({
          plateLocalX: sampleOpts.worldX - wx,
          plateLocalZ: sampleOpts.worldZ - wz,
          feetWorldY: feetY,
          cabFeetWorldY: cabFeet,
          inner: vis.inner,
          maxLevel,
          feetYForLevel: (level) => feetYForLayout(layout, level),
        })
      ) {
        const geomTop = cabFeet - FP_LOCOMOTION_SKIN;
        if (
          geomTop <= sampleOpts.probeTopY + sampleOpts.stepUpMargin &&
          geomTop > bestCabGeom + 1e-5
        ) {
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
          if (
            geomTop <= sampleOpts.probeTopY + sampleOpts.stepUpMargin &&
            geomTop > bestCabGeom + 1e-5
          ) {
            bestCabGeom = geomTop;
            bestVy = vy;
          }
        }
      }
    }
    if (bestCabGeom === -Infinity) return null;
    if (Number.isFinite(sampleOpts.baseTop) && sampleOpts.baseTop > bestCabGeom + 0.05)
      return null;
    return {
      topY: bestCabGeom,
      verticalVelocityMps: bestVy,
    };
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
        getCabFloorY: (shaftKey) => getCabY(shaftKey, getCabEvalNowMs()),
        getCabDoorOpen01: (shaftKey) => getDoor(shaftKey, getCabEvalNowMs()),
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

  const applyCabRoofFeetSnap = (
    pos: { x: number; y: number; z: number },
    prevPos: { y: number },
    bodyHeightM: number,
    footRadiusM: number,
  ): boolean => {
    const head = pos.y + bodyHeightM;
    const prevHead = prevPos.y + bodyHeightM;
    const r = footRadiusM;
    const tEval = getCabEvalNowMs();
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
      if (
        pos.x + r <= minX ||
        pos.x - r >= maxX ||
        pos.z + r <= minZ ||
        pos.z - r >= maxZ
      ) {
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

  const kinematicSupport: FpKinematicSupportProvider = {
    sampleSupportSurface,
    resolveAttachment,
  };

  return {
    sampleSupportSurface,
    visitCollisionAabbsInXZ,
    resolveAttachment,
    applyCabRoofFeetSnap,
    kinematicSupport,
  };
}

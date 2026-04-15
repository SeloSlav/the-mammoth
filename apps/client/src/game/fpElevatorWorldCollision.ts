/**
 * Client-side elevator AABBs fed into `resolvePlayerCollisions`, aligned with server
 * `elevator::generated_player_collision` / `collect_generated_collision_aabbs`.
 */

import {
  type CollisionAabb,
  CLOSED_CAB_OUTSIDE_SLAB_IN,
  CLOSED_CAB_OUTSIDE_SLAB_OUT,
  CLOSED_CAB_OUTSIDE_WIDTH_PAD,
  elevatorCabGameplayHalfExtentsM,
  EXTERIOR_COLLISION_L0,
  EXTERIOR_COLLISION_L1,
  EXTERIOR_COLLISION_LZ_PAD,
  EXTERIOR_DOOR_COLLISION_OPEN_THRESH,
  EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
  EXTERIOR_DOOR_SWING_MAX_RAD,
  EXTERIOR_DOOR_HINGE_OUTSET,
  EXTERIOR_DOOR_PANEL_HALF_THICK,
  EXTERIOR_DOOR_W_M,
  EXTERIOR_STRIP_Y0,
  EXTERIOR_STRIP_Y1,
  LANDING_FRONT_PASSAGE_HALF_W_M,
  LANDING_FRONT_WALL_SLAB_IN,
  LANDING_FRONT_WALL_SLAB_OUT,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types";
import type { DynamicCollisionQueryPose } from "./fpPlayerCollision.js";
import {
  ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN,
  ELEVATOR_PHASE_MOVING,
} from "./fpElevatorConstants.js";
import {
  landingExteriorDoorRowKey,
  landingFrontPassageOpen,
} from "./fpElevatorLandingExteriorDoor.js";
import { fpElevPlayerInsideCabAuthoritativePlateLocal } from "./fpElevatorVolumes.js";

export type FpElevatorWorldCollisionAuth = {
  buildingOriginX: number;
  buildingOriginZ: number;
  maxLevel: number;
  latestCars: ReadonlyMap<string, ElevatorCar>;
  layoutByKey: ReadonlyMap<string, ElevatorShaftLayout>;
  landingByRowKey: ReadonlyMap<string, ElevatorLandingDoor>;
  feetYForLayout: (layout: ElevatorShaftLayout, level: number) => number;
  /**
   * Optional evaluated cab feet Y for this frame. When omitted, raw replicated `cabFloorY` is used.
   * Supplying this keeps dynamic collision aligned with the same predicted cab pose used by support
   * sampling and visuals.
   */
  getCabFloorY?: (shaftKey: string, row: ElevatorCar) => number;
  /** Optional evaluated interior door openness for this frame. Defaults to replicated `doorOpen01`. */
  getCabDoorOpen01?: (shaftKey: string, row: ElevatorCar) => number;
};

/** Single AABB from hinge to panel tip (matches server `push_swing_door_collision_panel`). */
function emitSwingDoorCollisionPanel(
  emit: (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) => void,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  y0: number,
  y1: number,
  pad: number,
): void {
  const minX = Math.min(startX, endX) - pad;
  const maxX = Math.max(startX, endX) + pad;
  const minZ = Math.min(startZ, endZ) - pad;
  const maxZ = Math.max(startZ, endZ) + pad;
  emit(minX, y0, minZ, maxX, y1, maxZ);
}

function shouldSuppressMovingCabGeneratedCollisionForQuery(opts: {
  row: ElevatorCar;
  layout: ElevatorShaftLayout;
  plateX: number;
  plateZ: number;
  cabFloorY: number;
  innerH: number;
  queryPose?: DynamicCollisionQueryPose;
}): boolean {
  const { row, layout, plateX, plateZ, cabFloorY, innerH, queryPose } = opts;
  if (!queryPose || row.phase !== ELEVATOR_PHASE_MOVING) return false;
  const { halfX, halfZ } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
  return fpElevPlayerInsideCabAuthoritativePlateLocal(
    queryPose.bodyX - plateX,
    queryPose.bodyZ - plateZ,
    queryPose.bodyFeetY,
    cabFloorY,
    { halfX, halfZ, innerH },
  );
}

export function visitFpElevatorWorldCollisionAabbsInXZ(
  auth: FpElevatorWorldCollisionAuth,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabb) => void,
  queryPose?: DynamicCollisionQueryPose,
): void {
  const { buildingOriginX: ox, buildingOriginZ: oz, maxLevel, latestCars, layoutByKey, landingByRowKey, feetYForLayout } =
    auth;

  const emit = (
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ) => {
    if (x1 < minX || x0 > maxX || z1 < minZ || z0 > maxZ) return;
    visit({
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });
  };

  for (const [shaftKey, row] of latestCars) {
    const layout = layoutByKey.get(shaftKey);
    if (!layout) continue;
    const cabFloorY = auth.getCabFloorY?.(shaftKey, row) ?? row.cabFloorY;
    const cabDoorOpen01 = auth.getCabDoorOpen01?.(shaftKey, row) ?? row.doorOpen01;
    const plateX = ox + row.plateX;
    const plateZ = oz + row.plateZ;
    const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);

    const innerH = Math.max(1.8, layout.sy - 2 * 0.11 - 0.14);
    const suppressMovingCabGeneratedCollision = shouldSuppressMovingCabGeneratedCollisionForQuery({
      row,
      layout,
      plateX,
      plateZ,
      cabFloorY,
      innerH,
      queryPose,
    });

    if (cabDoorOpen01 < ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN) {
      const y0 = cabFloorY - 0.22;
      const y1 = cabFloorY + innerH + 0.38;
      const doorHalf =
        (layout.doorFace === "e" || layout.doorFace === "w" ? hz : hx) + CLOSED_CAB_OUTSIDE_WIDTH_PAD;
      switch (layout.doorFace) {
        case "e":
          emit(
            plateX + hx - CLOSED_CAB_OUTSIDE_SLAB_IN,
            y0,
            plateZ - doorHalf,
            plateX + hx + CLOSED_CAB_OUTSIDE_SLAB_OUT,
            y1,
            plateZ + doorHalf,
          );
          break;
        case "w":
          emit(
            plateX - hx - CLOSED_CAB_OUTSIDE_SLAB_OUT,
            y0,
            plateZ - doorHalf,
            plateX - hx + CLOSED_CAB_OUTSIDE_SLAB_IN,
            y1,
            plateZ + doorHalf,
          );
          break;
        case "n":
          emit(
            plateX - doorHalf,
            y0,
            plateZ + hz - CLOSED_CAB_OUTSIDE_SLAB_IN,
            plateX + doorHalf,
            y1,
            plateZ + hz + CLOSED_CAB_OUTSIDE_SLAB_OUT,
          );
          break;
        case "s":
          emit(
            plateX - doorHalf,
            y0,
            plateZ - hz - CLOSED_CAB_OUTSIDE_SLAB_OUT,
            plateX + doorHalf,
            y1,
            plateZ - hz + CLOSED_CAB_OUTSIDE_SLAB_IN,
          );
          break;
      }
    }

    {
      const roofY0 = cabFloorY + innerH - 0.08;
      const roofY1 = cabFloorY + innerH + 0.16;
      emit(plateX - hx, roofY0, plateZ - hz, plateX + hx, roofY1, plateZ + hz);
    }

    // Cab walls (3 non-door faces).  These are the primary containment for
    // riders — they move with the cab and are always emitted regardless of
    // door state, moving phase, or suppression.
    // Walls extend from the inner gameplay face (hx/hz) outward past the static
    // shaft face (outerHx/outerHz) + padding, making them ~0.28 m thick.  This
    // prevents the min-penetration heuristic from ever pushing outward during
    // server-client reconciliation corrections.
    {
      const outerHx = layout.sx * 0.5;
      const outerHz = layout.sz * 0.5;
      const wallPad = 0.10;
      const y0w = cabFloorY - 0.05;
      const y1w = cabFloorY + innerH + 0.1;
      if (layout.doorFace !== "e") emit(plateX + hx, y0w, plateZ - hz, plateX + outerHx + wallPad, y1w, plateZ + hz);
      if (layout.doorFace !== "w") emit(plateX - outerHx - wallPad, y0w, plateZ - hz, plateX - hx, y1w, plateZ + hz);
      if (layout.doorFace !== "n") emit(plateX - hx, y0w, plateZ + hz, plateX + hx, y1w, plateZ + outerHz + wallPad);
      if (layout.doorFace !== "s") emit(plateX - hx, y0w, plateZ - outerHz - wallPad, plateX + hx, y1w, plateZ - hz);
    }

    const cabDoorClosed = cabDoorOpen01 < ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN;
    const cabCollisionY0 = cabFloorY - 0.22;
    const cabCollisionY1 = cabFloorY + innerH + 0.38;

    if (suppressMovingCabGeneratedCollision) continue;

    for (let level = 1; level <= maxLevel; level++) {
      const fy = feetYForLayout(layout, level);
      const landingRow = landingByRowKey.get(landingExteriorDoorRowKey(shaftKey, level));
      const authSwing = landingRow == null ? 0 : landingRow.swingOpen01;

      const landingY0 = fy - 0.22;
      const landingY1 = fy + innerH + 0.38;
      const cabCoversLanding =
        cabDoorClosed && cabCollisionY1 > landingY0 + 0.05 && cabCollisionY0 < landingY1 - 0.05;

      const y0d = fy + EXTERIOR_STRIP_Y0;
      const y1d = fy + EXTERIOR_STRIP_Y1;
      if (authSwing <= EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING && !cabCoversLanding) {
        switch (layout.doorFace) {
          case "e":
            emit(
              plateX + hx + EXTERIOR_COLLISION_L0,
              y0d,
              plateZ - (hz + EXTERIOR_COLLISION_LZ_PAD),
              plateX + hx + EXTERIOR_COLLISION_L1,
              y1d,
              plateZ + (hz + EXTERIOR_COLLISION_LZ_PAD),
            );
            break;
          case "w":
            emit(
              plateX - hx - EXTERIOR_COLLISION_L1,
              y0d,
              plateZ - (hz + EXTERIOR_COLLISION_LZ_PAD),
              plateX - hx - EXTERIOR_COLLISION_L0,
              y1d,
              plateZ + (hz + EXTERIOR_COLLISION_LZ_PAD),
            );
            break;
          case "n":
            emit(
              plateX - (hx + EXTERIOR_COLLISION_LZ_PAD),
              y0d,
              plateZ + hz + EXTERIOR_COLLISION_L0,
              plateX + (hx + EXTERIOR_COLLISION_LZ_PAD),
              y1d,
              plateZ + hz + EXTERIOR_COLLISION_L1,
            );
            break;
          case "s":
            emit(
              plateX - (hx + EXTERIOR_COLLISION_LZ_PAD),
              y0d,
              plateZ - hz - EXTERIOR_COLLISION_L1,
              plateX + (hx + EXTERIOR_COLLISION_LZ_PAD),
              y1d,
              plateZ - hz - EXTERIOR_COLLISION_L0,
            );
            break;
        }
      } else if (!cabCoversLanding && authSwing < EXTERIOR_DOOR_COLLISION_OPEN_THRESH) {
        const theta = authSwing * EXTERIOR_DOOR_SWING_MAX_RAD;
        const panelW = EXTERIOR_DOOR_W_M - 0.10;
        const hingeLat = EXTERIOR_DOOR_W_M * 0.5 - 0.06;
        const o = EXTERIOR_DOOR_HINGE_OUTSET;
        const pad = EXTERIOR_DOOR_PANEL_HALF_THICK;
        const st = Math.sin(theta);
        const ct = Math.cos(theta);

        switch (layout.doorFace) {
          case "e": {
            const hxO = plateX + hx + o;
            const hzL = plateZ + hingeLat;
            const tipX = hxO + panelW * st;
            const tipZ = hzL - panelW * ct;
            emitSwingDoorCollisionPanel(emit, hxO, hzL, tipX, tipZ, y0d, y1d, pad);
            break;
          }
          case "w": {
            const hxO = plateX - hx - o;
            const hzL = plateZ + hingeLat;
            const tipX = hxO - panelW * st;
            const tipZ = hzL + panelW * ct;
            emitSwingDoorCollisionPanel(emit, hxO, hzL, tipX, tipZ, y0d, y1d, pad);
            break;
          }
          case "n": {
            const hxL = plateX - hingeLat;
            const hzO = plateZ + hz + o;
            const tipX = hxL + panelW * ct;
            const tipZ = hzO + panelW * st;
            emitSwingDoorCollisionPanel(emit, hxL, hzO, tipX, tipZ, y0d, y1d, pad);
            break;
          }
          case "s": {
            const hxL = plateX + hingeLat;
            const hzO = plateZ - hz - o;
            const tipX = hxL - panelW * ct;
            const tipZ = hzO - panelW * st;
            emitSwingDoorCollisionPanel(emit, hxL, hzO, tipX, tipZ, y0d, y1d, pad);
            break;
          }
        }
      }

      if (cabCoversLanding) continue;

      const passageOpen = landingFrontPassageOpen({
        swingOpen01: authSwing,
        cabFloorY,
        landingFeetY: fy,
        cabDoorOpen01,
      });
      const y0w = landingY0;
      const y1w = landingY1;
      const outerHx = layout.sx * 0.5;
      const outerHz = layout.sz * 0.5;
      switch (layout.doorFace) {
        case "e": {
          const slabMinX = plateX + outerHx - LANDING_FRONT_WALL_SLAB_IN;
          const slabMaxX = plateX + outerHx + LANDING_FRONT_WALL_SLAB_OUT;
          if (!passageOpen || LANDING_FRONT_PASSAGE_HALF_W_M >= outerHz) {
            emit(slabMinX, y0w, plateZ - outerHz, slabMaxX, y1w, plateZ + outerHz);
          } else {
            emit(
              slabMinX,
              y0w,
              plateZ - outerHz,
              slabMaxX,
              y1w,
              plateZ - LANDING_FRONT_PASSAGE_HALF_W_M,
            );
            emit(
              slabMinX,
              y0w,
              plateZ + LANDING_FRONT_PASSAGE_HALF_W_M,
              slabMaxX,
              y1w,
              plateZ + outerHz,
            );
          }
          break;
        }
        case "w": {
          const slabMinX = plateX - outerHx - LANDING_FRONT_WALL_SLAB_OUT;
          const slabMaxX = plateX - outerHx + LANDING_FRONT_WALL_SLAB_IN;
          if (!passageOpen || LANDING_FRONT_PASSAGE_HALF_W_M >= outerHz) {
            emit(slabMinX, y0w, plateZ - outerHz, slabMaxX, y1w, plateZ + outerHz);
          } else {
            emit(
              slabMinX,
              y0w,
              plateZ - outerHz,
              slabMaxX,
              y1w,
              plateZ - LANDING_FRONT_PASSAGE_HALF_W_M,
            );
            emit(
              slabMinX,
              y0w,
              plateZ + LANDING_FRONT_PASSAGE_HALF_W_M,
              slabMaxX,
              y1w,
              plateZ + outerHz,
            );
          }
          break;
        }
        case "n": {
          const slabMinZ = plateZ + outerHz - LANDING_FRONT_WALL_SLAB_IN;
          const slabMaxZ = plateZ + outerHz + LANDING_FRONT_WALL_SLAB_OUT;
          if (!passageOpen || LANDING_FRONT_PASSAGE_HALF_W_M >= outerHx) {
            emit(plateX - outerHx, y0w, slabMinZ, plateX + outerHx, y1w, slabMaxZ);
          } else {
            emit(
              plateX - outerHx,
              y0w,
              slabMinZ,
              plateX - LANDING_FRONT_PASSAGE_HALF_W_M,
              y1w,
              slabMaxZ,
            );
            emit(
              plateX + LANDING_FRONT_PASSAGE_HALF_W_M,
              y0w,
              slabMinZ,
              plateX + outerHx,
              y1w,
              slabMaxZ,
            );
          }
          break;
        }
        case "s": {
          const slabMinZ = plateZ - outerHz - LANDING_FRONT_WALL_SLAB_OUT;
          const slabMaxZ = plateZ - outerHz + LANDING_FRONT_WALL_SLAB_IN;
          if (!passageOpen || LANDING_FRONT_PASSAGE_HALF_W_M >= outerHx) {
            emit(plateX - outerHx, y0w, slabMinZ, plateX + outerHx, y1w, slabMaxZ);
          } else {
            emit(
              plateX - outerHx,
              y0w,
              slabMinZ,
              plateX - LANDING_FRONT_PASSAGE_HALF_W_M,
              y1w,
              slabMaxZ,
            );
            emit(
              plateX + LANDING_FRONT_PASSAGE_HALF_W_M,
              y0w,
              slabMinZ,
              plateX + outerHx,
              y1w,
              slabMaxZ,
            );
          }
          break;
        }
      }
    }
  }
}

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
  EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
  EXTERIOR_STRIP_Y0,
  EXTERIOR_STRIP_Y1,
  LANDING_FRONT_PASSAGE_HALF_W_M,
  LANDING_FRONT_WALL_SLAB_IN,
  LANDING_FRONT_WALL_SLAB_OUT,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { ElevatorCar, ElevatorLandingDoor } from "../module_bindings/types";
import { ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN } from "./fpElevatorConstants.js";
import {
  landingExteriorDoorRowKey,
  landingFrontPassageOpen,
} from "./fpElevatorLandingExteriorDoor.js";

export type FpElevatorWorldCollisionAuth = {
  buildingOriginX: number;
  buildingOriginZ: number;
  maxLevel: number;
  latestCars: ReadonlyMap<string, ElevatorCar>;
  layoutByKey: ReadonlyMap<string, ElevatorShaftLayout>;
  landingByRowKey: ReadonlyMap<string, ElevatorLandingDoor>;
  feetYForLayout: (layout: ElevatorShaftLayout, level: number) => number;
};

export function visitFpElevatorWorldCollisionAabbsInXZ(
  auth: FpElevatorWorldCollisionAuth,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabb) => void,
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
    const plateX = ox + row.plateX;
    const plateZ = oz + row.plateZ;
    const { halfX: hx, halfZ: hz } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);

    if (row.doorOpen01 < ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN) {
      const y0 = row.cabFloorY - 0.22;
      const y1 = row.cabFloorY + Math.max(1.8, layout.sy - 2 * 0.11 - 0.14) + 0.38;
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
      const innerH = Math.max(1.8, layout.sy - 2 * 0.11 - 0.14);
      const roofY0 = row.cabFloorY + innerH - 0.08;
      const roofY1 = row.cabFloorY + innerH + 0.16;
      emit(plateX - hx, roofY0, plateZ - hz, plateX + hx, roofY1, plateZ + hz);
    }

    for (let level = 1; level <= maxLevel; level++) {
      const fy = feetYForLayout(layout, level);
      const landingRow = landingByRowKey.get(landingExteriorDoorRowKey(shaftKey, level));
      const authSwing = landingRow == null ? 0 : landingRow.swingOpen01;

      if (authSwing <= EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING) {
        const y0 = fy + EXTERIOR_STRIP_Y0;
        const y1 = fy + EXTERIOR_STRIP_Y1;
        switch (layout.doorFace) {
          case "e":
            emit(
              plateX + hx + EXTERIOR_COLLISION_L0,
              y0,
              plateZ - (hz + EXTERIOR_COLLISION_LZ_PAD),
              plateX + hx + EXTERIOR_COLLISION_L1,
              y1,
              plateZ + (hz + EXTERIOR_COLLISION_LZ_PAD),
            );
            break;
          case "w":
            emit(
              plateX - hx - EXTERIOR_COLLISION_L1,
              y0,
              plateZ - (hz + EXTERIOR_COLLISION_LZ_PAD),
              plateX - hx - EXTERIOR_COLLISION_L0,
              y1,
              plateZ + (hz + EXTERIOR_COLLISION_LZ_PAD),
            );
            break;
          case "n":
            emit(
              plateX - (hx + EXTERIOR_COLLISION_LZ_PAD),
              y0,
              plateZ + hz + EXTERIOR_COLLISION_L0,
              plateX + (hx + EXTERIOR_COLLISION_LZ_PAD),
              y1,
              plateZ + hz + EXTERIOR_COLLISION_L1,
            );
            break;
          case "s":
            emit(
              plateX - (hx + EXTERIOR_COLLISION_LZ_PAD),
              y0,
              plateZ - hz - EXTERIOR_COLLISION_L1,
              plateX + (hx + EXTERIOR_COLLISION_LZ_PAD),
              y1,
              plateZ - hz - EXTERIOR_COLLISION_L0,
            );
            break;
        }
      }

      const passageOpen = landingFrontPassageOpen({
        swingOpen01: authSwing,
        cabFloorY: row.cabFloorY,
        landingFeetY: fy,
        cabDoorOpen01: row.doorOpen01,
      });
      const innerH = Math.max(1.8, layout.sy - 2 * 0.11 - 0.14);
      const y0w = fy - 0.22;
      const y1w = fy + innerH + 0.38;
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

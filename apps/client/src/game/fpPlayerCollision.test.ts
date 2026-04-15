import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildCollisionSpatialIndex,
  type CollisionAabb,
  CLOSED_CAB_OUTSIDE_SLAB_OUT,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  type ElevatorShaftLayout,
} from "@the-mammoth/world";
import type { ElevatorCar } from "../module_bindings/types.js";
import {
  FP_PLAYER_COLLISION_RADIUS_M,
  resolvePlayerCollisions,
} from "./fpPlayerCollision.js";
import { visitFpElevatorWorldCollisionAabbsInXZ } from "./fpElevatorWorldCollision.js";

function aabb(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): CollisionAabb {
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

describe("resolvePlayerCollisions", () => {
  it("pushes the player out of a solid wall", () => {
    const solids = [aabb(1, 0, -2, 2, 3, 2)];
    const index = buildCollisionSpatialIndex(solids);
    const prev = new THREE.Vector3(0.4, 0.4, 0);
    const pos = new THREE.Vector3(1.3, 0.4, 0);
    const vel = new THREE.Vector3(1, 0, 0);
    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index);
    expect(pos.x).toBeLessThanOrEqual(1 - FP_PLAYER_COLLISION_RADIUS_M);
    expect(vel.x).toBe(0);
  });

  it("does not treat low step-height solids as horizontal blockers", () => {
    const solids = [aabb(1, 0, -2, 2, 0.6, 2)];
    const index = buildCollisionSpatialIndex(solids);
    const prev = new THREE.Vector3(0.4, 0.35, 0);
    const pos = new THREE.Vector3(1.3, 0.35, 0);
    const vel = new THREE.Vector3(1, 0, 0);
    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index);
    expect(pos.x).toBeCloseTo(1.3, 6);
    expect(vel.x).toBeCloseTo(1, 6);
  });

  it("applies dynamic AABB blockers through the same resolver", () => {
    const index = buildCollisionSpatialIndex([]);
    const prev = new THREE.Vector3(0.4, 0.4, 0);
    const pos = new THREE.Vector3(1.3, 0.4, 0);
    const vel = new THREE.Vector3(1, 0, 0);
    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index, {
      visitAabbsInXZ: (_x0, _x1, _z0, _z1, visit) => {
        visit(aabb(1, 0, -2, 2, 3, 2));
      },
    });
    expect(pos.x).toBeLessThanOrEqual(1 - FP_PLAYER_COLLISION_RADIUS_M);
    expect(vel.x).toBe(0);
  });

  it("blocks a side wall hit during a large downward move using swept vertical overlap", () => {
    const solids = [aabb(1, 4.5, -2, 2, 8.5, 2)];
    const index = buildCollisionSpatialIndex(solids);
    const prev = new THREE.Vector3(0.4, 6.2, 0);
    const pos = new THREE.Vector3(1.3, 0.4, 0);
    const vel = new THREE.Vector3(1, -12, 0);
    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index);
    expect(pos.x).toBeLessThanOrEqual(1 - FP_PLAYER_COLLISION_RADIUS_M);
    expect(vel.x).toBe(0);
  });

  it("keeps the player on the entered side of a thin wall", () => {
    const index = buildCollisionSpatialIndex([]);
    const prev = new THREE.Vector3(0, 0.4, 0.4);
    const pos = new THREE.Vector3(0, 0.4, 1.15);
    const vel = new THREE.Vector3(0, 0, 1);
    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index, {
      visitAabbsInXZ: (_x0, _x1, _z0, _z1, visit) => {
        visit(aabb(-2, 0, 1, 2, 3, 1.11));
      },
    });
    expect(pos.z).toBeLessThanOrEqual(1 - FP_PLAYER_COLLISION_RADIUS_M - 1e-3);
    expect(vel.z).toBe(0);
  });

  it("preserves tangential slide when moving diagonally into a broad north-south wall", () => {
    const solids = [aabb(-2, 0, 1, 2, 3, 2)];
    const index = buildCollisionSpatialIndex(solids);
    const prev = new THREE.Vector3(0, 0.4, 0.4);
    const pos = new THREE.Vector3(0.35, 0.4, 1.3);
    const vel = new THREE.Vector3(0.7, 0, 1.8);
    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index);
    expect(pos.x).toBeCloseTo(0.35, 6);
    expect(pos.z).toBeLessThanOrEqual(1 - FP_PLAYER_COLLISION_RADIUS_M);
    expect(vel.x).toBeCloseTo(0.7, 6);
    expect(vel.z).toBe(0);
  });

  it("blocks horizontal motion into a closed elevator cab door slab from the hallway (+X / east)", () => {
    const shaftKey = "fp-player-collision-elev-shaft";
    const plateLocalY = 1.6589473684210527;
    const layout: ElevatorShaftLayout = {
      planKey: shaftKey,
      plateX: 0,
      plateZ: 0,
      plateLocalY,
      sx: 2.38,
      sy: DEFAULT_BUILDING_FLOOR_SPACING_M,
      sz: 4.0,
      doorFace: "e",
    };
    const fy1 = elevatorSupportFeetWorldY({
      buildingWorldOriginY: 0,
      levelIndex: 1,
      floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
      shaftPlateLocalY: plateLocalY,
      shaftSy: layout.sy,
    });
    const { halfX: hx } = elevatorCabGameplayHalfExtentsM(layout.sx, layout.sz);
    const car: ElevatorCar = {
      shaftKey,
      currentLevel: 1,
      doorOpen01: 0,
      phase: 0,
      moveFromLevel: 1,
      moveToLevel: 1,
      moveU: 0,
      destQueue: [],
      cabFloorY: fy1,
      doorFace: 0,
      plateX: 0,
      plateZ: 0,
    };
    const slabMaxX = hx + CLOSED_CAB_OUTSIDE_SLAB_OUT;
    const index = buildCollisionSpatialIndex([]);
    const prev = new THREE.Vector3(slabMaxX + 0.55, fy1 + 0.5, 0);
    const pos = new THREE.Vector3(slabMaxX - 0.2, fy1 + 0.5, 0);
    const vel = new THREE.Vector3(-1.5, 0, 0);
    resolvePlayerCollisions(pos, prev, vel, false, 0.82, index, {
      visitAabbsInXZ: (x0, x1, z0, z1, visit) => {
        visitFpElevatorWorldCollisionAabbsInXZ(
          {
            buildingOriginX: 0,
            buildingOriginZ: 0,
            maxLevel: 0,
            latestCars: new Map([[shaftKey, car]]),
            layoutByKey: new Map([[shaftKey, layout]]),
            landingByRowKey: new Map(),
            feetYForLayout: (L, level) =>
              elevatorSupportFeetWorldY({
                buildingWorldOriginY: 0,
                levelIndex: level,
                floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M,
                shaftPlateLocalY: L.plateLocalY,
                shaftSy: L.sy,
              }),
          },
          x0,
          x1,
          z0,
          z1,
          visit,
        );
      },
    });
    expect(pos.x).toBeGreaterThanOrEqual(slabMaxX + FP_PLAYER_COLLISION_RADIUS_M - 1e-3);
    expect(vel.x).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCollisionSpatialIndex, type CollisionAabb } from "@the-mammoth/world";
import {
  FP_PLAYER_COLLISION_RADIUS_M,
  resolvePlayerCollisions,
} from "./fpPlayerCollision.js";

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
});

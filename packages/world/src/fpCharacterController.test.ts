import { describe, expect, it } from "vitest";
import { buildCollisionSpatialIndex } from "./collisionSpatialIndex.js";
import type { CollisionAabb } from "./collisionScene.js";
import { resolveFpCharacterCollisions } from "./fpCharacterController.js";

describe("resolveFpCharacterCollisions", () => {
  it("slides along a wall instead of stopping dead on diagonal motion", () => {
    const solids: CollisionAabb[] = [
      { min: [2, 0, -10], max: [2.2, 3, 10] },
    ];
    const index = buildCollisionSpatialIndex(solids);
    // Contract matches gameplay: `pos` is the integrated target this tick, `prevPos` is the start.
    const pos = { x: 2, y: 0, z: 2 };
    const prevPos = { x: 0, y: 0, z: 0 };
    const vel = { x: 2, y: 0, z: 2 };
    resolveFpCharacterCollisions({
      pos,
      prevPos,
      vel,
      bodyHeight: 1.78,
      radius: 0.22,
      stepUpMargin: 0.82,
      stepUpProbeM: 0,
      staticIndex: index,
      grounded: false,
    });
    expect(pos.x).toBeLessThan(1.95);
    expect(Math.abs(pos.z)).toBeGreaterThan(0.5);
  });

  it("lowers grounded feet to preserve headroom under a thin ignored slab", () => {
    const solids: CollisionAabb[] = [
      { min: [-1, 2.95, -1], max: [1, 3.05, 1] },
    ];
    const index = buildCollisionSpatialIndex(solids);
    const pos = { x: 0, y: 2.4, z: 0 };
    const prevPos = { x: 0, y: 2.48, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    resolveFpCharacterCollisions({
      pos,
      prevPos,
      vel,
      bodyHeight: 1.78,
      radius: 0.22,
      stepUpMargin: 0.82,
      stepUpProbeM: 0.41,
      staticIndex: index,
      grounded: true,
    });
    expect(pos.y).toBeCloseTo(2.95 - 1.78 - 0.0015, 6);
    expect(vel.y).toBe(0);
  });

  // Regression: elevator doorway "shot-down-a-floor" bug. The landing exterior door slab spans
  // `[fy + 0.05, fy + 2.25]` in Y and is a tall vertical wall. When the player's foot rectangle
  // overlapped it in XZ, the head-clearance clamp used to fire (`pos.y < min.y`, `head > min.y`),
  // snapping feet to `min.y - bodyHeight` ≈ `fy − 1.75`. The walk sampler then rescued them onto
  // the storey below. With the wall-vs-ceiling gate in place, tall walls whose bottom sits near
  // the feet are ignored by the clamp and horizontal depenetration handles them instead.
  it("does not snap feet downward when head overlaps a tall vertical wall near feet level", () => {
    const solids: CollisionAabb[] = [
      { min: [1, 0.05, -2], max: [2.1, 2.25, 2] },
    ];
    const index = buildCollisionSpatialIndex(solids);
    const pos = { x: 0, y: 0, z: 0 };
    const prevPos = { x: 0, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    resolveFpCharacterCollisions({
      pos,
      prevPos,
      vel,
      bodyHeight: 1.78,
      radius: 0.22,
      stepUpMargin: 0.82,
      stepUpProbeM: 0.41,
      staticIndex: index,
      grounded: true,
    });
    expect(pos.y).toBe(0);
    expect(vel.y).toBe(0);
  });

  it("still clamps feet under a legitimate low ceiling well above the feet", () => {
    const solids: CollisionAabb[] = [
      { min: [-1, 1.5, -1], max: [1, 1.8, 1] },
    ];
    const index = buildCollisionSpatialIndex(solids);
    const pos = { x: 0, y: 0, z: 0 };
    const prevPos = { x: 0, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    resolveFpCharacterCollisions({
      pos,
      prevPos,
      vel,
      bodyHeight: 1.78,
      radius: 0.22,
      stepUpMargin: 0.82,
      stepUpProbeM: 0.41,
      staticIndex: index,
      grounded: true,
    });
    expect(pos.y).toBeCloseTo(1.5 - 1.78 - 0.0015, 6);
    expect(vel.y).toBe(0);
  });
});

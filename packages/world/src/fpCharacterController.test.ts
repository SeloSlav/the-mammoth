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
});

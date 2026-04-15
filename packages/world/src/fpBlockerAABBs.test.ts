import { describe, expect, it } from "vitest";
import type { CollisionAabb } from "./collisionScene.js";
import { mergeCoplanarTouchingBlockerAabbs } from "./fpBlockerAABBs.js";

describe("mergeCoplanarTouchingBlockerAabbs", () => {
  it("merges two boxes that share full Z span and touch on X", () => {
    const a: CollisionAabb = {
      min: [0, 0, 0],
      max: [1, 2, 1],
    };
    const b: CollisionAabb = {
      min: [1, 0, 0],
      max: [2, 2, 1],
    };
    const out = mergeCoplanarTouchingBlockerAabbs([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.min[0]).toBeCloseTo(0);
    expect(out[0]!.max[0]).toBeCloseTo(2);
  });

  it("does not merge disjoint boxes that would bridge a gap", () => {
    const a: CollisionAabb = {
      min: [0, 0, 0],
      max: [1, 1, 1],
    };
    const b: CollisionAabb = {
      min: [3, 0, 0],
      max: [4, 1, 1],
    };
    const out = mergeCoplanarTouchingBlockerAabbs([a, b]);
    expect(out).toHaveLength(2);
  });
});

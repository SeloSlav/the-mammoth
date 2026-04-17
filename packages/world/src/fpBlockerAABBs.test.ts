import { describe, expect, it } from "vitest";
import type { CollisionAabb } from "./collisionScene.js";
import {
  mergeCoplanarTouchingBlockerAabbs,
  trimDoorwayJambCornersForCollision,
} from "./fpBlockerAABBs.js";

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

describe("trimDoorwayJambCornersForCollision", () => {
  const INSET = 0.24;

  // Two thin-in-X walls (xWidth 0.11) at the same X plane, separated by a 1.26m
  // Z gap — the classic apartment doorway geometry. The Z face of each wall that
  // faces the gap must be pulled back by INSET.
  it("trims Z faces of an east/west wall pair flanking a doorway", () => {
    const south: CollisionAabb = {
      min: [1.815, 3.388, -22.37],
      max: [1.925, 5.448, -16.43],
    };
    const north: CollisionAabb = {
      min: [1.815, 3.388, -15.17],
      max: [1.925, 5.448, 15.17],
    };
    const out = trimDoorwayJambCornersForCollision([south, north], INSET);
    expect(out).toHaveLength(2);
    expect(out[0]!.max[2]).toBeCloseTo(-16.43 - INSET, 5);
    expect(out[0]!.min[2]).toBeCloseTo(-22.37, 5);
    expect(out[1]!.min[2]).toBeCloseTo(-15.17 + INSET, 5);
    expect(out[1]!.max[2]).toBeCloseTo(15.17, 5);
  });

  it("trims X faces of a north/south wall pair flanking a doorway", () => {
    const west: CollisionAabb = {
      min: [-5, 3.4, 0],
      max: [-0.63, 5.46, 0.11],
    };
    const east: CollisionAabb = {
      min: [0.63, 3.4, 0],
      max: [5, 5.46, 0.11],
    };
    const out = trimDoorwayJambCornersForCollision([west, east], INSET);
    expect(out[0]!.max[0]).toBeCloseTo(-0.63 - INSET, 5);
    expect(out[1]!.min[0]).toBeCloseTo(0.63 + INSET, 5);
  });

  it("trims BOTH ends of a wall flanked by doorways on each side", () => {
    // Middle wall piece between two doorways, both ~1.26 m wide.
    const left: CollisionAabb = {
      min: [1.815, 3.4, -10],
      max: [1.925, 5.46, -5],
    };
    const middle: CollisionAabb = {
      min: [1.815, 3.4, -3.74],
      max: [1.925, 5.46, -1.5],
    };
    const right: CollisionAabb = {
      min: [1.815, 3.4, -0.24],
      max: [1.925, 5.46, 5],
    };
    const out = trimDoorwayJambCornersForCollision([left, middle, right], INSET);
    const trimmedMiddle = out[1]!;
    expect(trimmedMiddle.min[2]).toBeCloseTo(-3.74 + INSET, 5);
    expect(trimmedMiddle.max[2]).toBeCloseTo(-1.5 - INSET, 5);
  });

  it("leaves walls untouched when there is no doorway partner (dead-end wall)", () => {
    const onlyWall: CollisionAabb = {
      min: [1.815, 3.388, -22.37],
      max: [1.925, 5.448, -16.43],
    };
    const out = trimDoorwayJambCornersForCollision([onlyWall], INSET);
    expect(out[0]!.min[2]).toBeCloseTo(-22.37, 5);
    expect(out[0]!.max[2]).toBeCloseTo(-16.43, 5);
  });

  it("ignores gaps that are too wide (corridor junction) or too narrow (seam)", () => {
    const seamA: CollisionAabb = {
      min: [0, 3.4, 0],
      max: [0.11, 5.46, 1],
    };
    const seamB: CollisionAabb = {
      min: [0, 3.4, 1.2], // 0.2 m gap — below doorway min
      max: [0.11, 5.46, 5],
    };
    const wideA: CollisionAabb = {
      min: [10, 3.4, 0],
      max: [10.11, 5.46, 1],
    };
    const wideB: CollisionAabb = {
      min: [10, 3.4, 4.5], // 3.5 m gap — above doorway max
      max: [10.11, 5.46, 10],
    };
    const out = trimDoorwayJambCornersForCollision(
      [seamA, seamB, wideA, wideB],
      INSET,
    );
    for (let i = 0; i < 4; i++) {
      expect(out[i]!.min[2]).toBeCloseTo([0, 1.2, 0, 4.5][i]!, 5);
    }
  });

  it("does not treat floor slabs as walls even if they have coplanar gaps", () => {
    // Two thick-in-X slabs (floor tiles). Must NOT be trimmed — too thick to be walls.
    const floorA: CollisionAabb = {
      min: [0, 0, 0],
      max: [5, 0.1, 5],
    };
    const floorB: CollisionAabb = {
      min: [0, 0, 6.26],
      max: [5, 0.1, 11],
    };
    const out = trimDoorwayJambCornersForCollision([floorA, floorB], INSET);
    expect(out[0]!.max[2]).toBeCloseTo(5, 5);
    expect(out[1]!.min[2]).toBeCloseTo(6.26, 5);
  });

  it("requires Y overlap — walls at disjoint Y bands aren't a pair", () => {
    const low: CollisionAabb = {
      min: [0, 0, 0],
      max: [0.11, 1, 1],
    };
    const high: CollisionAabb = {
      min: [0, 5, 2.26],
      max: [0.11, 6, 5],
    };
    const out = trimDoorwayJambCornersForCollision([low, high], INSET);
    expect(out[0]!.max[2]).toBeCloseTo(1, 5);
    expect(out[1]!.min[2]).toBeCloseTo(2.26, 5);
  });
});

import { describe, expect, it } from "vitest";
import {
  partitionWallLocalSlabAabbs,
  partitionWallWorldCollisionAabbs,
} from "./partitionWallCollision.js";

describe("partitionWallCollision", () => {
  it("returns one slab for a solid wall", () => {
    const locals = partitionWallLocalSlabAabbs(4, 2.5, 0.12, []);
    expect(locals).toHaveLength(1);
    expect(locals[0]!.min[1]).toBeCloseTo(0, 4);
    expect(locals[0]!.max[1]).toBeCloseTo(2.5, 4);
  });

  it("splits holed walls into multiple slabs", () => {
    const locals = partitionWallLocalSlabAabbs(4, 2.5, 0.12, [
      { x0: -0.45, x1: 0.45, y0: 0, y1: 2.1 },
    ]);
    expect(locals.length).toBeGreaterThan(1);
  });

  it("transforms world AABBs for north/south poses (yaw 0)", () => {
    const aabbs = partitionWallWorldCollisionAabbs({
      posX: 10,
      posY: 0,
      posZ: 10,
      yawRad: 0,
      pitchRad: 0,
      sizeX: 2,
      sizeY: 2,
      sizeZ: 0.1,
    });
    expect(aabbs).toHaveLength(1);
    expect(aabbs[0]!.min[0]).toBeCloseTo(9, 3);
    expect(aabbs[0]!.max[0]).toBeCloseTo(11, 3);
    expect(aabbs[0]!.min[1]).toBeCloseTo(0, 3);
    expect(aabbs[0]!.max[1]).toBeCloseTo(2, 3);
    expect(aabbs[0]!.max[2] - aabbs[0]!.min[2]).toBeCloseTo(0.1, 3);
  });

  it("spans wall length on world Z for east/west poses (yaw pi/2)", () => {
    const aabbs = partitionWallWorldCollisionAabbs({
      posX: 5,
      posY: 44,
      posZ: 10,
      yawRad: Math.PI / 2,
      pitchRad: 0,
      sizeX: 4,
      sizeY: 2.5,
      sizeZ: 0.12,
    });
    expect(aabbs).toHaveLength(1);
    expect(aabbs[0]!.max[0] - aabbs[0]!.min[0]).toBeCloseTo(0.12, 3);
    expect(aabbs[0]!.max[2] - aabbs[0]!.min[2]).toBeCloseTo(4, 3);
    expect(aabbs[0]!.min[1]).toBeCloseTo(44, 3);
    expect(aabbs[0]!.max[1]).toBeCloseTo(46.5, 3);
  });
});

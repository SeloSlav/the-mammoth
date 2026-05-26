import { describe, expect, it } from "vitest";
import { createFpInteriorPartitionSolidCollision } from "./fpInteriorPartitionSolidCollision.js";

describe("createFpInteriorPartitionSolidCollision", () => {
  it("emits world AABB overlapping XZ query from deterministic poses", () => {
    const host = createFpInteriorPartitionSolidCollision();
    host.rebuildFromPartitionPoses([
      {
        posX: 10,
        posY: 0,
        posZ: 10,
        yawRad: 0,
        pitchRad: 0,
        sizeX: 1,
        sizeY: 2,
        sizeZ: 1,
      },
    ]);

    const hits: unknown[] = [];
    host.visitCollisionAabbsInXZ(9, 11, 9, 11, (a) => hits.push(a));
    expect(hits.length).toBe(1);

    hits.length = 0;
    host.visitCollisionAabbsInXZ(0, 1, 0, 1, () => hits.push(1));
    expect(hits.length).toBe(0);
  });

  it("emits multiple AABBs for holed walls", () => {
    const host = createFpInteriorPartitionSolidCollision();
    host.rebuildFromPartitionPoses([
      {
        posX: 4,
        posY: 0,
        posZ: 6,
        yawRad: 0.5,
        pitchRad: 0,
        sizeX: 4,
        sizeY: 2.5,
        sizeZ: 0.12,
        openings: [
          {
            id: "door_a",
            tangentOffsetM: 0,
            widthM: 0.9,
            heightM: 2.1,
            centerYM: 1.05,
          },
        ],
      },
    ]);

    const hits: unknown[] = [];
    host.visitCollisionAabbsInXZ(-20, 20, -20, 20, () => hits.push(1));
    expect(hits.length).toBeGreaterThan(1);
  });
});

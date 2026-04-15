import { describe, expect, it } from "vitest";
import { parseBuildingDoc, parseFloorDoc } from "./index.js";
import { walkSurfaceAABBsForBuilding } from "./walkSurfaceAABBs.js";

describe("walkSurfaceAABBsForBuilding", () => {
  it("adds roof walk surfaces on the highest hollow-shell storey only", () => {
    const building = parseBuildingDoc({
      id: "roof_test",
      version: 1,
      floorRefs: [
        { levelIndex: 1, floorDocId: "typical" },
        { levelIndex: 2, floorDocId: "typical" },
      ],
    });
    const floor = parseFloorDoc({
      id: "typical",
      version: 1,
      objects: [
        {
          id: "corridor",
          prefabId: "corridor_segment_a",
          position: [0, 1.6, 0],
          scale: [10, 3, 10],
        },
      ],
    });

    const aabbs = walkSurfaceAABBsForBuilding(building, () => floor, 4);
    const tops = aabbs.map((b) => b.max[1]);

    expect(tops.some((y) => Math.abs(y - 7.1) < 1e-6)).toBe(true);
    expect(tops.some((y) => Math.abs(y - 3.1) < 1e-6)).toBe(false);
  });
});

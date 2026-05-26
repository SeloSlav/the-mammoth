import { describe, expect, it } from "vitest";
import { filterWalkSurfaceAabbsByStoreyBand } from "./walkSurfaceStoreyFilter.js";
import type { WalkSurfaceAabb } from "./walkSurfaceAABBs.js";

describe("filterWalkSurfaceAabbsByStoreyBand", () => {
  it("keeps aabbs in storey band", () => {
    const low: WalkSurfaceAabb = { min: [0, 0, 0], max: [1, 1, 1] };
    const high: WalkSurfaceAabb = { min: [0, 30, 0], max: [1, 31, 1] };
    const filtered = filterWalkSurfaceAabbsByStoreyBand([low, high], {
      buildingWorldOriginY: 0,
      floorSpacingM: 4,
      bandLo: 1,
      bandHi: 2,
    });
    expect(filtered).toContain(low);
    expect(filtered).not.toContain(high);
  });
});

import { describe, expect, it } from "vitest";
import { fpBuildingFloorPlateVisibilityBand } from "./fpBuildingFloorPlateVisibilityBand.js";

describe("fpBuildingFloorPlateVisibilityBand", () => {
  it("uses full stack when revealFullStack is true", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 3,
        revealFullStack: true,
      }),
    ).toEqual({ lo: 1, hi: 19 });
  });

  it("uses a wide storey band when not in shaft context", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 19,
        playerStorey: 10,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 6, hi: 14 });
  });

  it("clamps to maxLevel at the top", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 5,
        playerStorey: 5,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 1, hi: 5 });
  });

  it("clamps at ground", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 12,
        playerStorey: 1,
        revealFullStack: false,
      }),
    ).toEqual({ lo: 1, hi: 5 });
  });

  it("normalizes maxLevel when below 1", () => {
    expect(
      fpBuildingFloorPlateVisibilityBand({
        maxLevel: 0,
        playerStorey: 1,
        revealFullStack: true,
      }),
    ).toEqual({ lo: 1, hi: 1 });
  });
});

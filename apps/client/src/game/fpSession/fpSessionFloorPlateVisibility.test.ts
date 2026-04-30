import { describe, expect, it } from "vitest";
import { fpPointNearStairShaftForPlateBand } from "./fpSessionFloorPlateVisibility.js";
import type { BuildingStairShaftSpec } from "@the-mammoth/world";

const SAMPLE_SHAFT: BuildingStairShaftSpec = {
  planKey: "0,0-test",
  id: "stairs_test",
  px: 10,
  pz: 20,
  sx: 4,
  sz: 4,
  syPlate: 3,
  bottomY: 0,
  storeyCount: 19,
  storeySpacing: 3.16,
  minLevelIndex: 1,
  entryDoorContexts: [],
  exteriorShaftFaces: ["e"],
};

describe("fpPointNearStairShaftForPlateBand", () => {
  it("returns true for a point a few meters outside the tight inner shaft (corridor door line)", () => {
    const innerHalf = SAMPLE_SHAFT.sx * 0.5 - 0.18;
    const justOutsideInnerFaceX = SAMPLE_SHAFT.px + innerHalf + 1.2;
    expect(
      fpPointNearStairShaftForPlateBand(
        justOutsideInnerFaceX,
        1.5,
        SAMPLE_SHAFT.pz,
        [SAMPLE_SHAFT],
      ),
    ).toBe(true);
  });

  it("returns false far from the shaft on the same floor", () => {
    expect(
      fpPointNearStairShaftForPlateBand(0, 1.5, 0, [SAMPLE_SHAFT]),
    ).toBe(false);
  });
});

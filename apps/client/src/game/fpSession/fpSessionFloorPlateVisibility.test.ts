import { describe, expect, it } from "vitest";
import { fpApplyResidentialInteriorPlateBandOverride } from "./fpSessionFloorPlateVisibility";

describe("fpApplyResidentialInteriorPlateBandOverride", () => {
  it("clamps a residential interior view back to the local storey", () => {
    expect(
      fpApplyResidentialInteriorPlateBandOverride({
        band: { lo: 1, hi: 30 },
        playerStorey: 12,
        maxBuildingLevel: 30,
        insideResidentialUnit: true,
        cameraOutsideBuilding: false,
        cabOccludesWorld: false,
        insideStairShaft: false,
      }),
    ).toEqual({ lo: 12, hi: 12 });
  });

  it("keeps broad bands for stair/cab/exterior cases", () => {
    expect(
      fpApplyResidentialInteriorPlateBandOverride({
        band: { lo: 1, hi: 30 },
        playerStorey: 12,
        maxBuildingLevel: 30,
        insideResidentialUnit: true,
        cameraOutsideBuilding: false,
        cabOccludesWorld: true,
        insideStairShaft: false,
      }),
    ).toEqual({ lo: 1, hi: 30 });
  });
});

import {
  fpPointNearStairShaftForPlateBand,
  fpMergeStairShaftPlateBandWithElevator,
} from "./fpSessionFloorPlateVisibility.js";
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

describe("fpMergeStairShaftPlateBandWithElevator", () => {
  it("keeps a wide elevator/hoistway band when stair-core proximity would otherwise cap storeys", () => {
    const merged = fpMergeStairShaftPlateBandWithElevator(
      { lo: 1, hi: 20, hoistwayPlateBoost: true },
      true,
      20,
      5,
    );
    expect(merged).toEqual({ lo: 1, hi: 20 });
  });

  it("applies the stair-local cap when not in a hoistway shell context", () => {
    const merged = fpMergeStairShaftPlateBandWithElevator(
      { lo: 4, hi: 8, hoistwayPlateBoost: false },
      true,
      20,
      10,
    );
    expect(merged.lo).toBeGreaterThanOrEqual(8);
    expect(merged.hi).toBeLessThanOrEqual(14);
    expect(merged.hi - merged.lo).toBeLessThan(8);
  });

  it("no-ops when not inside a stair shaft probe", () => {
    expect(
      fpMergeStairShaftPlateBandWithElevator(
        { lo: 2, hi: 6, hoistwayPlateBoost: false },
        false,
        20,
        10,
      ),
    ).toEqual({ lo: 2, hi: 6 });
  });
});

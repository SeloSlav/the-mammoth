import { describe, expect, it } from "vitest";
import { fpElevFeetInHoistwayColumnForFloorStack } from "./fpElevatorVolumes.js";

describe("fpElevFeetInHoistwayColumnForFloorStack", () => {
  const base = {
    buildingWorldOriginX: 0,
    buildingWorldOriginY: 0,
    buildingWorldOriginZ: 0,
    floorSpacingM: 3.2,
    maxLevel: 19,
    layout: { plateX: -3.175, plateZ: -92, sx: 2.38, sz: 4.0 } as const,
  };

  it("is true at hoistway center on a mid-building feet Y", () => {
    expect(fpElevFeetInHoistwayColumnForFloorStack(-3.175, 18, -92, base)).toBe(true);
  });

  it("is false outside hoistway XZ (e.g. typical hail pad east of an east-door car)", () => {
    expect(fpElevFeetInHoistwayColumnForFloorStack(-3.175 + 2.2, 18, -92, base)).toBe(false);
  });

  it("is false far above the building band", () => {
    expect(fpElevFeetInHoistwayColumnForFloorStack(-3.175, 900, -92, base)).toBe(false);
  });

  it("respects building world origin offset", () => {
    expect(
      fpElevFeetInHoistwayColumnForFloorStack(10 - 3.175, 5, 20 - 92, {
        ...base,
        buildingWorldOriginX: 10,
        buildingWorldOriginY: 1,
        buildingWorldOriginZ: 20,
      }),
    ).toBe(true);
  });
});

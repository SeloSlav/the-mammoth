import { describe, expect, it } from "vitest";
import { estimateStoreyFromFeetY } from "./buildingStory.js";

describe("estimateStoreyFromFeetY", () => {
  it("returns 1 near ground and increments by floor spacing", () => {
    const spacing = 3.16;
    const max = 19;
    expect(
      estimateStoreyFromFeetY(0.5, {
        buildingWorldOriginY: 0,
        floorSpacingM: spacing,
        maxLevel: max,
      }),
    ).toBe(1);
    expect(
      estimateStoreyFromFeetY(0.25 + spacing * 0.99, {
        buildingWorldOriginY: 0,
        floorSpacingM: spacing,
        maxLevel: max,
      }),
    ).toBe(1);
    expect(
      estimateStoreyFromFeetY(0.25 + spacing * 1.01, {
        buildingWorldOriginY: 0,
        floorSpacingM: spacing,
        maxLevel: max,
      }),
    ).toBe(2);
  });

  it("clamps to maxLevel", () => {
    expect(
      estimateStoreyFromFeetY(1e6, {
        buildingWorldOriginY: 0,
        floorSpacingM: 3,
        maxLevel: 5,
      }),
    ).toBe(5);
  });
});

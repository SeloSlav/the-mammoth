import { describe, expect, it } from "vitest";
import { parseStairWellDef } from "./index.js";
import {
  computeSwitchbackStairLayout,
  STOREY_SPACING_M,
} from "./stairWellGeometry.js";
import {
  pickCornerLandingHighestY,
  pickCornerLandingLowestY,
  pickCornerLandingOppositeEntryOpening,
} from "./stairWellLandingProps.js";

describe("pickCornerLandingLowestY / HighestY", () => {
  it("lowest deck is below highest in a multi-landing layout", () => {
    const L = computeSwitchbackStairLayout(4, STOREY_SPACING_M, 4, {});
    const low = pickCornerLandingLowestY(L, undefined);
    const high = pickCornerLandingHighestY(L, undefined);
    expect(low && high).toBeTruthy();
    expect(low!.y).toBeLessThanOrEqual(high!.y);
  });
});

describe("pickCornerLandingOppositeEntryOpening", () => {
  it("resolves a door pad when authored tangent is far outside the shaft (plate/editor space)", () => {
    const L = computeSwitchbackStairLayout(4, STOREY_SPACING_M, 4, {});
    const def = parseStairWellDef({
      id: "t",
      version: 1,
      entryOpening: {
        face: "w",
        tangentOffsetAlongWallM: -5.177,
        widthM: 2.47,
        heightM: 2.67,
        centerYM: -0.065,
      },
    });
    const opposite = pickCornerLandingOppositeEntryOpening(L, def, "typical", undefined);
    expect(opposite).toBeDefined();
  });
});

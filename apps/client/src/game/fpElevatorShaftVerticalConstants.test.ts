import { describe, expect, it } from "vitest";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
import {
  ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M,
  ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M,
} from "./fpElevatorConstants.js";

describe("elevator shaft vertical rider band", () => {
  it("keeps below-cab slack under one full storey (same-shaft wrong-floor guard margin)", () => {
    expect(ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M).toBeLessThan(DEFAULT_BUILDING_FLOOR_SPACING_M);
    expect(ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M).toBeCloseTo(DEFAULT_BUILDING_FLOOR_SPACING_M * 0.92, 5);
  });

  it("keeps headroom term bounded vs storey spacing (client/server stay formula-locked)", () => {
    expect(ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M).toBeLessThan(DEFAULT_BUILDING_FLOOR_SPACING_M);
    expect(ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M).toBeCloseTo(
      DEFAULT_BUILDING_FLOOR_SPACING_M * 0.58,
      5,
    );
  });
});

import { describe, expect, it } from "vitest";
import { elevatorLandingFloorHudLabel } from "./fpElevatorLabels.js";

describe("elevatorLandingFloorHudLabel", () => {
  it("formats podium as PR / Ground", () => {
    expect(elevatorLandingFloorHudLabel(1, new Map([[1, "PR"]]))).toBe("PR / Ground");
  });

  it("formats residential storeys as Floor N", () => {
    expect(elevatorLandingFloorHudLabel(5, new Map([[5, "5"]]))).toBe("Floor 5");
  });
});

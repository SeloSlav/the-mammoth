import { describe, expect, it } from "vitest";
import {
  fpElevFloorPickMeshesShouldShow,
  fpElevFloorPickRaycastShouldProceed,
} from "./fpElevatorVolumes.js";

describe("fpElevFloorPickMeshesShouldShow", () => {
  it("shows in cab even when doors are fully closed", () => {
    expect(fpElevFloorPickMeshesShouldShow(true, false, 0)).toBe(true);
  });

  it("shows from landing only when doorway frustum matches and doors crack open", () => {
    expect(fpElevFloorPickMeshesShouldShow(false, true, 0.17)).toBe(true);
    expect(fpElevFloorPickMeshesShouldShow(false, true, 0.15)).toBe(false);
  });

  it("hides for landing when not in doorway cone even if doors open", () => {
    expect(fpElevFloorPickMeshesShouldShow(false, false, 1)).toBe(false);
  });
});

describe("fpElevFloorPickRaycastShouldProceed", () => {
  it("allows pick in cab with doors closed", () => {
    expect(fpElevFloorPickRaycastShouldProceed(true, false, 0)).toBe(true);
  });

  it("requires more door opening for landing-only picks", () => {
    expect(fpElevFloorPickRaycastShouldProceed(false, true, 0.31)).toBe(false);
    expect(fpElevFloorPickRaycastShouldProceed(false, true, 0.33)).toBe(true);
  });

  it("rejects neither cab nor doorway", () => {
    expect(fpElevFloorPickRaycastShouldProceed(false, false, 1)).toBe(false);
  });
});

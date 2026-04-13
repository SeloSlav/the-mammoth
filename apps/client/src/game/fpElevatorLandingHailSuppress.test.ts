import { describe, expect, it } from "vitest";
import { LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M } from "./fpElevatorConstants.js";
import { fpElevSuppressLandingHailBecauseCabAtLandingSupport } from "./fpElevatorLandingHailSuppress.js";

describe("fpElevSuppressLandingHailBecauseCabAtLandingSupport", () => {
  it("suppresses when cab feet are within tolerance of landing support", () => {
    expect(fpElevSuppressLandingHailBecauseCabAtLandingSupport(10.0, 10.2)).toBe(true);
    expect(fpElevSuppressLandingHailBecauseCabAtLandingSupport(10.0, 10.0)).toBe(true);
  });

  it("does not suppress when vertical separation exceeds tolerance", () => {
    expect(fpElevSuppressLandingHailBecauseCabAtLandingSupport(10.0, 10.0 + LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M)).toBe(
      false,
    );
    expect(fpElevSuppressLandingHailBecauseCabAtLandingSupport(10.0, 9.4)).toBe(false);
  });
});

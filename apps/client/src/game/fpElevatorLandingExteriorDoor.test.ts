import { describe, expect, it } from "vitest";
import {
  EXTERIOR_STRIP_L0,
  EXTERIOR_STRIP_L1,
  fpElevLandingExteriorDoorInteractPlateLocal,
} from "./fpElevatorLandingExteriorDoor.js";

describe("fpElevLandingExteriorDoorInteractPlateLocal", () => {
  const hx = 1.09;
  const hz = 1.86;
  const fy = 10;

  it("accepts east-face pose in front of sill", () => {
    const lx = hx + (EXTERIOR_STRIP_L0 + EXTERIOR_STRIP_L1) * 0.5;
    const ok = fpElevLandingExteriorDoorInteractPlateLocal("e", hx, hz, lx, 0, fy + 1.0, fy);
    expect(ok).toBe(true);
  });

  it("rejects east when too far along Z", () => {
    const lx = hx + (EXTERIOR_STRIP_L0 + EXTERIOR_STRIP_L1) * 0.5;
    const ok = fpElevLandingExteriorDoorInteractPlateLocal("e", hx, hz, lx, 2.0, fy + 1.0, fy);
    expect(ok).toBe(false);
  });

  it("accepts west-face mirrored strip", () => {
    const lx = -hx - (EXTERIOR_STRIP_L0 + EXTERIOR_STRIP_L1) * 0.5;
    const ok = fpElevLandingExteriorDoorInteractPlateLocal("w", hx, hz, lx, 0, fy + 1.0, fy);
    expect(ok).toBe(true);
  });
});

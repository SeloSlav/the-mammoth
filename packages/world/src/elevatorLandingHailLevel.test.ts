import { describe, expect, it } from "vitest";
import {
  ELEVATOR_LANDING_CALL_CENTER_Y_OFFSET_M,
  resolveLandingHailLevel,
} from "./elevatorLandingHailLevel.js";
import {
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
} from "./elevatorShaftLayout.js";

describe("resolveLandingHailLevel", () => {
  const shaft = {
    doorFace: "n" as const,
    plateLocalY: 1.66,
    sy: 3.16,
    sx: 2.38,
    sz: 4.0,
  };

  const { halfZ } = elevatorCabGameplayHalfExtentsM(shaft.sx, shaft.sz);
  const padZ = halfZ + 0.52;

  const baseOpts = {
    buildingWorldOriginY: 0,
    floorSpacingM: 3.16,
    maxLevel: 19,
    plateWorldX: 0,
    plateWorldZ: 0,
    shaft,
    callRadiusXZ: 1.78,
    callYHalfWindow: 2.2,
  };

  it("returns null when outside XZ call radius", () => {
    const py =
      elevatorSupportFeetWorldY({
        buildingWorldOriginY: 0,
        levelIndex: 5,
        floorSpacingM: 3.16,
        shaftPlateLocalY: shaft.plateLocalY,
        shaftSy: shaft.sy,
      }) + ELEVATOR_LANDING_CALL_CENTER_Y_OFFSET_M;
    expect(resolveLandingHailLevel(50, py, 50, baseOpts)).toBeNull();
  });

  it("picks the level whose call_center_y is closest when Y windows overlap", () => {
    const cyy = (level: number) =>
      elevatorSupportFeetWorldY({
        buildingWorldOriginY: 0,
        levelIndex: level,
        floorSpacingM: 3.16,
        shaftPlateLocalY: shaft.plateLocalY,
        shaftSy: shaft.sy,
      }) + ELEVATOR_LANDING_CALL_CENTER_Y_OFFSET_M;
    const mid = (cyy(18) + cyy(19)) * 0.5;
    const pyNudgedToward19 = mid + (cyy(19) - mid) * 0.02;
    expect(resolveLandingHailLevel(0, pyNudgedToward19, padZ, baseOpts)).toBe(19);
  });

  it("returns the upper storey when feet Y matches that landing's call center (regression vs coarse storey estimate)", () => {
    const level = 19;
    const py =
      elevatorSupportFeetWorldY({
        buildingWorldOriginY: 0,
        levelIndex: level,
        floorSpacingM: 3.16,
        shaftPlateLocalY: shaft.plateLocalY,
        shaftSy: shaft.sy,
      }) + ELEVATOR_LANDING_CALL_CENTER_Y_OFFSET_M;
    expect(resolveLandingHailLevel(0, py, padZ, baseOpts)).toBe(19);
  });
});

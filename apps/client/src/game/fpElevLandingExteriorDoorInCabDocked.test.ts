import { describe, expect, it } from "vitest";
import {
  fpElevLandingExteriorDoorInCabDockedInteract,
  fpElevLandingExteriorDoorNearWhileShaftAuthorized,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
} from "./fpElevatorLandingExteriorDoor.js";

describe("fpElevLandingExteriorDoorInCabDockedInteract", () => {
  const inner = { halfX: 2.02, halfZ: 2.02, innerH: 2.5 };
  const plateWorldX = 100;
  const plateWorldZ = 200;
  const landingFeetY = 12.0;
  const cabFeetY = landingFeetY + 0.05;

  it("accepts center-cab pose when docked and not moving (corridor strip may be out of range)", () => {
    const px = plateWorldX;
    const pz = plateWorldZ;
    const py = cabFeetY + 0.5;
    expect(
      fpElevLandingExteriorDoorInCabDockedInteract({
        plateWorldX,
        plateWorldZ,
        px,
        py,
        pz,
        landingFeetWorldY: landingFeetY,
        cabFeetWorldY: cabFeetY,
        inner,
        phaseMoving: false,
        dockYTolM: LANDING_PASSAGE_DOCK_Y_TOL_M,
      }),
    ).toBe(true);
  });

  it("rejects while phase is moving", () => {
    expect(
      fpElevLandingExteriorDoorInCabDockedInteract({
        plateWorldX,
        plateWorldZ,
        px: plateWorldX,
        py: cabFeetY + 0.5,
        pz: plateWorldZ,
        landingFeetWorldY: landingFeetY,
        cabFeetWorldY: cabFeetY,
        inner,
        phaseMoving: true,
        dockYTolM: LANDING_PASSAGE_DOCK_Y_TOL_M,
      }),
    ).toBe(false);
  });

  it("rejects when cab is not aligned to that landing feet Y", () => {
    expect(
      fpElevLandingExteriorDoorInCabDockedInteract({
        plateWorldX,
        plateWorldZ,
        px: plateWorldX,
        py: cabFeetY + 0.5,
        pz: plateWorldZ,
        landingFeetWorldY: landingFeetY,
        cabFeetWorldY: landingFeetY + 4.0,
        inner,
        phaseMoving: false,
        dockYTolM: LANDING_PASSAGE_DOCK_Y_TOL_M,
      }),
    ).toBe(false);
  });
});

describe("fpElevLandingExteriorDoorNearWhileShaftAuthorized", () => {
  it("allows raw near when not moving", () => {
    expect(
      fpElevLandingExteriorDoorNearWhileShaftAuthorized({
        rawNear: true,
        phaseMoving: false,
        inAuthoritativeCab: true,
      }),
    ).toBe(true);
  });

  it("allows raw near while moving only from the hallway (not in authoritative cab)", () => {
    expect(
      fpElevLandingExteriorDoorNearWhileShaftAuthorized({
        rawNear: true,
        phaseMoving: true,
        inAuthoritativeCab: false,
      }),
    ).toBe(true);
  });

  it("blocks raw near while moving when inside authoritative cab", () => {
    expect(
      fpElevLandingExteriorDoorNearWhileShaftAuthorized({
        rawNear: true,
        phaseMoving: true,
        inAuthoritativeCab: true,
      }),
    ).toBe(false);
  });
});

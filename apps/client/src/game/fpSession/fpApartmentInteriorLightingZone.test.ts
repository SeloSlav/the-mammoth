import { describe, expect, it } from "vitest";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "@the-mammoth/engine";
import {
  fpResolveApartmentInteriorBounceScale,
  fpResolveApartmentInteriorDarkTarget01,
  fpResolveApartmentInteriorLightingZone,
} from "./fpApartmentInteriorLightingZone";

describe("fpResolveApartmentInteriorLightingZone", () => {
  const hallway = {
    insideResidentialUnit: false,
    trueExteriorView: false,
    feetOnBuildingSlab: true,
    insideElevatorCab: false,
    insideStairShaft: false,
  };

  it("includes corridor / lobby slab when not a true exterior view", () => {
    expect(fpResolveApartmentInteriorLightingZone(hallway)).toBe(true);
  });

  it("includes residential units and keeps them lit on true exterior peeks", () => {
    expect(
      fpResolveApartmentInteriorLightingZone({
        ...hallway,
        insideResidentialUnit: true,
        trueExteriorView: true,
      }),
    ).toBe(true);
  });

  it("excludes sidewalk exteriors", () => {
    expect(
      fpResolveApartmentInteriorLightingZone({
        ...hallway,
        feetOnBuildingSlab: false,
        trueExteriorView: true,
      }),
    ).toBe(false);
  });

  it("includes elevator cabs and stair shafts off the raw slab", () => {
    expect(
      fpResolveApartmentInteriorLightingZone({
        ...hallway,
        feetOnBuildingSlab: false,
        insideElevatorCab: true,
      }),
    ).toBe(true);
    expect(
      fpResolveApartmentInteriorLightingZone({
        ...hallway,
        feetOnBuildingSlab: false,
        insideStairShaft: true,
      }),
    ).toBe(true);
  });

  it("keeps elevator cabs and stair shafts interior when the raw footprint reports exterior", () => {
    expect(
      fpResolveApartmentInteriorLightingZone({
        ...hallway,
        feetOnBuildingSlab: false,
        trueExteriorView: true,
        insideElevatorCab: true,
      }),
    ).toBe(true);
    expect(
      fpResolveApartmentInteriorLightingZone({
        ...hallway,
        feetOnBuildingSlab: false,
        trueExteriorView: true,
        insideStairShaft: true,
      }),
    ).toBe(true);
  });
});

describe("fpResolveApartmentInteriorDarkTarget01", () => {
  it("maps lived-in units to full interior dark and circulation to partial fill", () => {
    expect(
      fpResolveApartmentInteriorDarkTarget01({
        insideApartmentInteriorLightingZone: true,
        insideResidentialUnit: true,
        storyLevelIndex: 18,
      }),
    ).toBe(1);
    expect(
      fpResolveApartmentInteriorDarkTarget01({
        insideApartmentInteriorLightingZone: true,
        insideResidentialUnit: false,
        storyLevelIndex: 18,
      }),
    ).toBe(APARTMENT_INTERIOR_VISUAL_PROFILE.circulation.interiorDarkTarget);
    expect(
      fpResolveApartmentInteriorDarkTarget01({
        insideApartmentInteriorLightingZone: false,
        insideResidentialUnit: false,
        storyLevelIndex: 18,
      }),
    ).toBe(0);
  });

  it("uses hallway rig inside extraction-band units (display ≤ 16)", () => {
    expect(
      fpResolveApartmentInteriorDarkTarget01({
        insideApartmentInteriorLightingZone: true,
        insideResidentialUnit: true,
        storyLevelIndex: 17,
      }),
    ).toBe(APARTMENT_INTERIOR_VISUAL_PROFILE.circulation.interiorDarkTarget);
  });
});

describe("fpResolveApartmentInteriorBounceScale", () => {
  it("boosts bounce in circulation only", () => {
    expect(
      fpResolveApartmentInteriorBounceScale({
        insideApartmentInteriorLightingZone: true,
        insideResidentialUnit: false,
        storyLevelIndex: 18,
      }),
    ).toBe(APARTMENT_INTERIOR_VISUAL_PROFILE.circulation.bounceScale);
    expect(
      fpResolveApartmentInteriorBounceScale({
        insideApartmentInteriorLightingZone: true,
        insideResidentialUnit: true,
        storyLevelIndex: 18,
      }),
    ).toBe(1);
    expect(
      fpResolveApartmentInteriorBounceScale({
        insideApartmentInteriorLightingZone: false,
        insideResidentialUnit: false,
        storyLevelIndex: 18,
      }),
    ).toBe(1);
  });

  it("boosts bounce inside extraction-band units like the hallway", () => {
    expect(
      fpResolveApartmentInteriorBounceScale({
        insideApartmentInteriorLightingZone: true,
        insideResidentialUnit: true,
        storyLevelIndex: 17,
      }),
    ).toBe(APARTMENT_INTERIOR_VISUAL_PROFILE.circulation.bounceScale);
  });
});

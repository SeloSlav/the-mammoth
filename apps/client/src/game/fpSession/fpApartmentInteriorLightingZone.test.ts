import { describe, expect, it } from "vitest";
import {
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
});

describe("fpResolveApartmentInteriorDarkTarget01", () => {
  it("maps the lighting zone to full interior dark blend", () => {
    expect(
      fpResolveApartmentInteriorDarkTarget01({ insideApartmentInteriorLightingZone: true }),
    ).toBe(1);
    expect(
      fpResolveApartmentInteriorDarkTarget01({ insideApartmentInteriorLightingZone: false }),
    ).toBe(0);
  });
});

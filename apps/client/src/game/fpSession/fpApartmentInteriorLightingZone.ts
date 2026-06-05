import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "@the-mammoth/engine";
import { apartmentExtractionBandUsesHallwayLighting } from "@the-mammoth/schemas";

/**
 * Shared interior lighting envelope for FP session — apartment units, corridors, lobbies,
 * elevator cabs, and stair cores. Keeps hallway ↔ unit transitions on the same dark rig.
 */
export function fpResolveApartmentInteriorLightingZone(input: {
  insideResidentialUnit: boolean;
  /** Sidewalk / true exterior — never apply corridor interior rig. */
  trueExteriorView: boolean;
  /** Feet inside the building's raw world XZ AABB (corridors, lobby slab, etc.). */
  feetOnBuildingSlab: boolean;
  insideElevatorCab: boolean;
  insideStairShaft: boolean;
}): boolean {
  if (
    input.trueExteriorView &&
    !input.insideResidentialUnit &&
    !input.insideElevatorCab &&
    !input.insideStairShaft
  ) {
    return false;
  }
  return (
    input.insideResidentialUnit ||
    input.feetOnBuildingSlab ||
    input.insideElevatorCab ||
    input.insideStairShaft
  );
}

export function fpResolveApartmentInteriorDarkTarget01(input: {
  insideApartmentInteriorLightingZone: boolean;
  insideResidentialUnit: boolean;
  /** Building `levelIndex` at feet (or containing unit level when in-hull). */
  storyLevelIndex: number;
}): number {
  if (!input.insideApartmentInteriorLightingZone) return 0;
  if (apartmentExtractionBandUsesHallwayLighting(input.storyLevelIndex)) {
    return APARTMENT_INTERIOR_VISUAL_PROFILE.circulation.interiorDarkTarget;
  }
  if (input.insideResidentialUnit) return 1;
  return APARTMENT_INTERIOR_VISUAL_PROFILE.circulation.interiorDarkTarget;
}

export function fpResolveApartmentInteriorBounceScale(input: {
  insideApartmentInteriorLightingZone: boolean;
  insideResidentialUnit: boolean;
  storyLevelIndex: number;
}): number {
  if (!input.insideApartmentInteriorLightingZone) return 1;
  if (
    apartmentExtractionBandUsesHallwayLighting(input.storyLevelIndex) ||
    !input.insideResidentialUnit
  ) {
    return APARTMENT_INTERIOR_VISUAL_PROFILE.circulation.bounceScale;
  }
  return 1;
}

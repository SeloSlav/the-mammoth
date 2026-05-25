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
  if (input.trueExteriorView) return input.insideResidentialUnit;
  return (
    input.insideResidentialUnit ||
    input.feetOnBuildingSlab ||
    input.insideElevatorCab ||
    input.insideStairShaft
  );
}

export function fpResolveApartmentInteriorDarkTarget01(input: {
  insideApartmentInteriorLightingZone: boolean;
}): number {
  return input.insideApartmentInteriorLightingZone ? 1 : 0;
}

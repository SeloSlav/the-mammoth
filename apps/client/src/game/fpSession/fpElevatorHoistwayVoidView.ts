/**
 * Open-shaft void presentation (black up-view, single-storey plates, no neighbor glass).
 * Distinct from {@link MountFpElevatorWorldResult.isInsideAnyCabHud} — the roof deck is HUD
 * “inside cab” but must still get hoistway void rules.
 */
export function fpResolveInsideElevatorHoistwayVoid(input: {
  hoistwayPlateBoost: boolean;
  insideElevatorCabChamber: boolean;
  trueExteriorView: boolean;
  cabOccludesWorld: boolean;
}): boolean {
  return (
    input.hoistwayPlateBoost &&
    !input.insideElevatorCabChamber &&
    !input.trueExteriorView &&
    !input.cabOccludesWorld
  );
}

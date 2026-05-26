import type { OwnedApartmentWallOpening } from "@the-mammoth/schemas";

/** Keep aligned with `packages/world` `clampOwnedApartmentWallOpeningsForLength`. */
export function clampWallOpeningTangentOffsetM(
  wallLengthM: number,
  openingWidthM: number,
  tangentOffsetM: number,
): number {
  const halfSpan = wallLengthM * 0.5;
  const halfW = openingWidthM * 0.5;
  const inset = halfW + 0.02;
  if (halfSpan <= inset + 1e-4) return 0;
  return Math.max(-halfSpan + inset, Math.min(halfSpan - inset, tangentOffsetM));
}

export function clampOwnedApartmentWallOpeningsForLength(
  sizeX: number,
  openings: readonly OwnedApartmentWallOpening[],
): OwnedApartmentWallOpening[] {
  return openings.map((opening) => ({
    ...opening,
    tangentOffsetM: clampWallOpeningTangentOffsetM(sizeX, opening.widthM, opening.tangentOffsetM),
  }));
}

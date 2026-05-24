import type { ApartmentDoorTemplate } from "./unitEntryAdjacency.js";

/** Enclosed balcony depth on the windowed long face (m). */
export const RESIDENTIAL_UNIT_BALCONY_OVERHANG_M = 2.5;

/** Living-room shell depth in floor JSON (`scale.x`) — corridor face stays fixed. */
export const RESIDENTIAL_UNIT_INTERIOR_SHELL_DEPTH_M = 9;

export type ResidentialUnitBalconyExteriorEdge = "minX" | "maxX";

/** East bar extends +X; west bar extends −X. */
export function residentialUnitBalconyExteriorEdge(
  unitId: string,
): ResidentialUnitBalconyExteriorEdge | null {
  if (!unitId) return null;
  if (unitId.startsWith("unit_e_")) return "maxX";
  if (unitId.startsWith("unit_w_")) return "minX";
  return null;
}

export function residentialUnitHasBalconyBay(unitId: string): boolean {
  return residentialUnitBalconyExteriorEdge(unitId) !== null;
}

export function extendResidentialBoundsXZForBalcony(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  unitId: string,
): typeof bounds {
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (!edge) return bounds;
  if (edge === "maxX") {
    return { ...bounds, maxX: bounds.maxX + RESIDENTIAL_UNIT_BALCONY_OVERHANG_M };
  }
  return { ...bounds, minX: bounds.minX - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M };
}

/** Playable bounds minus the balcony bay (furniture / layout fractions). */
export function contractResidentialBoundsXZForBalcony(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  unitId: string,
): typeof bounds {
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (!edge) return bounds;
  if (edge === "maxX") {
    return { ...bounds, maxX: bounds.maxX - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M };
  }
  return { ...bounds, minX: bounds.minX + RESIDENTIAL_UNIT_BALCONY_OVERHANG_M };
}

export function livingPlayableSpanX(fullSpanX: number, unitId: string): number {
  if (!residentialUnitHasBalconyBay(unitId)) return fullSpanX;
  return Math.max(0.05, fullSpanX - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M);
}

/**
 * Map layout fraction (0..1 over **living** depth) to world X when replicated bounds include the bay.
 */
export function mapOwnedApartmentLayoutFractionToWorldX(
  boundMinX: number,
  boundMaxX: number,
  unitId: string,
  fx: number,
): number {
  const spanX = boundMaxX - boundMinX;
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (!edge) return boundMinX + fx * spanX;
  const livingSpanX = spanX - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M;
  if (edge === "maxX") return boundMinX + fx * livingSpanX;
  return boundMinX + RESIDENTIAL_UNIT_BALCONY_OVERHANG_M + fx * livingSpanX;
}

export function mapOwnedApartmentWorldXToLayoutFraction(
  boundMinX: number,
  boundMaxX: number,
  unitId: string,
  worldX: number,
): number {
  const spanX = boundMaxX - boundMinX;
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (!edge) return (worldX - boundMinX) / spanX;
  const livingSpanX = spanX - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M;
  if (edge === "maxX") return (worldX - boundMinX) / livingSpanX;
  return (worldX - boundMinX - RESIDENTIAL_UNIT_BALCONY_OVERHANG_M) / livingSpanX;
}

/**
 * West-bay façade: match the east reference shutter's inset from the exterior shell edge.
 * East maps `fx → boundMin + fx·livingSpan` (exterior at `boundMax`); west maps with a
 * `+balcony` term (exterior at `boundMin`). Simple `1 - fx` preserves the same world-space
 * offset from each wing's outer wall.
 */
export function mirrorEastBalconyWindowShutterFxForWestUnit(
  eastReferenceFx: number,
  boundMinX: number,
  boundMaxX: number,
  westUnitId: string,
): number {
  const eastUnitId = westUnitId.replace(/^unit_w_/, "unit_e_");
  if (!eastUnitId.startsWith("unit_e_")) {
    return 1 - eastReferenceFx;
  }
  const eastShutterWorldX = mapOwnedApartmentLayoutFractionToWorldX(
    boundMinX,
    boundMaxX,
    eastUnitId,
    eastReferenceFx,
  );
  const insetFromEastExterior = boundMaxX - eastShutterWorldX;
  const westShutterWorldX = boundMinX + insetFromEastExterior;
  return mapOwnedApartmentWorldXToLayoutFraction(
    boundMinX,
    boundMaxX,
    westUnitId,
    westShutterWorldX,
  );
}

/** Former exterior face of the 9 m shell — solid partition; windows live on the bay façade. */
export function residentialBalconyPartitionFace(unitId: string): "e" | "w" | null {
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (edge === "maxX") return "e";
  if (edge === "minX") return "w";
  return null;
}

/** Face where the bay meets the 9 m living shell (no wall — continuous interior). */
export function residentialBalconyInteriorAdjoinFace(
  unitId: string,
): "e" | "w" | null {
  const edge = residentialUnitBalconyExteriorEdge(unitId);
  if (edge === "maxX") return "w";
  if (edge === "minX") return "e";
  return null;
}

/** Extra inset from the window wall so seeded furniture stays in the living volume. */
export function residentialUnitBalconyFurnitureInsetFromBackWallM(
  _t: ApartmentDoorTemplate,
  unitId: string,
): number {
  return residentialUnitHasBalconyBay(unitId) ? RESIDENTIAL_UNIT_BALCONY_OVERHANG_M : 0;
}

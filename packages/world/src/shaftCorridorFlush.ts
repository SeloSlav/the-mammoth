import type { FloorDoc } from "@the-mammoth/schemas";
import {
  pickFaceTowardPoint,
  type CardinalFace,
} from "./wallWithDoorCutout.js";

export type CorridorFootprint = { px: number; pz: number; hx: number; hz: number };

function isCorridorLikePrefab(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("corridor") || p.includes("lobby") || p.includes("hall");
}

/** Every corridor / lobby / hall shell on the plate (plate-space XZ). */
export function collectCorridorOrLobbyFootprintsFromFloor(
  doc: FloorDoc,
): CorridorFootprint[] {
  const out: CorridorFootprint[] = [];
  for (const o of doc.objects) {
    if (!isCorridorLikePrefab(o.prefabId)) continue;
    const sxi = o.scale?.[0] ?? 1;
    const szi = o.scale?.[2] ?? 1;
    out.push({
      px: o.position[0],
      pz: o.position[2],
      hx: sxi * 0.5,
      hz: szi * 0.5,
    });
  }
  return out;
}

/** First corridor / lobby shell on the plate (for shaft–corridor façade flush). */
export function firstCorridorOrLobbyFromFloor(
  doc: FloorDoc,
): CorridorFootprint | undefined {
  return collectCorridorOrLobbyFootprintsFromFloor(doc)[0];
}

function footprintAreaSq(c: CorridorFootprint): number {
  return c.hx * c.hz;
}

/** True when (px,pz) lies strictly inside the footprint (not on its border). */
function pointStrictlyInsideFootprint(
  px: number,
  pz: number,
  c: CorridorFootprint,
  inset: number,
): boolean {
  const x0 = c.px - c.hx + inset;
  const x1 = c.px + c.hx - inset;
  const z0 = c.pz - c.hz + inset;
  const z1 = c.pz + c.hz - inset;
  if (x1 <= x0 + 1e-6 || z1 <= z0 + 1e-6) return false;
  return px > x0 && px < x1 && pz > z0 && pz < z1;
}

/**
 * Picks a **cardinal** toward circulation for an axis-aligned corridor / lobby footprint.
 *
 * Long narrow volumes (double-loaded bar, podium hall) are much longer on one axis; doors must
 * open across the **short** width toward the spine / hall interior (±X for a Z-running spine), not
 * toward the plate centroid in world space (which biases ±Z and reads as “out the end”).
 */
function doorFaceTowardCorridorFootprint(
  shaftPx: number,
  shaftPz: number,
  c: CorridorFootprint,
  plateCentroidX: number,
  plateCentroidZ: number,
): CardinalFace {
  const ox = shaftPx - c.px;
  const oz = shaftPz - c.pz;
  const { hx, hz } = c;
  const longZ = hz >= hx * 1.65;
  const longX = hx >= hz * 1.65;
  const xTh = Math.max(0.1, 0.04 * hx);
  const zTh = Math.max(0.1, 0.04 * hz);

  if (longZ && !longX) {
    if (Math.abs(ox) > xTh) return ox < 0 ? "e" : "w";
    if (Math.abs(oz) > zTh) return oz < 0 ? "n" : "s";
    return pickFaceTowardPoint(
      shaftPx,
      shaftPz,
      plateCentroidX,
      plateCentroidZ,
    );
  }
  if (longX && !longZ) {
    if (Math.abs(oz) > zTh) return oz < 0 ? "n" : "s";
    if (Math.abs(ox) > xTh) return ox < 0 ? "e" : "w";
    return pickFaceTowardPoint(
      shaftPx,
      shaftPz,
      plateCentroidX,
      plateCentroidZ,
    );
  }

  if (ox * ox + oz * oz < 1e-10) {
    return pickFaceTowardPoint(
      shaftPx,
      shaftPz,
      plateCentroidX,
      plateCentroidZ,
    );
  }
  return pickFaceTowardPoint(shaftPx, shaftPz, c.px, c.pz);
}

/**
 * Cardinal wall of a shaft whose door should open toward circulating space: picks the
 * direction from the shaft toward the **closest** corridor/lobby footprint on this floor.
 * When none exist, falls back to `pickFaceTowardPoint` toward the plate centroid.
 */
export function elevatorDoorFaceFromFloorCorridors(
  shaftPx: number,
  shaftPz: number,
  doc: FloorDoc,
  plateCentroidX: number,
  plateCentroidZ: number,
): CardinalFace {
  const corridors = collectCorridorOrLobbyFootprintsFromFloor(doc);
  if (corridors.length === 0) {
    return pickFaceTowardPoint(
      shaftPx,
      shaftPz,
      plateCentroidX,
      plateCentroidZ,
    );
  }

  const inset = 0.06;
  const containing = corridors.filter((c) =>
    pointStrictlyInsideFootprint(shaftPx, shaftPz, c, inset),
  );
  if (containing.length > 0) {
    let innermost = containing[0]!;
    let innerA = footprintAreaSq(innermost);
    for (let i = 1; i < containing.length; i++) {
      const c = containing[i]!;
      const a = footprintAreaSq(c);
      if (a < innerA - 1e-6) {
        innermost = c;
        innerA = a;
      }
    }
    return doorFaceTowardCorridorFootprint(
      shaftPx,
      shaftPz,
      innermost,
      plateCentroidX,
      plateCentroidZ,
    );
  }

  let bestD2 = Infinity;
  let bestC: CorridorFootprint | null = null;
  for (const c of corridors) {
    const x0 = c.px - c.hx;
    const x1 = c.px + c.hx;
    const z0 = c.pz - c.hz;
    const z1 = c.pz + c.hz;
    const nx = Math.min(Math.max(shaftPx, x0), x1);
    const nz = Math.min(Math.max(shaftPz, z0), z1);
    const dx = nx - shaftPx;
    const dz = nz - shaftPz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestC = c;
    }
  }
  if (!bestC) {
    return pickFaceTowardPoint(
      shaftPx,
      shaftPz,
      plateCentroidX,
      plateCentroidZ,
    );
  }
  return doorFaceTowardCorridorFootprint(
    shaftPx,
    shaftPz,
    bestC,
    plateCentroidX,
    plateCentroidZ,
  );
}

/**
 * Gap (m) between the shaft’s corridor-facing outer plane and the corridor shell’s outer plane,
 * when the door opens toward the corridor and the two volumes overlap along the spine.
 */
export function corridorFlushGapForShaftDoor(
  doorFace: CardinalFace,
  shaftPx: number,
  shaftPz: number,
  shaftHalfX: number,
  shaftHalfZ: number,
  corridor: CorridorFootprint,
  tol = 0.04,
): number {
  const zOverlap =
    Math.min(shaftPz + shaftHalfZ, corridor.pz + corridor.hz) -
    Math.max(shaftPz - shaftHalfZ, corridor.pz - corridor.hz);
  const xOverlap =
    Math.min(shaftPx + shaftHalfX, corridor.px + corridor.hx) -
    Math.max(shaftPx - shaftHalfX, corridor.px - corridor.hx);
  const corW = corridor.px - corridor.hx;
  const corE = corridor.px + corridor.hx;
  const corS = corridor.pz - corridor.hz;
  const corN = corridor.pz + corridor.hz;
  const elevE = shaftPx + shaftHalfX;
  const elevW = shaftPx - shaftHalfX;
  const elevN = shaftPz + shaftHalfZ;
  const elevS = shaftPz - shaftHalfZ;
  if (doorFace === "e" || doorFace === "w") {
    if (zOverlap < 0.45) return 0;
    if (doorFace === "e") return Math.max(0, corW - elevE - tol);
    return Math.max(0, elevW - corE - tol);
  }
  if (xOverlap < 0.45) return 0;
  if (doorFace === "n") return Math.max(0, corS - elevN - tol);
  return Math.max(0, elevS - corN - tol);
}

/**
 * Adjacency between residential apartment units and corridor shells, in floor-doc-local XZ.
 *
 * Two consumers share this module:
 *
 * 1. `floorPlaceholderMeshes.ts` — to carve matching wall holes on both the unit and the corridor
 *    sides of the shared face (the "doorway" trim), as it has done historically.
 * 2. `scripts/gen-apartment-door-stock.mjs` — codegen that emits one swing-door template per
 *    `(unit, adjacent corridor face)` pair into `generatedApartmentDoors.ts` +
 *    `generated_apartment_doors.rs`. The server then materializes one `apartment_door` row per
 *    `(template, level_index)` at module init.
 *
 * Keeping the geometry in one file is the only way the carved hole and the placed door stay in
 * lock-step when the unit grid changes.
 */
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import {
  collectCorridorOrLobbyFootprintsFromFloor,
  type CorridorFootprint,
} from "./shaftCorridorFlush.js";

export const UNIT_CORRIDOR_TOUCH_M = 0.55;
/** Authored entry clear width on the unit shell (corridor side). */
export const UNIT_ENTRY_DOOR_W = 1.26;
/** Authored entry clear height on the unit shell. */
export const UNIT_ENTRY_DOOR_H = 2.06;
/** Distance from shell-local Y bottom to the door sill. */
export const UNIT_ENTRY_DOOR_SILL = 0.04;

export type UnitEntryFace = "n" | "s" | "e" | "w";

export type UnitEntryDoorYRange = { yDoor0: number; yDoor1: number };

/** Door tangent half-width clamped against opening overlap. */
export function entryDoorTangentHalfFromOverlap(t0: number, t1: number): number | undefined {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const span = hi - lo;
  if (span < 0.34) return undefined;
  const avail = span * 0.5 - 0.08;
  if (avail < 0.22) return undefined;
  return Math.min(UNIT_ENTRY_DOOR_W * 0.5, avail);
}

/** Door y0/y1 inside a shell of inner-vertical height `sy` (shell-local Y, centered). */
export function entryDoorYRangeForShell(sy: number): UnitEntryDoorYRange {
  const wt = 0.11;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;
  const yDoor0 = yLo + UNIT_ENTRY_DOOR_SILL;
  const yDoor1 = Math.min(yHi - 0.05, yDoor0 + UNIT_ENTRY_DOOR_H);
  return { yDoor0, yDoor1 };
}

type AdjacencyCandidate = {
  face: UnitEntryFace;
  span: number;
  /** Tangent midpoint of the overlap segment along the shared face (world / floor-doc XZ). */
  tMid: number;
};

/**
 * Best adjacent corridor face for a single unit. Returns the wall face of the unit + the
 * tangent overlap with the adjacent corridor footprint.
 */
function bestUnitCorridorAdjacency(
  unit: PlacedObject,
  sx: number,
  sz: number,
  corridors: CorridorFootprint[],
): AdjacencyCandidate | undefined {
  const upx = unit.position[0];
  const upz = unit.position[2];
  const uhx = sx * 0.5;
  const uhz = sz * 0.5;
  const ux0 = upx - uhx;
  const ux1 = upx + uhx;
  const uz0 = upz - uhz;
  const uz1 = upz + uhz;

  let best: AdjacencyCandidate | undefined;

  for (const c of corridors) {
    const cx0 = c.px - c.hx;
    const cx1 = c.px + c.hx;
    const cz0 = c.pz - c.hz;
    const cz1 = c.pz + c.hz;

    if (Math.abs(ux0 - cx1) < UNIT_CORRIDOR_TOUCH_M && upx > c.px - 0.02) {
      const z0 = Math.max(uz0, cz0);
      const z1 = Math.min(uz1, cz1);
      const span = z1 - z0;
      if (!best || span > best.span)
        best = { face: "w", span, tMid: (z0 + z1) * 0.5 };
    }
    if (Math.abs(ux1 - cx0) < UNIT_CORRIDOR_TOUCH_M && upx < c.px + 0.02) {
      const z0 = Math.max(uz0, cz0);
      const z1 = Math.min(uz1, cz1);
      const span = z1 - z0;
      if (!best || span > best.span)
        best = { face: "e", span, tMid: (z0 + z1) * 0.5 };
    }
    if (Math.abs(uz0 - cz1) < UNIT_CORRIDOR_TOUCH_M && upz > c.pz - 0.02) {
      const x0 = Math.max(ux0, cx0);
      const x1 = Math.min(ux1, cx1);
      const span = x1 - x0;
      if (!best || span > best.span)
        best = { face: "s", span, tMid: (x0 + x1) * 0.5 };
    }
    if (Math.abs(uz1 - cz0) < UNIT_CORRIDOR_TOUCH_M && upz < c.pz + 0.02) {
      const x0 = Math.max(ux0, cx0);
      const x1 = Math.min(ux1, cx1);
      const span = x1 - x0;
      if (!best || span > best.span)
        best = { face: "n", span, tMid: (x0 + x1) * 0.5 };
    }
  }
  return best;
}

/**
 * Per-floor-doc apartment door template. Coordinates are in floor-doc-local XZ (which match world
 * XZ once the building's `worldOrigin` is added). Y is a feet offset relative to the plate origin
 * (`plateWorldOriginY = building.worldOrigin.y + (level - 1) * spacing`).
 *
 * The server seeds one runtime `apartment_door` row per `(floorDocId, levelIndex, templateId)`.
 */
export type ApartmentDoorTemplate = {
  /** Stable id within this floor doc (`unitId`-prefixed). */
  templateId: string;
  /** Source unit id from floor JSON (debug / traceability). */
  unitId: string;
  /** Wall face the door lives on (cardinal direction; matches unit-side face). */
  face: UnitEntryFace;
  /** Door hinge XZ in floor-doc-local coordinates. The leaf rotates about world-Y at this point. */
  hingeX: number;
  hingeZ: number;
  /** Door feet Y offset relative to plate origin. */
  feetYOffset: number;
  /** Authored leaf width / height (meters). */
  panelWidthM: number;
  panelHeightM: number;
};

/**
 * One door template per apartment unit that touches a corridor / lobby footprint.
 *
 * The hinge sits at the **positive-tangent** edge of the opening (`+Z` for east/west walls,
 * `+X` for north/south walls) so the swing direction is consistent across all faces. The renderer
 * derives the per-face base-yaw / sign from `face` alone — no extra orientation field.
 */
export function apartmentDoorTemplatesForFloor(
  floor: FloorDoc,
): ApartmentDoorTemplate[] {
  const corridors = collectCorridorOrLobbyFootprintsFromFloor(floor);
  if (corridors.length === 0) return [];
  const out: ApartmentDoorTemplate[] = [];
  for (const o of floor.objects) {
    if (!isUnitPrefab(o.prefabId)) continue;
    const sx = o.scale?.[0] ?? 1;
    const sy = o.scale?.[1] ?? 1;
    const sz = o.scale?.[2] ?? 1;
    const best = bestUnitCorridorAdjacency(o, sx, sz, corridors);
    if (!best) continue;
    const half = entryDoorTangentHalfFromOverlap(
      best.tMid - best.span * 0.5,
      best.tMid + best.span * 0.5,
    );
    if (half == null) continue;

    const { yDoor0, yDoor1 } = entryDoorYRangeForShell(sy);
    if (yDoor1 < yDoor0 + 0.4) continue;
    const panelHeightM = Math.max(0.4, yDoor1 - yDoor0);
    // The leaf width is allowed to be slightly narrower than the opening so the kit can author a
    // smaller leaf (`apartment_unit_kit.json`'s default `panelWidthM = 1.18` < authored
    // `UNIT_ENTRY_DOOR_W = 1.26`). The opening overlap caps it.
    const panelWidthM = Math.min(UNIT_ENTRY_DOOR_W, half * 2);

    let hingeX: number;
    let hingeZ: number;
    if (best.face === "w" || best.face === "e") {
      hingeX = best.face === "w" ? o.position[0] - sx * 0.5 : o.position[0] + sx * 0.5;
      hingeZ = best.tMid + half;
    } else {
      hingeX = best.tMid + half;
      hingeZ = best.face === "n" ? o.position[2] + sz * 0.5 : o.position[2] - sz * 0.5;
    }

    const feetYOffset = o.position[1] + yDoor0;

    out.push({
      templateId: `${o.id}|${best.face}`,
      unitId: o.id,
      face: best.face,
      hingeX,
      hingeZ,
      feetYOffset,
      panelWidthM,
      panelHeightM,
    });
  }
  return out;
}

function isUnitPrefab(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("apartment") || p.includes("unit");
}

/**
 * Hand-authored apartment swing-door placements when `apartmentDoorTemplatesForFloor` does not
 * emit one — for example a long corridor segment with no opposing unit bay (no adjacency overlap).
 *
 * Keep hinge XZ aligned with `corridorShellHoleExtrasForSameFloor` so the carved hole and door row
 * stay in lock-step (same rule as unit-driven templates).
 */
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import type { ApartmentDoorTemplate } from "./unitEntryAdjacency.js";
import {
  entryDoorYRangeForShell,
  UNIT_ENTRY_DOOR_W,
} from "./unitEntryAdjacency.js";

/** Same shape as `floorPlaceholderMeshes` `CorridorShellWallHoles` — avoid importing that module here. */
export type CorridorShellWallHolesLike = {
  e: { z0: number; z1: number; y0: number; y1: number }[];
  w: { z0: number; z1: number; y0: number; y1: number }[];
  n: { x0: number; x1: number; y0: number; y1: number }[];
  s: { x0: number; x1: number; y0: number; y1: number }[];
};

/**
 * Extra templates merged into `pnpm content:gen-apartment-doors` output for matching `floorDocId`.
 * Server seeds one `apartment_door` row per `(floorDocId, levelIndex, templateId)`.
 */
export const MANUAL_APARTMENT_DOOR_EXTRAS_BY_FLOOR_DOC_ID: Readonly<
  Record<string, readonly ApartmentDoorTemplate[]>
> = {
  floor_mamutica_typical: [
    {
      templateId: "manual_e_corridor_gap_n|w",
      unitId: "manual_e_corridor_gap_n",
      face: "w",
      hingeX: 1.925,
      hingeZ: -9.47,
      feetYOffset: 0.23,
      panelWidthM: 1.26,
      panelHeightM: 2.06,
    },
  ],
};

/**
 * Matching corridor-shell cutouts on `corridor_main` (east wall, plate-local Z ≈ probe hit).
 * Only runs for authored extras above; keeps hollow shell + door parity.
 */
export function manualCorridorShellHoleExtrasForFloor(
  floor: FloorDoc,
  corridor: PlacedObject,
  _sx: number,
  sy: number,
  sz: number,
): CorridorShellWallHolesLike | undefined {
  const extras = MANUAL_APARTMENT_DOOR_EXTRAS_BY_FLOOR_DOC_ID[floor.id];
  if (!extras || extras.length === 0) return undefined;
  if (corridor.id !== "corridor_main") return undefined;

  const wt = 0.11;
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const zMin = -vlenZ * 0.5 + 0.05;
  const zMax = vlenZ * 0.5 - 0.05;
  const { yDoor0, yDoor1 } = entryDoorYRangeForShell(sy);
  if (yDoor1 < yDoor0 + 0.4) return undefined;

  const out: CorridorShellWallHolesLike = { e: [], w: [], n: [], s: [] };

  for (const t of extras) {
    if (t.face !== "w") continue;
    const half = Math.min(UNIT_ENTRY_DOOR_W * 0.5, 0.63);
    const zMid = t.hingeZ;
    let z0r = zMid - half;
    let z1r = zMid + half;
    z0r = Math.max(zMin, Math.min(z0r, zMax - 0.28));
    z1r = Math.min(zMax, Math.max(z1r, zMin + 0.28));
    if (z1r < z0r + 0.28) continue;
    /** East interior wall of the corridor (same convention as `corridorShellHolesFromAdjacentUnitEntries`). */
    out.e.push({ z0: z0r, z1: z1r, y0: yDoor0, y1: yDoor1 });
  }

  const n = out.e.length + out.w.length + out.n.length + out.s.length;
  return n > 0 ? out : undefined;
}

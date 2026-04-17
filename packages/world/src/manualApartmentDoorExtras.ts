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
 * Corridor spine core stations (plate-local Z, m). Matches `floor_mamutica_typical` stair
 * `stair_well_*` `coreZ` metadata.
 */
export const MAMUTICA_TYPICAL_CORE_STATION_Z_M = [
  -92, -46, 0, 46, 92,
] as const;

/**
 * Longitudinal offset from each core center: door sits just “south” along the corridor strip
 * (smaller plate Z), clear of the stair footprint — same offset as the first probed gap door
 * near the z=0 core.
 */
const CORRIDOR_GAP_S_OF_CORE_M = 9.47;

const PANEL = {
  feetYOffset: 0.23,
  panelWidthM: 1.26,
  panelHeightM: 2.06,
} as const;

function mamuticaTypicalCorridorGapDoorTemplates(): ApartmentDoorTemplate[] {
  const east: ApartmentDoorTemplate[] = [];
  const west: ApartmentDoorTemplate[] = [];
  let i = 1;
  for (const cz of MAMUTICA_TYPICAL_CORE_STATION_Z_M) {
    const hingeZ = cz - CORRIDOR_GAP_S_OF_CORE_M;
    const n = String(i).padStart(2, "0");
    east.push({
      templateId: `manual_e_corridor_near_stair_${n}|w`,
      unitId: `manual_e_corridor_near_stair_${n}`,
      face: "w",
      hingeX: 1.925,
      hingeZ,
      ...PANEL,
    });
    west.push({
      templateId: `manual_w_corridor_near_stair_${n}|e`,
      unitId: `manual_w_corridor_near_stair_${n}`,
      face: "e",
      hingeX: -1.925,
      hingeZ,
      ...PANEL,
    });
    i += 1;
  }
  return [...east, ...west];
}

/**
 * Extra templates merged into `pnpm content:gen-apartment-doors` output for matching `floorDocId`.
 * Server seeds one `apartment_door` row per `(floorDocId, levelIndex, templateId)`.
 */
export const MANUAL_APARTMENT_DOOR_EXTRAS_BY_FLOOR_DOC_ID: Readonly<
  Record<string, readonly ApartmentDoorTemplate[]>
> = {
  floor_mamutica_typical: mamuticaTypicalCorridorGapDoorTemplates(),
};

/**
 * Matching corridor-shell cutouts on `corridor_main` (east / west interior faces, plate-local Z).
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
    const half = Math.min(UNIT_ENTRY_DOOR_W * 0.5, 0.63);
    const zMid = t.hingeZ;
    let z0r = zMid - half;
    let z1r = zMid + half;
    z0r = Math.max(zMin, Math.min(z0r, zMax - 0.28));
    z1r = Math.min(zMax, Math.max(z1r, zMin + 0.28));
    if (z1r < z0r + 0.28) continue;

    if (t.face === "w") {
      /** East interior wall of the corridor (same convention as `corridorShellHolesFromAdjacentUnitEntries`). */
      out.e.push({ z0: z0r, z1: z1r, y0: yDoor0, y1: yDoor1 });
    } else if (t.face === "e") {
      out.w.push({ z0: z0r, z1: z1r, y0: yDoor0, y1: yDoor1 });
    }
  }

  const n = out.e.length + out.w.length + out.n.length + out.s.length;
  return n > 0 ? out : undefined;
}

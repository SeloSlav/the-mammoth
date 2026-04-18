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
  entryDoorShellCarveYRangeForShell,
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

/**
 * Shared prefix for the manual corridor→stairwell door templates. Exposed so the client renderer
 * can identify which apartment-door slots should render with a glass lite (the rest use the
 * apartment kit's default `solid: true` opaque leaf). Keeps the "what counts as glazed?" decision
 * in one place alongside the template definitions themselves.
 */
export const MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX =
  "manual_e_corridor_near_stair_";

/**
 * True when `templateId` names one of the corridor→stairwell access doors authored by
 * {@link mamuticaTypicalCorridorGapDoorTemplates}. The apartment kit is authored opaque; only
 * these stair-adjacent doors get the glass lite treatment at render time.
 */
export function isGlazedApartmentDoorTemplate(templateId: string): boolean {
  return templateId.startsWith(MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX);
}

/** Stair-adjacent side only (east interior wall of `corridor_main`); no doors on the far west wall. */
function mamuticaTypicalCorridorGapDoorTemplates(): ApartmentDoorTemplate[] {
  const out: ApartmentDoorTemplate[] = [];
  let i = 1;
  for (const cz of MAMUTICA_TYPICAL_CORE_STATION_Z_M) {
    const zOpenCenter = cz - CORRIDOR_GAP_S_OF_CORE_M;
    /** North (+Z) jamb — matches `apartmentDoorTemplatesForFloor` (`hingeZ = tMid + half`). */
    const hingeZ = zOpenCenter + PANEL.panelWidthM * 0.5;
    const n = String(i).padStart(2, "0");
    out.push({
      templateId: `${MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX}${n}|w`,
      unitId: `${MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX}${n}`,
      face: "w",
      hingeX: 1.925,
      hingeZ,
      ...PANEL,
    });
    i += 1;
  }
  return out;
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
 * Matching corridor-shell cutouts on `corridor_main` east interior face (plate-local Z).
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
  const { yDoor0: yHole0, yDoor1: yHole1 } = entryDoorShellCarveYRangeForShell(sy);

  const out: CorridorShellWallHolesLike = { e: [], w: [], n: [], s: [] };

  for (const t of extras) {
    const half = Math.min(UNIT_ENTRY_DOOR_W * 0.5, 0.63);
    /** Opening center along Z (face `w` stores hinge on +Z jamb). */
    const zMid =
      t.face === "w" || t.face === "e" ? t.hingeZ - t.panelWidthM * 0.5 : t.hingeZ;
    let z0r = zMid - half;
    let z1r = zMid + half;
    z0r = Math.max(zMin, Math.min(z0r, zMax - 0.28));
    z1r = Math.min(zMax, Math.max(z1r, zMin + 0.28));
    if (z1r < z0r + 0.28) continue;

    if (t.face !== "w") continue;
    /** East interior wall of the corridor (same convention as `corridorShellHolesFromAdjacentUnitEntries`). */
    out.e.push({ z0: z0r, z1: z1r, y0: yHole0, y1: yHole1 });
  }

  const n = out.e.length + out.w.length + out.n.length + out.s.length;
  return n > 0 ? out : undefined;
}

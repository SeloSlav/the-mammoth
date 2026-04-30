/**
 * Hand-authored apartment swing-door placements when `apartmentDoorTemplatesForFloor` does not
 * emit one — for example a long corridor segment with no opposing unit bay (no adjacency overlap).
 *
 * Keep hinge XZ aligned with `corridorShellHoleExtrasForSameFloor` so the carved hole and door row
 * stay in lock-step (same rule as unit-driven templates).
 */
import type { FloorDoc, PlacedObject, StairWellDef } from "@the-mammoth/schemas";
import type { ApartmentDoorTemplate, UnitEntryFace } from "./unitEntryAdjacency.js";
import {
  entryDoorShellCarveYRangeForShell,
  entryDoorYRangeForShell,
  UNIT_ENTRY_DOOR_W,
} from "./unitEntryAdjacency.js";
import { resolveStairWellGroundDoor } from "./stairElevatorPlaceholders.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";

/**
 * Opening fields only — keep in sync with `content/elevator/stairwell.json` (`default_stair_well`).
 * {@link resolveStairWellGroundDoor} reads `entryOpening` / `groundEntryOpening` for widths and
 * tangents even when the runtime mesh forces a different cardinal on typical storeys.
 */
const DEFAULT_STAIR_WELL_DEF = {
  id: "default_stair_well",
  version: 1,
  entryOpening: {
    face: "w",
    tangentOffsetAlongWallM: -5.177351451279119,
    widthM: 2.469149911172827,
    heightM: 2.6678947368421055,
    centerYM: -0.06499999999999995,
  },
  groundEntryOpening: {
    face: "w",
    tangentOffsetAlongWallM: -1.894676484676825,
    widthM: 1.86,
    heightM: 2.2,
    centerYM: -0.3189473684210524,
  },
} as const satisfies Pick<StairWellDef, "id" | "version" | "entryOpening" | "groundEntryOpening">;

/** Lobby centroid for `floor_mamutica_ground` — matches `shaftDoorTowardPointFromFloorCorridors` for the hub stair. */
const MAMUTICA_GROUND_STAIR_TOWARD_PLATE_XZ = [0, 0] as const;

/**
 * Mamutica east `stair_well_*` / ground `stair_hub_e` — keep in sync with floor JSON positions.
 * @see content/building/floors/floor_mamutica_typical.json
 * @see content/building/floors/floor_mamutica_ground.json
 */
const MAMUTICA_STAIR_HUB_PX = 6.159999999999999;
const MAMUTICA_STAIR_HUB_PY = 1.6589473684210527;
const MAMUTICA_STAIR_SX = 8.35;
const MAMUTICA_STAIR_SY = 3.1578947368421053;
const MAMUTICA_STAIR_SZ = 13.950000000000001;
const MAMUTICA_STAIR_WALL_T = 0.11;
/** Door leaf plane just inside the shaft inner shell (matches stair opening proxy convention). */
const MAMUTICA_STAIR_DOOR_PLANE_INSET_M = 0.015;

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
 * Raises corridor + shaft stairwell swing leaves within the existing wall holes (feet up, panel
 * shortened by the same delta so the lintel alignment stays stable). Does not change shaft
 * `doorHoleY*` or corridor CSG vertical spans.
 */
const STAIRWELL_SWING_DOOR_FEET_LIFT_M = 0.08;

/**
 * Hinge XZ in **plate / building** space for a stair-shaft swing door, matching
 * `addShaftShell` / {@link resolveStairWellGroundDoor} hole placement (inner wall plane + positive
 * tangent jamb — same convention as {@link apartmentDoorTemplatesForFloor}).
 */
function shaftExitSwingDoorHingePlateXZ(args: {
  spx: number;
  spz: number;
  sx: number;
  sz: number;
  face: CardinalFace;
  tangentAlongWall: number;
  doorHalfW: number;
  wallThicknessM?: number;
  planeInsetM?: number;
}): { hingeX: number; hingeZ: number } {
  const wt = args.wallThicknessM ?? MAMUTICA_STAIR_WALL_T;
  const inset = args.planeInsetM ?? MAMUTICA_STAIR_DOOR_PLANE_INSET_M;
  const hx = args.sx * 0.5;
  const hz = args.sz * 0.5;
  const t = args.tangentAlongWall;
  const hw = args.doorHalfW;
  const { spx, spz } = args;

  switch (args.face) {
    case "s":
      return {
        hingeX: spx + t + hw,
        hingeZ: spz + (-hz + wt) + inset,
      };
    case "n":
      return {
        hingeX: spx + t + hw,
        hingeZ: spz + (hz - wt) - inset,
      };
    case "w":
      return {
        hingeX: spx + (-hx + wt) + inset,
        hingeZ: spz + t + hw,
      };
    case "e":
      return {
        hingeX: spx + (hx - wt) - inset,
        hingeZ: spz + t + hw,
      };
    default:
      return { hingeX: spx, hingeZ: spz };
  }
}

/**
 * Shared prefix for the manual corridor→stairwell door templates. Exposed so the client renderer
 * can identify which apartment-door slots should render with a glass lite (the rest use the
 * apartment kit's default `solid: true` opaque leaf). Keeps the "what counts as glazed?" decision
 * in one place alongside the template definitions themselves.
 */
export const MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX =
  "manual_e_corridor_near_stair_";

/**
 * Shaft-side exit (stairwell balcony / façade band) swing doors — same glazed kit as
 * {@link MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX}.
 */
export const MANUAL_STAIR_SHAFT_EXIT_DOOR_UNIT_ID_PREFIX = "manual_stair_shaft_exit_";

/**
 * Extra leaf height so the glazed frame fills the CSG hole lintel (covers frame trim / float
 * error). Panel height uses `y1Local - y0Local` from {@link resolveStairWellGroundDoor} so it
 * tracks the same vertical span as `appendOpeningHole`, not only authored `heightM` when those
 * differ.
 */
const STAIR_SHAFT_EXIT_PANEL_HEIGHT_PAD_M = 0.14;

/**
 * True when `templateId` names one of the corridor→stairwell access doors authored by
 * {@link mamuticaTypicalCorridorGapDoorTemplates}, or a stair-shaft exit door from
 * {@link mamuticaTypicalStairShaftExitDoorTemplates} / {@link mamuticaGroundStairShaftExitDoorTemplates}.
 * The apartment kit is authored opaque; only these doors get the glass lite treatment at render time.
 */
export function isGlazedApartmentDoorTemplate(templateId: string): boolean {
  return (
    templateId.startsWith(MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX) ||
    templateId.startsWith(MANUAL_STAIR_SHAFT_EXIT_DOOR_UNIT_ID_PREFIX)
  );
}

/**
 * Whether the leaf rotates the “inward” way about the authored hinge.
 *
 * Apartment corridor doors intentionally open outward into the hallway so opened leaves can act as
 * FPS cover. This keeps the same hinge line and flips only the rotation direction.
 */
export function apartmentDoorSwingInwardForTemplateId(templateId: string): boolean {
  void templateId;
  return false;
}

/** Drives FP “Press E …” copy — unit entries vs corridor vs shaft façade doors. */
export type ApartmentDoorInteractPromptKind = "unit" | "hallway" | "stairwell";

export function apartmentDoorInteractPromptKindFromTemplateId(
  templateId: string,
): ApartmentDoorInteractPromptKind {
  if (templateId.startsWith(MANUAL_STAIR_SHAFT_EXIT_DOOR_UNIT_ID_PREFIX)) return "stairwell";
  if (templateId.startsWith(MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX)) return "hallway";
  return "unit";
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
      feetYOffset: PANEL.feetYOffset + STAIRWELL_SWING_DOOR_FEET_LIFT_M,
      panelWidthM: PANEL.panelWidthM,
      panelHeightM: PANEL.panelHeightM - STAIRWELL_SWING_DOOR_FEET_LIFT_M,
    });
    i += 1;
  }
  return out;
}

/**
 * Glazed swing doors in the stair **shaft** ground-door cutouts. Uses the same
 * {@link resolveStairWellGroundDoor} resolution as `floorPlaceholderMeshes` / `addShaftShell`
 * (including authored `entryOpening.tangentOffsetAlongWallM` on typical storeys — **not** zero).
 */
function mamuticaTypicalStairShaftExitDoorTemplates(): ApartmentDoorTemplate[] {
  const resolved = resolveStairWellGroundDoor({
    sx: MAMUTICA_STAIR_SX,
    sy: MAMUTICA_STAIR_SY,
    sz: MAMUTICA_STAIR_SZ,
    def: DEFAULT_STAIR_WELL_DEF as StairWellDef,
    authoringScope: "typical",
  });
  if (!resolved) return [];

  const face = resolved.face as UnitEntryFace;
  const feetYOffset =
    MAMUTICA_STAIR_HUB_PY + resolved.y0Local + STAIRWELL_SWING_DOOR_FEET_LIFT_M;
  const holeSpanYM = Math.max(0.55, resolved.y1Local - resolved.y0Local);
  const out: ApartmentDoorTemplate[] = [];
  let i = 1;
  for (const cz of MAMUTICA_TYPICAL_CORE_STATION_Z_M) {
    const n = String(i).padStart(2, "0");
    const uid = `${MANUAL_STAIR_SHAFT_EXIT_DOOR_UNIT_ID_PREFIX}typ_${n}`;
    const { hingeX, hingeZ } = shaftExitSwingDoorHingePlateXZ({
      spx: MAMUTICA_STAIR_HUB_PX,
      spz: cz,
      sx: MAMUTICA_STAIR_SX,
      sz: MAMUTICA_STAIR_SZ,
      face: resolved.face,
      tangentAlongWall: resolved.tangentOffsetAlongWallM,
      doorHalfW: resolved.doorHalfW,
    });
    out.push({
      templateId: `${uid}|${face}`,
      unitId: uid,
      face,
      hingeX,
      hingeZ,
      feetYOffset,
      panelWidthM: resolved.widthM,
      panelHeightM:
        holeSpanYM + STAIR_SHAFT_EXIT_PANEL_HEIGHT_PAD_M - STAIRWELL_SWING_DOOR_FEET_LIFT_M,
    });
    i += 1;
  }
  return out;
}

/** Ground hub stair only (`stair_hub_e` at plate Z = 0). */
function mamuticaGroundStairShaftExitDoorTemplates(): ApartmentDoorTemplate[] {
  const resolved = resolveStairWellGroundDoor({
    sx: MAMUTICA_STAIR_SX,
    sy: MAMUTICA_STAIR_SY,
    sz: MAMUTICA_STAIR_SZ,
    def: DEFAULT_STAIR_WELL_DEF as StairWellDef,
    authoringScope: "ground",
    context: {
      towardPlateXZ: MAMUTICA_GROUND_STAIR_TOWARD_PLATE_XZ,
      shaftPlateXZ: [MAMUTICA_STAIR_HUB_PX, 0],
    },
  });
  if (!resolved) return [];

  const face = resolved.face as UnitEntryFace;
  const feetYOffset =
    MAMUTICA_STAIR_HUB_PY + resolved.y0Local + STAIRWELL_SWING_DOOR_FEET_LIFT_M;
  const holeSpanYM = Math.max(0.55, resolved.y1Local - resolved.y0Local);
  const { hingeX, hingeZ } = shaftExitSwingDoorHingePlateXZ({
    spx: MAMUTICA_STAIR_HUB_PX,
    spz: 0,
    sx: MAMUTICA_STAIR_SX,
    sz: MAMUTICA_STAIR_SZ,
    face: resolved.face,
    tangentAlongWall: resolved.tangentOffsetAlongWallM,
    doorHalfW: resolved.doorHalfW,
  });
  const uid = `${MANUAL_STAIR_SHAFT_EXIT_DOOR_UNIT_ID_PREFIX}ground_hub`;
  return [
    {
      templateId: `${uid}|${face}`,
      unitId: uid,
      face,
      hingeX,
      hingeZ,
      feetYOffset,
      panelWidthM: resolved.widthM,
      panelHeightM:
        holeSpanYM + STAIR_SHAFT_EXIT_PANEL_HEIGHT_PAD_M - STAIRWELL_SWING_DOOR_FEET_LIFT_M,
    },
  ];
}

/**
 * Extra templates merged into `pnpm content:gen-apartment-doors` output for matching `floorDocId`.
 * Server seeds one `apartment_door` row per `(floorDocId, levelIndex, templateId)`.
 */
export const MANUAL_APARTMENT_DOOR_EXTRAS_BY_FLOOR_DOC_ID: Readonly<
  Record<string, readonly ApartmentDoorTemplate[]>
> = {
  floor_mamutica_ground: mamuticaGroundStairShaftExitDoorTemplates(),
  floor_mamutica_typical: [
    ...mamuticaTypicalCorridorGapDoorTemplates(),
    ...mamuticaTypicalStairShaftExitDoorTemplates(),
  ],
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

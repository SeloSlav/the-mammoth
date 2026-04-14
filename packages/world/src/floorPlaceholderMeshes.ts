import * as THREE from "three";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import { shaftPlanKey } from "./buildingStairShafts.js";
import {
  addElevatorShaftPlaceholder,
  addStairWellPlaceholder,
  elevatorGroundDoorOpeningLocals,
  stairShaftDoorTangentSpanShaftLocal,
} from "./stairElevatorPlaceholders.js";
import {
  addDoorFrameTrimConstantX,
  addDoorFrameTrimConstantZ,
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  type CardinalFace,
  type WallHoleXY,
  type WallHoleYZ,
} from "./wallWithDoorCutout.js";
import {
  collectShaftSlabHoles,
  hollowShellXZRectsWithShaftCutouts,
  mergeElevatorShaftSlabHolesFromFloorDocs,
  punchElevatorHolesInShellRects,
  type RectXZ,
  type ShaftSlabHole,
} from "./shaftPlanformClip.js";
import {
  GROUND_SLAB_MARGIN_XZ,
  GROUND_SLAB_THICKNESS_M,
  addConcreteSlabWithOptionalShaftHoles,
  addGroundFootprintGrassOccluder,
} from "./floorSlabPlaceholder.js";
import { floorPlaceholderMeshMaterials as mat } from "./floorPlaceholderMeshMaterials.js";
import {
  collectCorridorOrLobbyFootprintsFromFloor,
  corridorFlushGapForShaftDoor,
  elevatorDoorFaceFromFloorCorridors,
  firstCorridorOrLobbyFromFloor,
} from "./shaftCorridorFlush.js";
import {
  readElevatorDoorFaceOverride,
  type BuildFloorMeshesOptions,
} from "./elevatorDoorFacesFromGroundFloorDoc.js";
import { addOppositeCorridorKatSignMeshes } from "./elevatorLandingKatSign.js";

type PlaceholderKind = "corridor" | "unit" | "core" | "misc";

/** Exported for unit tests / tooling; drives corridor vs unit mesh routing. */
export function classifyPrefab(prefabId: string): PlaceholderKind {
  const p = prefabId.toLowerCase();
  if (p.includes("corridor") || p.includes("lobby") || p.includes("hall"))
    return "corridor";
  if (p.includes("apartment") || p.includes("unit")) return "unit";
  if (p.includes("stair") || p.includes("elev") || p.includes("core"))
    return "core";
  return "misc";
}

/**
 * Ground storey corridor / lobby: **double-door frame bays** (m clear).
 * Panels/doors are not modeled yet — openings + trim only.
 */
const LOBBY_DOUBLE_DOOR_W = 1.84;
const LOBBY_DOUBLE_DOOR_H = 2.16;
const LOBBY_DOOR_SILL = 0.04;
/** Minimum centre-to-centre spacing so adjacent double frames read as separate bays. */
const LOBBY_DOUBLE_DOOR_BAY_SPACING = LOBBY_DOUBLE_DOOR_W + 0.56;

/** Typical residential entry clear width — aligned opening on both unit and corridor shells. */
const UNIT_CORRIDOR_TOUCH_M = 0.55;
const UNIT_ENTRY_DOOR_W = 1.26;
const UNIT_ENTRY_DOOR_H = 2.06;
const UNIT_ENTRY_DOOR_SILL = 0.04;

function matsFor(kind: PlaceholderKind): {
  floor: THREE.MeshStandardMaterial;
  ceil: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
} {
  switch (kind) {
    case "corridor":
      return { floor: mat.corridorFloor, ceil: mat.corridorCeil, wall: mat.corridorWall };
    case "unit":
      return { floor: mat.unitFloor, ceil: mat.unitCeil, wall: mat.unitWall };
    case "core":
      return { floor: mat.coreFloor, ceil: mat.coreCeil, wall: mat.coreWall };
    default:
      return { floor: mat.miscFloor, ceil: mat.miscCeil, wall: mat.miscWall };
  }
}

/** Room-local holes on corridor perimeter walls (aligned with adjacent stair / elevator doors). */
type CorridorShellWallHoles = {
  e: WallHoleYZ[];
  w: WallHoleYZ[];
  n: WallHoleXY[];
  s: WallHoleXY[];
};

/** Room-local data to place a sign above an elevator door on a corridor wall. */
type ElevatorCorridorSignPlacement = {
  corridorWall: CardinalFace;
  /** Top of door opening (room-local Y). */
  yDoorTop: number;
  zMid: number;
  xMid: number;
};

type HollowShellOpts = {
  shaftHolesPlate: readonly ShaftSlabHole[];
  roomPx: number;
  roomPz: number;
  /** When set (e.g. room has rotation), use solid floor/ceiling plates — cutouts are axis-only. */
  skipShaftCutouts: boolean;
  /** 1-based storey; level 1 gets lobby-style openings on corridor shells. */
  storyLevelIndex?: number;
  /** Elevator-only union (plate-space); second cut on shell floor/ceiling so flanking plates do not cap hoistways. */
  shaftElevatorsMerged?: readonly ShaftSlabHole[];
  /** Cuts through corridor walls opposite elevator doors (room-local). */
  corridorWallHoles?: CorridorShellWallHoles;
  /** Elevator door heads on this corridor shell — room-local; used for manufacturer signage. */
  elevatorSignPlacements?: readonly ElevatorCorridorSignPlacement[];
};

type PlateStairCorridorDoorPunch = {
  /** Door wall on the stair/elevator shaft (same convention as {@link addShaftShell}). */
  stairFace: CardinalFace;
  tangentLocal: number;
  doorHalfW: number;
  y0Local: number;
  y1Local: number;
  spx: number;
  spz: number;
  spy: number;
  shx: number;
  shz: number;
  /** When true, a manufacturer sign is placed on the adjacent corridor wall above this door. */
  isElevator?: boolean;
};

const STAIR_CORRIDOR_TOUCH_M = 0.55;

function corridorWallReceivingStairDoor(stairFace: CardinalFace): CardinalFace {
  switch (stairFace) {
    case "e":
      return "w";
    case "w":
      return "e";
    case "n":
      return "s";
    case "s":
      return "n";
  }
}

type CorridorShaftDoorContact = {
  punch: PlateStairCorridorDoorPunch;
  corridorWall: CardinalFace;
  y0r: number;
  y1r: number;
  z0r: number;
  z1r: number;
  x0r: number;
  x1r: number;
  holeAlongZ: boolean;
};

function resolveCorridorShaftDoorContacts(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  punches: readonly PlateStairCorridorDoorPunch[],
): CorridorShaftDoorContact[] {
  if (kind !== "corridor" || punches.length === 0) return [];

  const cpx = corridor.position[0];
  const cpz = corridor.position[2];
  const cpy = corridor.position[1];
  const chx = sx * 0.5;
  const chz = sz * 0.5;
  /** Match stair/elevator shaft shells (`addShaftShell`) so corridor holes share the same sill and tangent span. */
  const wt = 0.11;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;

  const contacts: CorridorShaftDoorContact[] = [];

  for (const p of punches) {
    const cw = corridorWallReceivingStairDoor(p.stairFace);
    const { spx, spz, spy, shx, shz, stairFace } = p;
    const sxShaft = 2 * shx;
    const szShaft = 2 * shz;
    const span = stairShaftDoorTangentSpanShaftLocal(
      sxShaft,
      szShaft,
      stairFace,
      p.tangentLocal,
      p.doorHalfW,
    );
    let z0p: number;
    let z1p: number;
    let x0p: number;
    let x1p: number;
    if (stairFace === "e" || stairFace === "w") {
      const s = span as { z0: number; z1: number };
      z0p = spz + s.z0;
      z1p = spz + s.z1;
      x0p = spx + p.tangentLocal - p.doorHalfW;
      x1p = spx + p.tangentLocal + p.doorHalfW;
    } else {
      const s = span as { x0: number; x1: number };
      x0p = spx + s.x0;
      x1p = spx + s.x1;
      z0p = spz + p.tangentLocal - p.doorHalfW;
      z1p = spz + p.tangentLocal + p.doorHalfW;
    }

    let adjacent = false;
    if (stairFace === "e") {
      adjacent =
        Math.abs(cpx - chx - (spx + shx)) < STAIR_CORRIDOR_TOUCH_M && cpx > spx - 0.02;
    } else if (stairFace === "w") {
      adjacent =
        Math.abs(cpx + chx - (spx - shx)) < STAIR_CORRIDOR_TOUCH_M && cpx < spx + 0.02;
    } else if (stairFace === "n") {
      adjacent =
        Math.abs(cpz - chz - (spz + shz)) < STAIR_CORRIDOR_TOUCH_M && cpz > spz - 0.02;
    } else {
      adjacent =
        Math.abs(cpz + chz - (spz - shz)) < STAIR_CORRIDOR_TOUCH_M && cpz < spz + 0.02;
    }
    if (!adjacent) continue;

    const overlap =
      stairFace === "e" || stairFace === "w"
        ? Math.min(cpz + chz, z1p) - Math.max(cpz - chz, z0p)
        : Math.min(cpx + chx, x1p) - Math.max(cpx - chx, x0p);
    if (overlap < 0.14) continue;

    const ya = Math.min(p.y0Local, p.y1Local);
    const yb = Math.max(p.y0Local, p.y1Local);
    /** Shaft door Y is interior-local; convert to corridor room-local Y (same as lobby holes). */
    const y0w = spy + ya - cpy;
    const y1w = spy + yb - cpy;
    let y0r = Math.min(y0w, y1w);
    let y1r = Math.max(y0w, y1w);
    /** Light clamp only — avoid lifting the sill above the stair opening (was yLo+0.04 and caused a lip). */
    y0r = Math.max(yLo + 0.008, y0r);
    y1r = Math.min(yHi - 0.008, y1r);

    if (cw === "e" || cw === "w") {
      const z0r = Math.max(zMin, Math.min(z0p, z1p) - cpz);
      const z1r = Math.min(zMax, Math.max(z0p, z1p) - cpz);
      if (z1r < z0r + 0.1 || y1r < y0r + 0.45) continue;
      contacts.push({
        punch: p,
        corridorWall: cw,
        y0r,
        y1r,
        z0r,
        z1r,
        x0r: 0,
        x1r: 0,
        holeAlongZ: true,
      });
    } else {
      const x0r = Math.max(xMin, Math.min(x0p, x1p) - cpx);
      const x1r = Math.min(xMax, Math.max(x0p, x1p) - cpx);
      if (x1r < x0r + 0.1 || y1r < y0r + 0.45) continue;
      contacts.push({
        punch: p,
        corridorWall: cw,
        y0r,
        y1r,
        z0r: 0,
        z1r: 0,
        x0r,
        x1r,
        holeAlongZ: false,
      });
    }
  }

  return contacts;
}

function corridorShellHolesFromStairPunches(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  punches: readonly PlateStairCorridorDoorPunch[],
): CorridorShellWallHoles | undefined {
  const contacts = resolveCorridorShaftDoorContacts(
    corridor,
    sx,
    sy,
    sz,
    kind,
    punches,
  );
  if (contacts.length === 0) return undefined;

  const out: CorridorShellWallHoles = { e: [], w: [], n: [], s: [] };
  for (const c of contacts) {
    const cw = c.corridorWall;
    if (c.holeAlongZ) {
      (out[cw] as WallHoleYZ[]).push({
        z0: c.z0r,
        z1: c.z1r,
        y0: c.y0r,
        y1: c.y1r,
      });
    } else {
      (out[cw] as WallHoleXY[]).push({
        x0: c.x0r,
        x1: c.x1r,
        y0: c.y0r,
        y1: c.y1r,
      });
    }
  }

  return out;
}

function mergeCorridorShellWallHoles(
  a: CorridorShellWallHoles | undefined,
  b: CorridorShellWallHoles | undefined,
): CorridorShellWallHoles | undefined {
  if (!a && !b) return undefined;
  const out: CorridorShellWallHoles = {
    e: [...(a?.e ?? []), ...(b?.e ?? [])],
    w: [...(a?.w ?? []), ...(b?.w ?? [])],
    n: [...(a?.n ?? []), ...(b?.n ?? [])],
    s: [...(a?.s ?? []), ...(b?.s ?? [])],
  };
  const n = out.e.length + out.w.length + out.n.length + out.s.length;
  return n > 0 ? out : undefined;
}

function entryDoorYRangeForShell(sy: number): { yDoor0: number; yDoor1: number } {
  const wt = 0.11;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;
  const yDoor0 = yLo + UNIT_ENTRY_DOOR_SILL;
  const yDoor1 = Math.min(yHi - 0.05, yDoor0 + UNIT_ENTRY_DOOR_H);
  return { yDoor0, yDoor1 };
}

/**
 * Half-width along wall tangent for a door centred in `[t0,t1]` (world-line overlap).
 */
function entryDoorTangentHalfFromOverlap(t0: number, t1: number): number | undefined {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const span = hi - lo;
  if (span < 0.34) return undefined;
  const avail = span * 0.5 - 0.08;
  if (avail < 0.22) return undefined;
  return Math.min(UNIT_ENTRY_DOOR_W * 0.5, avail);
}

/**
 * Door cut on the **unit** wall shared with a corridor / lobby volume.
 */
function unitEntryWallHolesFromFloorAdjacency(
  unit: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  floor: FloorDoc,
): CorridorShellWallHoles | undefined {
  if (kind !== "unit") return undefined;
  const corridors = collectCorridorOrLobbyFootprintsFromFloor(floor);
  if (corridors.length === 0) return undefined;

  const upx = unit.position[0];
  const upz = unit.position[2];
  const uhx = sx * 0.5;
  const uhz = sz * 0.5;
  const ux0 = upx - uhx;
  const ux1 = upx + uhx;
  const uz0 = upz - uhz;
  const uz1 = upz + uhz;

  const wt = 0.11;
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const zMin = -vlenZ * 0.5 + 0.05;
  const zMax = vlenZ * 0.5 - 0.05;
  const xMin = -vlenX * 0.5 + 0.05;
  const xMax = vlenX * 0.5 - 0.05;

  const { yDoor0, yDoor1 } = entryDoorYRangeForShell(sy);
  if (yDoor1 < yDoor0 + 0.4) return undefined;

  type Cand = { face: CardinalFace; span: number; tMid: number };
  let best: Cand | null = null;

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

  if (!best) return undefined;
  const half = entryDoorTangentHalfFromOverlap(
    best.tMid - best.span * 0.5,
    best.tMid + best.span * 0.5,
  );
  if (half == null) return undefined;

  const out: CorridorShellWallHoles = { e: [], w: [], n: [], s: [] };
  if (best.face === "e" || best.face === "w") {
    const zMidLocal = best.tMid - upz;
    let z0r = zMidLocal - half;
    let z1r = zMidLocal + half;
    z0r = Math.max(zMin, Math.min(z0r, zMax - 0.28));
    z1r = Math.min(zMax, Math.max(z1r, zMin + 0.28));
    if (z1r < z0r + 0.28) return undefined;
    (out[best.face] as WallHoleYZ[]).push({
      z0: z0r,
      z1: z1r,
      y0: yDoor0,
      y1: yDoor1,
    });
  } else {
    const xMidLocal = best.tMid - upx;
    let x0r = xMidLocal - half;
    let x1r = xMidLocal + half;
    x0r = Math.max(xMin, Math.min(x0r, xMax - 0.28));
    x1r = Math.min(xMax, Math.max(x1r, xMin + 0.28));
    if (x1r < x0r + 0.28) return undefined;
    (out[best.face] as WallHoleXY[]).push({
      x0: x0r,
      x1: x1r,
      y0: yDoor0,
      y1: yDoor1,
    });
  }
  return out;
}

/**
 * Matching door cuts on the **corridor** shell for every adjacent apartment unit.
 */
function corridorShellHolesFromAdjacentUnitEntries(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  floor: FloorDoc,
): CorridorShellWallHoles | undefined {
  const cpx = corridor.position[0];
  const cpz = corridor.position[2];
  const chx = sx * 0.5;
  const chz = sz * 0.5;
  const cx0 = cpx - chx;
  const cx1 = cpx + chx;
  const cz0 = cpz - chz;
  const cz1 = cpz + chz;

  const wt = 0.11;
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const zMin = -vlenZ * 0.5 + 0.05;
  const zMax = vlenZ * 0.5 - 0.05;
  const xMin = -vlenX * 0.5 + 0.05;
  const xMax = vlenX * 0.5 - 0.05;

  const { yDoor0, yDoor1 } = entryDoorYRangeForShell(sy);
  if (yDoor1 < yDoor0 + 0.4) return undefined;

  const out: CorridorShellWallHoles = { e: [], w: [], n: [], s: [] };

  for (const o of floor.objects) {
    if (classifyPrefab(o.prefabId) !== "unit") continue;
    const usx = o.scale?.[0] ?? 1;
    const usz = o.scale?.[2] ?? 1;
    const upx = o.position[0];
    const upz = o.position[2];
    const uhx = usx * 0.5;
    const uhz = usz * 0.5;
    const ux0 = upx - uhx;
    const ux1 = upx + uhx;
    const uz0 = upz - uhz;
    const uz1 = upz + uhz;

    if (Math.abs(cx1 - ux0) < UNIT_CORRIDOR_TOUCH_M && upx > cpx - 0.02) {
      const z0 = Math.max(uz0, cz0);
      const z1 = Math.min(uz1, cz1);
      const half = entryDoorTangentHalfFromOverlap(z0, z1);
      if (half == null) continue;
      const zMid = (z0 + z1) * 0.5;
      const zMidLocal = zMid - cpz;
      let z0r = zMidLocal - half;
      let z1r = zMidLocal + half;
      z0r = Math.max(zMin, Math.min(z0r, zMax - 0.28));
      z1r = Math.min(zMax, Math.max(z1r, zMin + 0.28));
      if (z1r < z0r + 0.28) continue;
      out.e.push({ z0: z0r, z1: z1r, y0: yDoor0, y1: yDoor1 });
    }
    if (Math.abs(cx0 - ux1) < UNIT_CORRIDOR_TOUCH_M && upx < cpx + 0.02) {
      const z0 = Math.max(uz0, cz0);
      const z1 = Math.min(uz1, cz1);
      const half = entryDoorTangentHalfFromOverlap(z0, z1);
      if (half == null) continue;
      const zMid = (z0 + z1) * 0.5;
      const zMidLocal = zMid - cpz;
      let z0r = zMidLocal - half;
      let z1r = zMidLocal + half;
      z0r = Math.max(zMin, Math.min(z0r, zMax - 0.28));
      z1r = Math.min(zMax, Math.max(z1r, zMin + 0.28));
      if (z1r < z0r + 0.28) continue;
      out.w.push({ z0: z0r, z1: z1r, y0: yDoor0, y1: yDoor1 });
    }
    if (Math.abs(cz1 - uz0) < UNIT_CORRIDOR_TOUCH_M && upz > cpz - 0.02) {
      const x0 = Math.max(ux0, cx0);
      const x1 = Math.min(ux1, cx1);
      const half = entryDoorTangentHalfFromOverlap(x0, x1);
      if (half == null) continue;
      const xMid = (x0 + x1) * 0.5;
      const xMidLocal = xMid - cpx;
      let x0r = xMidLocal - half;
      let x1r = xMidLocal + half;
      x0r = Math.max(xMin, Math.min(x0r, xMax - 0.28));
      x1r = Math.min(xMax, Math.max(x1r, xMin + 0.28));
      if (x1r < x0r + 0.28) continue;
      out.n.push({ x0: x0r, x1: x1r, y0: yDoor0, y1: yDoor1 });
    }
    if (Math.abs(cz0 - uz1) < UNIT_CORRIDOR_TOUCH_M && upz < cpz + 0.02) {
      const x0 = Math.max(ux0, cx0);
      const x1 = Math.min(ux1, cx1);
      const half = entryDoorTangentHalfFromOverlap(x0, x1);
      if (half == null) continue;
      const xMid = (x0 + x1) * 0.5;
      const xMidLocal = xMid - cpx;
      let x0r = xMidLocal - half;
      let x1r = xMidLocal + half;
      x0r = Math.max(xMin, Math.min(x0r, xMax - 0.28));
      x1r = Math.min(xMax, Math.max(x1r, xMin + 0.28));
      if (x1r < x0r + 0.28) continue;
      out.s.push({ x0: x0r, x1: x1r, y0: yDoor0, y1: yDoor1 });
    }
  }

  const n = out.e.length + out.w.length + out.n.length + out.s.length;
  return n > 0 ? out : undefined;
}

function elevatorCorridorSignPlacementsFromPunches(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  elevatorPunches: readonly PlateStairCorridorDoorPunch[],
): ElevatorCorridorSignPlacement[] {
  const contacts = resolveCorridorShaftDoorContacts(
    corridor,
    sx,
    sy,
    sz,
    "corridor",
    elevatorPunches,
  );
  const out: ElevatorCorridorSignPlacement[] = [];
  for (const c of contacts) {
    if (!c.punch.isElevator) continue;
    out.push({
      corridorWall: c.corridorWall,
      yDoorTop: Math.max(c.y0r, c.y1r),
      zMid: (c.z0r + c.z1r) * 0.5,
      xMid: (c.x0r + c.x1r) * 0.5,
    });
  }
  return out;
}

const KONCAR_SIGN_W = 1.32;
const KONCAR_SIGN_H = 1.32 * (256 / 896);
const KONCAR_SIGN_SUBTITLE = "KONČAR 300kg 4 👤";

function createKoncarElevatorSignMaterial(): THREE.MeshBasicMaterial | null {
  const cw = 896;
  const ch = 256;
  let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    canvas = c;
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(cw, ch);
  }
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx || !("fillRect" in ctx)) return null;

  ctx.fillStyle = "#f2f0ec";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#2a2826";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = "#1a1918";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font =
    '700 78px system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText("ELEVATOR", canvas.width * 0.5, canvas.height * 0.36);
  ctx.font =
    '500 34px system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(KONCAR_SIGN_SUBTITLE, canvas.width * 0.5, canvas.height * 0.7);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

function addKoncarElevatorSignMeshes(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  placements: readonly ElevatorCorridorSignPlacement[],
): void {
  if (placements.length === 0) return;
  const mat = createKoncarElevatorSignMaterial();
  if (!mat) return;

  const wt = 0.11;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const geo = new THREE.PlaneGeometry(KONCAR_SIGN_W, KONCAR_SIGN_H);
  const inset = 0.014;
  const lookDepth = 2.5;

  let i = 0;
  for (const pl of placements) {
    const y = pl.yDoorTop + 0.07 + KONCAR_SIGN_H * 0.5;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `elevator_sign_koncar_${i++}`;

    if (pl.corridorWall === "e") {
      const x = hx - wt - inset;
      mesh.position.set(x, y, pl.zMid);
      mesh.lookAt(x - lookDepth, y, pl.zMid);
    } else if (pl.corridorWall === "w") {
      const x = -hx + wt + inset;
      mesh.position.set(x, y, pl.zMid);
      mesh.lookAt(x + lookDepth, y, pl.zMid);
    } else if (pl.corridorWall === "n") {
      const z = hz - wt - inset;
      mesh.position.set(pl.xMid, y, z);
      mesh.lookAt(pl.xMid, y, z - lookDepth);
    } else {
      const z = -hz + wt + inset;
      mesh.position.set(pl.xMid, y, z);
      mesh.lookAt(pl.xMid, y, z + lookDepth);
    }
    group.add(mesh);
  }
}

function addShellFloorCeilingPieces(
  group: THREE.Group,
  rects: readonly RectXZ[],
  wt: number,
  hy: number,
  floorM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
): void {
  let fi = 0;
  let ci = 0;
  for (const r of rects) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) * 0.5;
    const cz = (r.z0 + r.z1) * 0.5;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, wt, d), floorM);
    floor.name = rects.length > 1 ? `shell_floor_${fi}` : "shell_floor";
    fi += 1;
    floor.position.set(cx, -hy + wt * 0.5, cz);
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, wt, d), ceilM);
    ceiling.name = rects.length > 1 ? `shell_ceiling_${ci}` : "shell_ceiling";
    ci += 1;
    ceiling.position.set(cx, hy - wt * 0.5, cz);
    group.add(ceiling);
  }
}

function addResidenceEntryDoorFrameTrimsForUnit(
  group: THREE.Group,
  hx: number,
  hz: number,
  wt: number,
  cw: CorridorShellWallHoles,
  frameM: THREE.MeshStandardMaterial,
): void {
  let fe = 0;
  for (const h of cw.e) {
    const z0 = Math.min(h.z0, h.z1);
    const z1 = Math.max(h.z0, h.z1);
    const y0 = Math.min(h.y0, h.y1);
    const y1 = Math.max(h.y0, h.y1);
    addDoorFrameTrimConstantX(
      group,
      frameM,
      hx - wt,
      -1,
      z0,
      z1,
      y0,
      y1,
      `unit_entry_frame_e_${fe++}`,
    );
  }
  let fw = 0;
  for (const h of cw.w) {
    const z0 = Math.min(h.z0, h.z1);
    const z1 = Math.max(h.z0, h.z1);
    const y0 = Math.min(h.y0, h.y1);
    const y1 = Math.max(h.y0, h.y1);
    addDoorFrameTrimConstantX(
      group,
      frameM,
      -hx + wt,
      1,
      z0,
      z1,
      y0,
      y1,
      `unit_entry_frame_w_${fw++}`,
    );
  }
  let fn = 0;
  for (const h of cw.n) {
    const x0 = Math.min(h.x0, h.x1);
    const x1 = Math.max(h.x0, h.x1);
    const y0 = Math.min(h.y0, h.y1);
    const y1 = Math.max(h.y0, h.y1);
    addDoorFrameTrimConstantZ(
      group,
      frameM,
      hz - wt,
      -1,
      x0,
      x1,
      y0,
      y1,
      `unit_entry_frame_n_${fn++}`,
    );
  }
  let fs = 0;
  for (const h of cw.s) {
    const x0 = Math.min(h.x0, h.x1);
    const x1 = Math.max(h.x0, h.x1);
    const y0 = Math.min(h.y0, h.y1);
    const y1 = Math.max(h.y0, h.y1);
    addDoorFrameTrimConstantZ(
      group,
      frameM,
      -hz + wt,
      1,
      x0,
      x1,
      y0,
      y1,
      `unit_entry_frame_s_${fs++}`,
    );
  }
}

function lobbyDoorCentersAlong(usableSpan: number): number[] {
  if (usableSpan < LOBBY_DOUBLE_DOOR_W + 0.28) return [0];
  const n = Math.max(
    1,
    Math.min(4, Math.floor(usableSpan / LOBBY_DOUBLE_DOOR_BAY_SPACING)),
  );
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    out.push((t - 0.5) * usableSpan * 0.94);
  }
  return out;
}

/**
 * Hollow shell: floor + ceiling plates (with shaft cutouts when `opts` provided), four thin walls.
 * Same on every storey, including the ground floor perimeter.
 */
function addHollowRoomShell(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  opts: HollowShellOpts,
): void {
  /** Match shaft placeholder shells so adjacent stair/elev doors meet flush (was 0.12 vs 0.11). */
  const wt = 0.11;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const { floor: floorM, ceil: ceilM, wall: wallM } = matsFor(kind);
  const vh = Math.max(sy - 2 * wt, 0.05);
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);

  let rects: RectXZ[] = opts.skipShaftCutouts
    ? [{ x0: -hx, x1: hx, z0: -hz, z1: hz }]
    : hollowShellXZRectsWithShaftCutouts(sx, sz, opts.roomPx, opts.roomPz, opts.shaftHolesPlate);
  if (!opts.skipShaftCutouts && opts.shaftElevatorsMerged?.length) {
    rects = punchElevatorHolesInShellRects(
      rects,
      opts.roomPx,
      opts.roomPz,
      opts.shaftElevatorsMerged,
    );
  }
  addShellFloorCeilingPieces(group, rects, wt, hy, floorM, ceilM);

  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;
  const yDoor0 = yLo + LOBBY_DOOR_SILL;
  const yDoor1 = Math.min(yHi - 0.05, yDoor0 + LOBBY_DOUBLE_DOOR_H);
  const halfDoor = LOBBY_DOUBLE_DOOR_W * 0.5;

  const groundLobby =
    (opts.storyLevelIndex ?? 99) === 1 &&
    kind === "corridor" &&
    !opts.skipShaftCutouts;

  const cw = opts.corridorWallHoles;
  const stairHoleCount =
    (cw?.e?.length ?? 0) +
    (cw?.w?.length ?? 0) +
    (cw?.n?.length ?? 0) +
    (cw?.s?.length ?? 0);

  if (!groundLobby) {
    if (stairHoleCount === 0) {
      const east = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallM);
      east.name = "shell_wall_e";
      east.position.set(hx - wt * 0.5, 0, 0);
      group.add(east);

      const west = new THREE.Mesh(new THREE.BoxGeometry(wt, vh, vlenZ), wallM);
      west.name = "shell_wall_w";
      west.position.set(-hx + wt * 0.5, 0, 0);
      group.add(west);

      const north = new THREE.Mesh(new THREE.BoxGeometry(vlenX, vh, wt), wallM);
      north.name = "shell_wall_n";
      north.position.set(0, 0, hz - wt * 0.5);
      group.add(north);

      const south = new THREE.Mesh(new THREE.BoxGeometry(vlenX, vh, wt), wallM);
      south.name = "shell_wall_s";
      south.position.set(0, 0, -hz + wt * 0.5);
      group.add(south);
      return;
    }

    const zMin = -vlenZ * 0.5;
    const zMax = vlenZ * 0.5;
    const xMin = -vlenX * 0.5;
    const xMax = vlenX * 0.5;
    const xE = hx - wt * 0.5;
    const xW = -hx + wt * 0.5;
    const zN = hz - wt * 0.5;
    const zS = -hz + wt * 0.5;

    addWallConstantXWithHoles(
      group,
      wallM,
      xE,
      wt,
      zMin,
      zMax,
      yLo,
      yHi,
      cw?.e ?? [],
      "shell_wall_e",
    );
    addWallConstantXWithHoles(
      group,
      wallM,
      xW,
      wt,
      zMin,
      zMax,
      yLo,
      yHi,
      cw?.w ?? [],
      "shell_wall_w",
    );
    addWallConstantZWithHoles(
      group,
      wallM,
      zN,
      wt,
      xMin,
      xMax,
      yLo,
      yHi,
      cw?.n ?? [],
      "shell_wall_n",
    );
    addWallConstantZWithHoles(
      group,
      wallM,
      zS,
      wt,
      xMin,
      xMax,
      yLo,
      yHi,
      cw?.s ?? [],
      "shell_wall_s",
    );
    if (kind === "unit" && cw) {
      addResidenceEntryDoorFrameTrimsForUnit(
        group,
        hx,
        hz,
        wt,
        cw,
        mat.lobbyDoorFrame,
      );
    }
    addKoncarElevatorSignMeshes(
      group,
      sx,
      sy,
      sz,
      opts.elevatorSignPlacements ?? [],
    );
    addOppositeCorridorKatSignMeshes(
      group,
      sx,
      sy,
      sz,
      opts.storyLevelIndex ?? 99,
      opts.elevatorSignPlacements ?? [],
    );
    return;
  }

  const usableZ = vlenZ - 0.14;
  const usableX = vlenX - 0.14;
  const czList = lobbyDoorCentersAlong(usableZ);
  const cxList = lobbyDoorCentersAlong(usableX);

  const lobbyHolesEw: WallHoleYZ[] = czList.map((zc) => ({
    z0: zc - halfDoor,
    z1: zc + halfDoor,
    y0: yDoor0,
    y1: yDoor1,
  }));
  const lobbyHolesNs: WallHoleXY[] = cxList.map((xc) => ({
    x0: xc - halfDoor,
    x1: xc + halfDoor,
    y0: yDoor0,
    y1: yDoor1,
  }));

  const holesWallE: WallHoleYZ[] = [...lobbyHolesEw, ...(cw?.e ?? [])];
  const holesWallW: WallHoleYZ[] = [...lobbyHolesEw, ...(cw?.w ?? [])];
  const holesWallN: WallHoleXY[] = [...lobbyHolesNs, ...(cw?.n ?? [])];
  const holesWallS: WallHoleXY[] = [...lobbyHolesNs, ...(cw?.s ?? [])];

  const xE = hx - wt * 0.5;
  const xW = -hx + wt * 0.5;
  const zN = hz - wt * 0.5;
  const zS = -hz + wt * 0.5;
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;

  addWallConstantXWithHoles(
    group,
    wallM,
    xE,
    wt,
    zMin,
    zMax,
    yLo,
    yHi,
    holesWallE,
    "shell_wall_e",
  );
  addWallConstantXWithHoles(
    group,
    wallM,
    xW,
    wt,
    zMin,
    zMax,
    yLo,
    yHi,
    holesWallW,
    "shell_wall_w",
  );
  addWallConstantZWithHoles(
    group,
    wallM,
    zN,
    wt,
    xMin,
    xMax,
    yLo,
    yHi,
    holesWallN,
    "shell_wall_n",
  );
  addWallConstantZWithHoles(
    group,
    wallM,
    zS,
    wt,
    xMin,
    xMax,
    yLo,
    yHi,
    holesWallS,
    "shell_wall_s",
  );

  const frameM = mat.lobbyDoorFrame;
  let fi = 0;
  for (const zc of czList) {
    const z0 = zc - halfDoor;
    const z1 = zc + halfDoor;
    addDoorFrameTrimConstantX(
      group,
      frameM,
      hx - wt,
      -1,
      z0,
      z1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_e_${fi}`,
    );
    addDoorFrameTrimConstantX(
      group,
      frameM,
      -hx + wt,
      1,
      z0,
      z1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_w_${fi}`,
    );
    fi += 1;
  }
  let fj = 0;
  for (const xc of cxList) {
    const x0 = xc - halfDoor;
    const x1 = xc + halfDoor;
    addDoorFrameTrimConstantZ(
      group,
      frameM,
      hz - wt,
      -1,
      x0,
      x1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_n_${fj}`,
    );
    addDoorFrameTrimConstantZ(
      group,
      frameM,
      -hz + wt,
      1,
      x0,
      x1,
      yDoor0,
      yDoor1,
      `shell_lobby_frame_s_${fj}`,
    );
    fj += 1;
  }

  addKoncarElevatorSignMeshes(
    group,
    sx,
    sy,
    sz,
    opts.elevatorSignPlacements ?? [],
  );
  addOppositeCorridorKatSignMeshes(
    group,
    sx,
    sy,
    sz,
    opts.storyLevelIndex ?? 99,
    opts.elevatorSignPlacements ?? [],
  );
}

function expandBoxForPlacedObject(
  min: THREE.Vector3,
  max: THREE.Vector3,
  obj: PlacedObject,
): void {
  const [px, py, pz] = obj.position;
  const sx = obj.scale?.[0] ?? 1;
  const sy = obj.scale?.[1] ?? 1;
  const sz = obj.scale?.[2] ?? 1;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  min.x = Math.min(min.x, px - hx);
  min.y = Math.min(min.y, py - hy);
  min.z = Math.min(min.z, pz - hz);
  max.x = Math.max(max.x, px + hx);
  max.y = Math.max(max.y, py + hy);
  max.z = Math.max(max.z, pz + hz);
}

/**
 * Turns each `FloorDoc` volume into a hollow shell (floor + ceiling + four walls).
 */
export function buildFloorMeshes(
  doc: FloorDoc,
  opts?: BuildFloorMeshesOptions,
): THREE.Group {
  const floor = withoutElevatorsInStairwells(doc);
  const root = new THREE.Group();
  root.name = `floor:${floor.id}`;

  const shaftHolesPlate =
    opts?.shaftHolesPlateMerged ?? collectShaftSlabHoles(floor);
  const shaftElevatorsMerged =
    opts?.shaftElevatorsMerged ??
    mergeElevatorShaftSlabHolesFromFloorDocs([floor]);

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let hasBounds = false;

  let plateCx = 0;
  let plateCz = 0;
  let plateN = 0;
  for (const o of floor.objects) {
    plateCx += o.position[0];
    plateCz += o.position[2];
    plateN += 1;
  }
  if (plateN > 0) {
    plateCx /= plateN;
    plateCz /= plateN;
  }

  const story = opts?.storyLevelIndex ?? 99;
  const corridorFootprint = firstCorridorOrLobbyFromFloor(floor);

  const elevatorDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
  for (const o of floor.objects) {
    if (!o.prefabId.toLowerCase().includes("elevator")) continue;
    const ex = o.scale?.[0] ?? 1;
    const ey = o.scale?.[1] ?? 1;
    const ez = o.scale?.[2] ?? 1;
    const skE = shaftPlanKey(o.position[0], o.position[2]);
    const overrideFace = readElevatorDoorFaceOverride(o);
    const elevFace =
      opts?.elevatorDoorFaceByShaftKey?.get(skE) ??
      overrideFace ??
      elevatorDoorFaceFromFloorCorridors(
        o.position[0],
        o.position[2],
        floor,
        plateCx,
        plateCz,
      );
    const loc = elevatorGroundDoorOpeningLocals(ex, ey, ez, elevFace, 0);
    elevatorDoorPunchesPlate.push({
      stairFace: loc.face,
      tangentLocal: loc.tangentOffsetAlongWall,
      doorHalfW: loc.doorHalfW,
      y0Local: loc.y0Local,
      y1Local: loc.y1Local,
      spx: o.position[0],
      spz: o.position[2],
      spy: o.position[1],
      shx: ex * 0.5,
      shz: ez * 0.5,
      isElevator: true,
    });
  }

  const corridorShaftDoorPunchesPlate: readonly PlateStairCorridorDoorPunch[] =
    elevatorDoorPunchesPlate;

  for (const obj of floor.objects) {
    expandBoxForPlacedObject(min, max, obj);
    hasBounds = true;

    const kind = classifyPrefab(obj.prefabId);
    const sx = obj.scale?.[0] ?? 1;
    const sy = obj.scale?.[1] ?? 1;
    const sz = obj.scale?.[2] ?? 1;

    const room = new THREE.Group();
    room.name = obj.id;
    room.userData.placedObjectId = obj.id;
    room.userData.floorDocId = floor.id;
    room.position.set(obj.position[0], obj.position[1], obj.position[2]);
    if (obj.rotation)
      room.quaternion.set(
        obj.rotation[0],
        obj.rotation[1],
        obj.rotation[2],
        obj.rotation[3] ?? 1,
      );

    const pid = obj.prefabId.toLowerCase();
    if (pid.includes("elevator")) {
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      const overrideFace = readElevatorDoorFaceOverride(obj);
      const doorFace =
        opts?.elevatorDoorFaceByShaftKey?.get(sk) ??
        overrideFace ??
        elevatorDoorFaceFromFloorCorridors(
          obj.position[0],
          obj.position[2],
          floor,
          plateCx,
          plateCz,
        );
      /** Pit slab only on ground plate; `99` = legacy default when no `storyLevelIndex` (single-plate). */
      const elevatorPitSlab = story === 1 || story === 99;
      const halfX = sx * 0.5;
      const halfZ = sz * 0.5;
      let elevFlush: number | undefined;
      if (corridorFootprint) {
        const g = corridorFlushGapForShaftDoor(
          doorFace,
          obj.position[0],
          obj.position[2],
          halfX,
          halfZ,
          corridorFootprint,
        );
        if (g > 1e-4) elevFlush = Math.min(0.35, g);
      }
      addElevatorShaftPlaceholder(room, sx, sy, sz, {
        groundDoor: { face: doorFace, bandHeightM: sy },
        includePitFloor: elevatorPitSlab,
        corridorFlushGapM: elevFlush,
      });
    } else if (pid.includes("stair_well") || pid.includes("stairwell")) {
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      if (!opts?.stairShaftSkipKeys?.has(sk)) {
        addStairWellPlaceholder(room, sx, sy, sz, {
          omitGroundStoreyCornerLandings: story === 1 || story === 99,
        });
      }
    } else {
      const skipShaftCutouts = Boolean(obj.rotation);
      const corridorWallHoles = skipShaftCutouts
        ? undefined
        : mergeCorridorShellWallHoles(
            mergeCorridorShellWallHoles(
              kind === "corridor"
                ? corridorShellHolesFromStairPunches(
                    obj,
                    sx,
                    sy,
                    sz,
                    kind,
                    corridorShaftDoorPunchesPlate,
                  )
                : undefined,
              kind === "corridor"
                ? corridorShellHolesFromAdjacentUnitEntries(
                    obj,
                    sx,
                    sy,
                    sz,
                    floor,
                  )
                : undefined,
            ),
            kind === "unit"
              ? unitEntryWallHolesFromFloorAdjacency(
                  obj,
                  sx,
                  sy,
                  sz,
                  kind,
                  floor,
                )
              : undefined,
          );
      const elevatorSignPlacements =
        kind === "corridor" && !skipShaftCutouts
          ? elevatorCorridorSignPlacementsFromPunches(
              obj,
              sx,
              sy,
              sz,
              elevatorDoorPunchesPlate,
            )
          : [];
      addHollowRoomShell(room, sx, sy, sz, kind, {
        shaftHolesPlate: shaftHolesPlate,
        roomPx: obj.position[0],
        roomPz: obj.position[2],
        skipShaftCutouts,
        storyLevelIndex: opts?.storyLevelIndex,
        shaftElevatorsMerged,
        corridorWallHoles,
        elevatorSignPlacements,
      });
    }
    root.add(room);
  }

  if (hasBounds) {
    addConcreteSlabWithOptionalShaftHoles(
      root,
      min,
      max,
      GROUND_SLAB_MARGIN_XZ,
      GROUND_SLAB_THICKNESS_M,
      shaftHolesPlate,
      mat.slab,
    );
    const plateWy = opts?.plateWorldOriginY ?? 0;
    if (story === 1 || story === 99) {
      addGroundFootprintGrassOccluder(root, min, max, plateWy, mat.slab);
    }
  }

  return root;
}

import * as THREE from "three";
import type { BuildingDoc, FloorDoc, PlacedObject, StairWellDef } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import {
  getBuildingStairShaftSpecs,
  shaftPlanKey,
  STOREY_SPACING_M,
} from "./buildingStairShafts.js";
import {
  addElevatorShaftPlaceholder,
  addStairWellPlaceholder,
  elevatorGroundDoorOpeningLocals,
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
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
  shaftDoorTowardPointFromFloorCorridors,
} from "./shaftCorridorFlush.js";
import {
  readElevatorDoorFaceOverride,
  type BuildFloorMeshesOptions,
} from "./elevatorDoorFacesFromGroundFloorDoc.js";
import { shortFloorLabelForRef } from "./buildingFloorLabels.js";
import { addOppositeCorridorKatSignMeshes } from "./elevatorLandingKatSign.js";
import type { CollisionAabb } from "./collisionScene.js";

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

import {
  entryDoorShellCarveYRangeForShell,
  entryDoorTangentHalfFromOverlap,
  entryDoorYRangeForShell,
  UNIT_CORRIDOR_TOUCH_M,
  UNIT_ENTRY_DOOR_W,
} from "./unitEntryAdjacency.js";
import { manualCorridorShellHoleExtrasForFloor } from "./manualApartmentDoorExtras.js";

function matsFor(kind: PlaceholderKind): {
  floor: THREE.MeshStandardMaterial;
  ceil: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  exteriorWall: THREE.MeshStandardMaterial;
} {
  switch (kind) {
    case "corridor":
      return {
        floor: mat.corridorFloor,
        ceil: mat.corridorCeil,
        wall: mat.corridorWall,
        exteriorWall: mat.corridorExteriorWall,
      };
    case "unit":
      return {
        floor: mat.unitFloor,
        ceil: mat.unitCeil,
        wall: mat.unitWall,
        exteriorWall: mat.unitExteriorWall,
      };
    case "core":
      return {
        floor: mat.coreFloor,
        ceil: mat.coreCeil,
        wall: mat.coreWall,
        exteriorWall: mat.coreExteriorWall,
      };
    default:
      return {
        floor: mat.miscFloor,
        ceil: mat.miscCeil,
        wall: mat.miscWall,
        exteriorWall: mat.miscExteriorWall,
      };
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
  /** Optional authored compact floor label for landing signs, e.g. `PR`, `1`, `19`. */
  storyShortLabel?: string;
  /** Elevator-only union (plate-space); second cut on shell floor/ceiling so flanking plates do not cap hoistways. */
  shaftElevatorsMerged?: readonly ShaftSlabHole[];
  /** Cuts through corridor walls opposite elevator doors (room-local). */
  corridorWallHoles?: CorridorShellWallHoles;
  /** Elevator door heads on this corridor shell — room-local; used for manufacturer signage. */
  elevatorSignPlacements?: readonly ElevatorCorridorSignPlacement[];
  /** Perimeter faces that sit on the building exterior and should receive facade cladding. */
  exteriorFaces?: readonly CardinalFace[];
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

function normalizeCorridorStairDoorVerticalSpan(
  yMin: number,
  yMax: number,
  rawY0: number,
  rawY1: number,
): { y0: number; y1: number } {
  let y0 = Math.max(yMin, Math.min(rawY0, rawY1));
  let y1 = Math.min(yMax, Math.max(rawY0, rawY1));
  if (y1 < y0 + 0.52) {
    const mid = (y0 + y1) * 0.5;
    y0 = Math.max(yMin, mid - 0.28);
    y1 = Math.min(yMax, mid + 0.28);
  }
  if (y0 > yMin) {
    const shiftDown = y0 - yMin;
    y0 = yMin;
    y1 = Math.max(y0 + 0.52, Math.min(yMax, y1 - shiftDown));
  }
  return { y0, y1 };
}

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
    let { y0: y0r, y1: y1r } = normalizeCorridorStairDoorVerticalSpan(
      yLo,
      yHi - 0.008,
      y0w,
      y1w,
    );

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
  const { yDoor0: yHole0, yDoor1: yHole1 } = entryDoorShellCarveYRangeForShell(sy);

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
      y0: yHole0,
      y1: yHole1,
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
      y0: yHole0,
      y1: yHole1,
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
  const { yDoor0: yHole0, yDoor1: yHole1 } = entryDoorShellCarveYRangeForShell(sy);

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
      out.e.push({ z0: z0r, z1: z1r, y0: yHole0, y1: yHole1 });
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
      out.w.push({ z0: z0r, z1: z1r, y0: yHole0, y1: yHole1 });
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
      out.n.push({ x0: x0r, x1: x1r, y0: yHole0, y1: yHole1 });
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
      out.s.push({ x0: x0r, x1: x1r, y0: yHole0, y1: yHole1 });
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

function markNewChildrenNoCollision(group: THREE.Group, startIdx: number): void {
  for (let i = startIdx; i < group.children.length; i++) {
    group.children[i]!.userData.mammothNoCollision = true;
  }
}

function addExteriorWallCladding(
  group: THREE.Group,
  hx: number,
  hz: number,
  vlenX: number,
  vlenZ: number,
  yLo: number,
  yHi: number,
  faces: readonly CardinalFace[],
  exteriorWallM: THREE.MeshStandardMaterial,
  holes?: Partial<Record<CardinalFace, readonly WallHoleYZ[] | readonly WallHoleXY[]>>,
): void {
  if (faces.length === 0) return;
  const cladT = 0.035;
  const zMin = -vlenZ * 0.5;
  const zMax = vlenZ * 0.5;
  const xMin = -vlenX * 0.5;
  const xMax = vlenX * 0.5;
  for (const face of faces) {
    if (face === "e") {
      const startIdx = group.children.length;
      addWallConstantXWithHoles(
        group,
        exteriorWallM,
        hx + cladT * 0.5,
        cladT,
        zMin,
        zMax,
        yLo,
        yHi,
        (holes?.e as readonly WallHoleYZ[] | undefined) ?? [],
        "shell_exterior_cladding_e",
      );
      markNewChildrenNoCollision(group, startIdx);
    } else if (face === "w") {
      const startIdx = group.children.length;
      addWallConstantXWithHoles(
        group,
        exteriorWallM,
        -hx - cladT * 0.5,
        cladT,
        zMin,
        zMax,
        yLo,
        yHi,
        (holes?.w as readonly WallHoleYZ[] | undefined) ?? [],
        "shell_exterior_cladding_w",
      );
      markNewChildrenNoCollision(group, startIdx);
    } else if (face === "n") {
      const startIdx = group.children.length;
      addWallConstantZWithHoles(
        group,
        exteriorWallM,
        hz + cladT * 0.5,
        cladT,
        xMin,
        xMax,
        yLo,
        yHi,
        (holes?.n as readonly WallHoleXY[] | undefined) ?? [],
        "shell_exterior_cladding_n",
      );
      markNewChildrenNoCollision(group, startIdx);
    } else {
      const startIdx = group.children.length;
      addWallConstantZWithHoles(
        group,
        exteriorWallM,
        -hz - cladT * 0.5,
        cladT,
        xMin,
        xMax,
        yLo,
        yHi,
        (holes?.s as readonly WallHoleXY[] | undefined) ?? [],
        "shell_exterior_cladding_s",
      );
      markNewChildrenNoCollision(group, startIdx);
    }
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
  const { floor: floorM, ceil: ceilM, wall: wallM, exteriorWall: exteriorWallM } = matsFor(kind);
  const exteriorFaces = opts.exteriorFaces ?? [];
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
      addExteriorWallCladding(
        group,
        hx,
        hz,
        vlenX,
        vlenZ,
        yLo,
        yHi,
        exteriorFaces,
        exteriorWallM,
      );
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
    addExteriorWallCladding(group, hx, hz, vlenX, vlenZ, yLo, yHi, exteriorFaces, exteriorWallM, {
      e: cw?.e,
      w: cw?.w,
      n: cw?.n,
      s: cw?.s,
    });
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
      opts.storyShortLabel,
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
  addExteriorWallCladding(group, hx, hz, vlenX, vlenZ, yLo, yHi, exteriorFaces, exteriorWallM, {
    e: holesWallE,
    w: holesWallW,
    n: holesWallN,
    s: holesWallS,
  });

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
    opts.storyShortLabel,
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
  for (const obj of floor.objects) {
    expandBoxForPlacedObject(min, max, obj);
    hasBounds = true;
  }

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
  const exteriorFaceTol = 0.16;

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

  const stairDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
  const stairAuthoringScope = story === 1 || story === 99 ? "ground" : "typical";
  for (const o of floor.objects) {
    if (!o.prefabId.toLowerCase().includes("stair_well") && !o.prefabId.toLowerCase().includes("stairwell")) {
      continue;
    }
    const sx = o.scale?.[0] ?? 1;
    const sy = o.scale?.[1] ?? 1;
    const sz = o.scale?.[2] ?? 1;
    const towardPlateXZ = shaftDoorTowardPointFromFloorCorridors(
      o.position[0],
      o.position[2],
      floor,
      plateCx,
      plateCz,
    );
    const resolved = resolveStairWellGroundDoor({
      sx,
      sy,
      sz,
      def: opts?.stairWellDef,
      authoringScope: stairAuthoringScope,
      context: {
        towardPlateXZ,
        shaftPlateXZ: [o.position[0], o.position[2]],
      },
    });
    if (!resolved) continue;
    const doors = [
      resolved,
      ...resolveStairWellSupplementalDoors({
        sx,
        sy,
        sz,
        def: opts?.stairWellDef,
        authoringScope: stairAuthoringScope,
        context: {
          towardPlateXZ,
          shaftPlateXZ: [o.position[0], o.position[2]],
        },
        primaryDoor: resolved,
      }),
    ];
    for (const door of doors) {
      stairDoorPunchesPlate.push({
        stairFace: door.groundDoor.face ?? "e",
        tangentLocal: door.groundDoor.tangentOffsetAlongWall ?? 0,
        doorHalfW: door.doorHalfW,
        y0Local: door.y0Local,
        y1Local: door.y1Local,
        spx: o.position[0],
        spz: o.position[2],
        spy: o.position[1],
        shx: sx * 0.5,
        shz: sz * 0.5,
      });
    }
  }

  const corridorShaftDoorPunchesPlate: readonly PlateStairCorridorDoorPunch[] = [
    ...elevatorDoorPunchesPlate,
    ...stairDoorPunchesPlate,
  ];

  for (const obj of floor.objects) {
    const kind = classifyPrefab(obj.prefabId);
    const sx = obj.scale?.[0] ?? 1;
    const sy = obj.scale?.[1] ?? 1;
    const sz = obj.scale?.[2] ?? 1;
    const roomExteriorFaces: CardinalFace[] = [];
    if (hasBounds && !obj.rotation) {
      const hx = sx * 0.5;
      const hz = sz * 0.5;
      const x0 = obj.position[0] - hx;
      const x1 = obj.position[0] + hx;
      const z0 = obj.position[2] - hz;
      const z1 = obj.position[2] + hz;
      if (x1 >= max.x - exteriorFaceTol) roomExteriorFaces.push("e");
      if (x0 <= min.x + exteriorFaceTol) roomExteriorFaces.push("w");
      if (z1 >= max.z - exteriorFaceTol) roomExteriorFaces.push("n");
      if (z0 <= min.z + exteriorFaceTol) roomExteriorFaces.push("s");
    }

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
        const stairDoorContext = {
          towardPlateXZ: shaftDoorTowardPointFromFloorCorridors(
            obj.position[0],
            obj.position[2],
            floor,
            plateCx,
            plateCz,
          ),
          shaftPlateXZ: [obj.position[0], obj.position[2]] as const,
        };
        const resolvedDoor = resolveStairWellGroundDoor({
          sx,
          sy,
          sz,
          context: stairDoorContext,
          def: opts?.stairWellDef,
          authoringScope: story === 1 || story === 99 ? "ground" : "typical",
        });
        const resolvedGroundDoor = resolvedDoor?.groundDoor;
        const supplementalDoors = resolveStairWellSupplementalDoors({
          sx,
          sy,
          sz,
          context: stairDoorContext,
          def: opts?.stairWellDef,
          authoringScope: story === 1 || story === 99 ? "ground" : "typical",
          primaryDoor: resolvedDoor,
        });
        addStairWellPlaceholder(room, sx, sy, sz, {
          omitGroundStoreyCornerLandings: story === 1 || story === 99,
          def: opts?.stairWellDef,
          authoringScope: story === 1 || story === 99 ? "ground" : "typical",
          groundDoor: resolvedGroundDoor,
          supplementalDoors,
        });
      }
    } else {
      const skipShaftCutouts = Boolean(obj.rotation);
      const corridorWallHoles = skipShaftCutouts
        ? undefined
        : mergeCorridorShellWallHoles(
            mergeCorridorShellWallHoles(
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
              kind === "corridor"
                ? manualCorridorShellHoleExtrasForFloor(floor, obj, sx, sy, sz)
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
        storyShortLabel: opts?.storyShortLabel,
        shaftElevatorsMerged,
        corridorWallHoles,
        elevatorSignPlacements,
        exteriorFaces: roomExteriorFaces,
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

export type StairOpeningCollisionOverlay = {
  suppressMasks: readonly CollisionAabb[];
  replacementBlockers: readonly CollisionAabb[];
};

function collectNamedBoxCollisionAabbs(
  root: THREE.Object3D,
  namePrefixes: readonly string[],
): CollisionAabb[] {
  const out: CollisionAabb[] = [];
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!(obj.geometry instanceof THREE.BoxGeometry)) return;
    if (!namePrefixes.some((prefix) => obj.name.startsWith(prefix))) return;
    if (obj.geometry.boundingBox == null) obj.geometry.computeBoundingBox();
    const bb = obj.geometry.boundingBox;
    if (!bb) return;
    box.copy(bb).applyMatrix4(obj.matrixWorld);
    out.push({
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    });
  });
  return out;
}

function wallPrefixesForFaces(baseName: "shaft_wall" | "shell_wall", faces: Iterable<CardinalFace>): string[] {
  return [...new Set([...faces])].map((face) => `${baseName}_${face}`);
}

function buildShaftWallMask(
  worldX: number,
  worldY: number,
  worldZ: number,
  sx: number,
  sy: number,
  sz: number,
  face: CardinalFace,
): CollisionAabb {
  const wt = 0.11;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const y0 = worldY + (-hy + wt);
  const y1 = y0 + innerWallH;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  if (face === "e") {
    return {
      min: [worldX + hx - wt, y0, worldZ - vlenZ * 0.5],
      max: [worldX + hx, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "w") {
    return {
      min: [worldX - hx, y0, worldZ - vlenZ * 0.5],
      max: [worldX - hx + wt, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "n") {
    return {
      min: [worldX - vlenX * 0.5, y0, worldZ + hz - wt],
      max: [worldX + vlenX * 0.5, y1, worldZ + hz],
    };
  }
  return {
    min: [worldX - vlenX * 0.5, y0, worldZ - hz],
    max: [worldX + vlenX * 0.5, y1, worldZ - hz + wt],
  };
}

function buildCorridorWallMask(
  worldX: number,
  worldY: number,
  worldZ: number,
  sx: number,
  sy: number,
  sz: number,
  face: CardinalFace,
): CollisionAabb {
  const wt = 0.11;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const y0 = worldY - vh * 0.5;
  const y1 = worldY + vh * 0.5;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  if (face === "e") {
    return {
      min: [worldX + hx - wt, y0, worldZ - vlenZ * 0.5],
      max: [worldX + hx, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "w") {
    return {
      min: [worldX - hx, y0, worldZ - vlenZ * 0.5],
      max: [worldX - hx + wt, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "n") {
    return {
      min: [worldX - vlenX * 0.5, y0, worldZ + hz - wt],
      max: [worldX + vlenX * 0.5, y1, worldZ + hz],
    };
  }
  return {
    min: [worldX - vlenX * 0.5, y0, worldZ - hz],
    max: [worldX + vlenX * 0.5, y1, worldZ - hz + wt],
  };
}

export function stairOpeningAabbOverlaps(
  a: CollisionAabb,
  b: CollisionAabb,
): boolean {
  return !(
    a.max[0] <= b.min[0] ||
    a.min[0] >= b.max[0] ||
    a.max[1] <= b.min[1] ||
    a.min[1] >= b.max[1] ||
    a.max[2] <= b.min[2] ||
    a.min[2] >= b.max[2]
  );
}

export function applyStairOpeningCollisionOverlay(
  base: readonly CollisionAabb[],
  overlay: StairOpeningCollisionOverlay,
): CollisionAabb[] {
  const kept = base.filter(
    (aabb) => !overlay.suppressMasks.some((mask) => stairOpeningAabbOverlaps(aabb, mask)),
  );
  return [...kept, ...overlay.replacementBlockers];
}

export function buildStairOpeningCollisionOverlayForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  stairWellDef: StairWellDef | undefined,
  floorSpacingM: number,
): StairOpeningCollisionOverlay {
  const suppressMasks: CollisionAabb[] = [];
  const replacementBlockers: CollisionAabb[] = [];
  const worldOrigin = building.worldOrigin ?? [0, 0, 0];
  const sorted = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const stairShaftSpecs = getBuildingStairShaftSpecs(building, getFloorDoc, sorted, floorSpacingM);

  for (const spec of stairShaftSpecs) {
    for (let i = 0; i < spec.storeyCount; i++) {
      const isTopStorey = i === spec.storeyCount - 1;
      const authoringScope = i === 0 ? "ground" : "typical";
      const resolvedDoor = resolveStairWellGroundDoor({
        sx: spec.sx,
        sy: spec.syPlate,
        sz: spec.sz,
        context: spec.entryDoorContexts[i],
        def: stairWellDef,
        authoringScope,
      });
      const supplementalDoors = resolveStairWellSupplementalDoors({
        sx: spec.sx,
        sy: spec.syPlate,
        sz: spec.sz,
        context: spec.entryDoorContexts[i],
        def: stairWellDef,
        authoringScope,
        primaryDoor: resolvedDoor,
      });
      const affectedFaces = new Set<CardinalFace>();
      if (resolvedDoor) affectedFaces.add(resolvedDoor.face);
      for (const door of supplementalDoors) affectedFaces.add(door.face);
      if (affectedFaces.size === 0) continue;

      const segment = new THREE.Group();
      segment.position.set(
        worldOrigin[0] + spec.px,
        worldOrigin[1] + spec.bottomY + STOREY_SPACING_M * 0.5 + i * spec.storeySpacing,
        worldOrigin[2] + spec.pz,
      );
      addStairWellPlaceholder(segment, spec.sx, spec.syPlate, spec.sz, {
        omitGroundStoreyCornerLandings: i === 0,
        def: stairWellDef,
        authoringScope,
        groundDoor: resolvedDoor?.groundDoor,
        supplementalDoors,
        includeCeiling: isTopStorey,
        omitTreads: isTopStorey,
        omitTopLanding: isTopStorey,
      });
      replacementBlockers.push(
        ...collectNamedBoxCollisionAabbs(segment, wallPrefixesForFaces("shaft_wall", affectedFaces)),
      );
      for (const face of affectedFaces) {
        suppressMasks.push(
          buildShaftWallMask(
            segment.position.x,
            segment.position.y,
            segment.position.z,
            spec.sx,
            spec.syPlate,
            spec.sz,
            face,
          ),
        );
      }
    }
  }

  for (const ref of sorted) {
    const floor = withoutElevatorsInStairwells(getFloorDoc(ref.floorDocId));
    let plateCx = 0;
    let plateCz = 0;
    for (const obj of floor.objects) {
      plateCx += obj.position[0];
      plateCz += obj.position[2];
    }
    if (floor.objects.length > 0) {
      plateCx /= floor.objects.length;
      plateCz /= floor.objects.length;
    }
    const stairAuthoringScope = ref.levelIndex === 1 ? "ground" : "typical";
    const stairDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
    for (const obj of floor.objects) {
      const pid = obj.prefabId.toLowerCase();
      if (!pid.includes("stair_well") && !pid.includes("stairwell")) continue;
      const sx = obj.scale?.[0] ?? 1;
      const sy = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;
      const stairDoorContext = {
        towardPlateXZ: shaftDoorTowardPointFromFloorCorridors(
          obj.position[0],
          obj.position[2],
          floor,
          plateCx,
          plateCz,
        ),
        shaftPlateXZ: [obj.position[0], obj.position[2]] as const,
      };
      const resolvedDoor = resolveStairWellGroundDoor({
        sx,
        sy,
        sz,
        context: stairDoorContext,
        def: stairWellDef,
        authoringScope: stairAuthoringScope,
      });
      if (!resolvedDoor) continue;
      const doors = [
        resolvedDoor,
        ...resolveStairWellSupplementalDoors({
          sx,
          sy,
          sz,
          context: stairDoorContext,
          def: stairWellDef,
          authoringScope: stairAuthoringScope,
          primaryDoor: resolvedDoor,
        }),
      ];
      for (const door of doors) {
        stairDoorPunchesPlate.push({
          stairFace: door.groundDoor.face ?? "e",
          tangentLocal: door.groundDoor.tangentOffsetAlongWall ?? 0,
          doorHalfW: door.doorHalfW,
          y0Local: door.y0Local,
          y1Local: door.y1Local,
          spx: obj.position[0],
          spz: obj.position[2],
          spy: obj.position[1],
          shx: sx * 0.5,
          shz: sz * 0.5,
        });
      }
    }

    for (const obj of floor.objects) {
      const kind = classifyPrefab(obj.prefabId);
      if (kind !== "corridor" || obj.rotation) continue;
      const sx = obj.scale?.[0] ?? 1;
      const sy = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;
      const stairContacts = resolveCorridorShaftDoorContacts(
        obj,
        sx,
        sy,
        sz,
        kind,
        stairDoorPunchesPlate,
      );
      if (stairContacts.length === 0) continue;
      const affectedFaces = new Set<CardinalFace>(
        stairContacts.map((contact) => contact.corridorWall),
      );
      const corridorWallHoles = mergeCorridorShellWallHoles(
        corridorShellHolesFromStairPunches(obj, sx, sy, sz, kind, stairDoorPunchesPlate),
        corridorShellHolesFromAdjacentUnitEntries(obj, sx, sy, sz, floor),
      );
      const corridor = new THREE.Group();
      corridor.position.set(
        worldOrigin[0] + obj.position[0],
        worldOrigin[1] + (ref.levelIndex - 1) * floorSpacingM + obj.position[1],
        worldOrigin[2] + obj.position[2],
      );
      addHollowRoomShell(corridor, sx, sy, sz, kind, {
        shaftHolesPlate: [],
        roomPx: obj.position[0],
        roomPz: obj.position[2],
        skipShaftCutouts: false,
        storyLevelIndex: ref.levelIndex,
        storyShortLabel: shortFloorLabelForRef(ref),
        corridorWallHoles,
      });
      replacementBlockers.push(
        ...collectNamedBoxCollisionAabbs(corridor, wallPrefixesForFaces("shell_wall", affectedFaces)),
      );
      for (const face of affectedFaces) {
        suppressMasks.push(
          buildCorridorWallMask(
            corridor.position.x,
            corridor.position.y,
            corridor.position.z,
            sx,
            sy,
            sz,
            face,
          ),
        );
      }
    }
  }

  return { suppressMasks, replacementBlockers };
}

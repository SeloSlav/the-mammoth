import * as THREE from "three";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { stairShaftDoorTangentSpanShaftLocal } from "./stairElevatorPlaceholders.js";
import { exteriorFacesForPlacedObjectInFloor } from "./exteriorFaceExposure.js";
import type {
  CardinalFace,
  WallHoleXY,
  WallHoleYZ,
} from "./wallWithDoorCutout.js";
import { type StairCorridorSignPlacement } from "./stairwellCorridorSign.js";
import { stairwellLitterScatterSeed } from "./stairwellCigaretteLitter.js";
import type { PlateStairCorridorDoorPunch } from "./floorPlaceholderDoorPunchTypes.js";
import {
  type CorridorShellWallHoles,
  type ElevatorCorridorSignPlacement,
  type PlaceholderKind,
} from "./floorPlaceholderMeshTypes.js";
import { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
import { collectCorridorOrLobbyFootprintsFromFloor } from "./shaftCorridorFlush.js";
import {
  entryDoorShellCarveYRangeForShell,
  entryDoorTangentHalfFromOverlap,
  entryDoorYRangeForShell,
  UNIT_CORRIDOR_TOUCH_M,
} from "./unitEntryAdjacency.js";
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
export function resolveCorridorShaftDoorContacts(
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
        Math.abs(cpx - chx - (spx + shx)) < STAIR_CORRIDOR_TOUCH_M &&
        cpx > spx - 0.02;
    } else if (stairFace === "w") {
      adjacent =
        Math.abs(cpx + chx - (spx - shx)) < STAIR_CORRIDOR_TOUCH_M &&
        cpx < spx + 0.02;
    } else if (stairFace === "n") {
      adjacent =
        Math.abs(cpz - chz - (spz + shz)) < STAIR_CORRIDOR_TOUCH_M &&
        cpz > spz - 0.02;
    } else {
      adjacent =
        Math.abs(cpz + chz - (spz - shz)) < STAIR_CORRIDOR_TOUCH_M &&
        cpz < spz + 0.02;
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
    const { y0: y0r, y1: y1r } = normalizeCorridorStairDoorVerticalSpan(
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
export function corridorShellHolesFromStairPunches(
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
export function mergeCorridorShellWallHoles(
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
export function corridorShellWallHoleCount(
  h: CorridorShellWallHoles | undefined,
): number {
  if (!h) return 0;
  return h.e.length + h.w.length + h.n.length + h.s.length;
}
/**
 * Door cut on the **unit** wall shared with a corridor / lobby volume.
 */
export function unitEntryWallHolesFromFloorAdjacency(
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
  const { yDoor0: yHole0, yDoor1: yHole1 } =
    entryDoorShellCarveYRangeForShell(sy);
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
export function corridorShellHolesFromAdjacentUnitEntries(
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
  const { yDoor0: yHole0, yDoor1: yHole1 } =
    entryDoorShellCarveYRangeForShell(sy);
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
export function elevatorCorridorSignPlacementsFromPunches(
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
export function stairCorridorSignPlacementsFromPunches(
  corridor: PlacedObject,
  sx: number,
  sy: number,
  sz: number,
  stairPunches: readonly PlateStairCorridorDoorPunch[],
): StairCorridorSignPlacement[] {
  const contacts = resolveCorridorShaftDoorContacts(
    corridor,
    sx,
    sy,
    sz,
    "corridor",
    stairPunches,
  );
  const out: StairCorridorSignPlacement[] = [];
  for (const c of contacts) {
    out.push({
      corridorWall: c.corridorWall,
      yDoorTop: Math.max(c.y0r, c.y1r),
      holeAlongZ: c.holeAlongZ,
      z0: Math.min(c.z0r, c.z1r),
      z1: Math.max(c.z0r, c.z1r),
      x0: Math.min(c.x0r, c.x1r),
      x1: Math.max(c.x0r, c.x1r),
    });
  }
  return out;
}
/**
 * One STEP sign per wall cutout (room-local spans from {@link CorridorShellWallHoles}).
 * Uses {@link entryDoorYRangeForShell} for vertical head so the lintel clears the door frame
 * (shell carve holes extend down to the floor slab).
 */
export function stairSignPlacementsFromCorridorWallHoleSpans(
  holes: CorridorShellWallHoles,
  sy: number,
): StairCorridorSignPlacement[] {
  const { yDoor1 } = entryDoorYRangeForShell(sy);
  const yDoorTop = yDoor1;
  const out: StairCorridorSignPlacement[] = [];
  for (const h of holes.e) {
    out.push({
      corridorWall: "e",
      yDoorTop,
      holeAlongZ: true,
      z0: Math.min(h.z0, h.z1),
      z1: Math.max(h.z0, h.z1),
      x0: 0,
      x1: 0,
    });
  }
  for (const h of holes.w) {
    out.push({
      corridorWall: "w",
      yDoorTop,
      holeAlongZ: true,
      z0: Math.min(h.z0, h.z1),
      z1: Math.max(h.z0, h.z1),
      x0: 0,
      x1: 0,
    });
  }
  for (const h of holes.n) {
    out.push({
      corridorWall: "n",
      yDoorTop,
      holeAlongZ: false,
      z0: 0,
      z1: 0,
      x0: Math.min(h.x0, h.x1),
      x1: Math.max(h.x0, h.x1),
    });
  }
  for (const h of holes.s) {
    out.push({
      corridorWall: "s",
      yDoorTop,
      holeAlongZ: false,
      z0: 0,
      z1: 0,
      x0: Math.min(h.x0, h.x1),
      x1: Math.max(h.x0, h.x1),
    });
  }
  return out;
}
export function mergeStairCorridorSignPlacements(
  ...lists: readonly StairCorridorSignPlacement[][]
): StairCorridorSignPlacement[] {
  const seen = new Set<string>();
  const out: StairCorridorSignPlacement[] = [];
  for (const list of lists) {
    for (const p of list) {
      const zc = p.holeAlongZ ? (p.z0 + p.z1) * 0.5 : 0;
      const xc = p.holeAlongZ ? 0 : (p.x0 + p.x1) * 0.5;
      const key = `${p.corridorWall}:${zc.toFixed(3)}:${xc.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
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
export function addKoncarElevatorSignMeshes(
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
    /**
     * Koncar corridor signs sit above elevator landing openings — strictly corridor-facing
     * and fully occluded by the opaque facade from outside. Tag `mammothUnitInterior` so the
     * exterior-view hide (see `mountFpSession` → `unitInteriorMeshes`) drops them together
     * with other corridor-only geometry (STEP signs, apartment doors, etc.).
     */
    mesh.userData.mammothUnitInterior = true;
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

import type { BuildingDoc, FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import {
  getBuildingStairShaftSpecs,
  type BuildingStairShaftSpec,
  shaftPlanKey,
} from "./buildingStairShafts.js";
import {
  collectShaftSlabHoles,
  hollowShellXZRectsWithShaftCutouts,
  subtractHolesFromRect,
  type RectXZ,
  type ShaftSlabHole,
} from "./shaftPlanformClip.js";
import {
  computeSwitchbackStairLayout,
  hollowShellFloorLocalTopY,
  shaftFloorLocalTopY,
  type StairCornerLanding,
  type StairTreadSpec,
} from "./stairWellGeometry.js";

/**
 * Axis-aligned walk volume in **world** metres. `max[1]` is the top of the walk surface
 * (feet stand at `max[1]` before `SKIN` in locomotion).
 */
export type WalkSurfaceAabb = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

/** Infinite prototype slab used outside authored geometry (sync with `fpLocomotion` FLOOR_Y). */
export const WALK_FALLBACK_FLOOR_TOP_Y = 0.35;

function pushBox(
  out: WalkSurfaceAabb[],
  minx: number,
  miny: number,
  minz: number,
  maxx: number,
  maxy: number,
  maxz: number,
): void {
  out.push({
    min: [minx, miny, minz],
    max: [maxx, maxy, maxz],
  });
}

function translateAabb(
  a: WalkSurfaceAabb,
  tx: number,
  ty: number,
  tz: number,
): WalkSurfaceAabb {
  return {
    min: [a.min[0] + tx, a.min[1] + ty, a.min[2] + tz],
    max: [a.max[0] + tx, a.max[1] + ty, a.max[2] + tz],
  };
}

/** Slight overlap so `sampleWalkGroundTopY` + capsule probe do not fall through seams. */
function inflateStairWalkAabb(b: WalkSurfaceAabb): WalkSurfaceAabb {
  const padXZ = 0.075;
  const padYLo = 0.05;
  const padYHi = 0.095;
  return {
    min: [b.min[0] - padXZ, b.min[1] - padYLo, b.min[2] - padXZ],
    max: [b.max[0] + padXZ, b.max[1] + padYHi, b.max[2] + padXZ],
  };
}

function aabbForSwitchbackTread(tr: StairTreadSpec): WalkSurfaceAabb {
  const cos = Math.cos(tr.yaw);
  const sin = Math.sin(tr.yaw);
  const ha = tr.halfAlong;
  const hac = tr.halfAcross;
  const corners: [number, number][] = [
    [-ha, -hac],
    [ha, -hac],
    [ha, hac],
    [-ha, hac],
  ];
  let minx = Infinity;
  let maxx = -Infinity;
  let minz = Infinity;
  let maxz = -Infinity;
  for (const [lx, lz] of corners) {
    const wx = tr.x + lx * cos - lz * sin;
    const wz = tr.z + lx * sin + lz * cos;
    minx = Math.min(minx, wx);
    maxx = Math.max(maxx, wx);
    minz = Math.min(minz, wz);
    maxz = Math.max(maxz, wz);
  }
  const miny = tr.y - tr.riseHalf;
  const maxy = tr.y + tr.riseHalf;
  return {
    min: [minx, miny, minz],
    max: [maxx, maxy, maxz],
  };
}

function aabbForCornerLanding(cl: StairCornerLanding): WalkSurfaceAabb {
  return {
    min: [
      cl.x - cl.halfW,
      cl.y - cl.thicknessHalf,
      cl.z - cl.halfD,
    ],
    max: [
      cl.x + cl.halfW,
      cl.y + cl.thicknessHalf,
      cl.z + cl.halfD,
    ],
  };
}

function stairWellWalkLocalAABBs(
  sx: number,
  sy: number,
  sz: number,
  climbFullShaft = false,
): WalkSurfaceAabb[] {
  const L = computeSwitchbackStairLayout(sx, sy, sz, {
    climbFullShaft,
  });
  const out: WalkSurfaceAabb[] = [];
  for (const tr of L.treads) {
    out.push(inflateStairWalkAabb(aabbForSwitchbackTread(tr)));
  }
  for (const cl of L.cornerLandings) {
    out.push(inflateStairWalkAabb(aabbForCornerLanding(cl)));
  }
  const top = shaftFloorLocalTopY(sy);
  const thin = Math.max(0.055, 0.11 * 0.5);
  pushBox(out, -sx * 0.5, top - thin, -sz * 0.5, sx * 0.5, top, sz * 0.5);
  return out;
}

function expandBounds(
  min: [number, number, number],
  max: [number, number, number],
  obj: PlacedObject,
): void {
  const [px, py, pz] = obj.position;
  const sx = obj.scale?.[0] ?? 1;
  const sy = obj.scale?.[1] ?? 1;
  const sz = obj.scale?.[2] ?? 1;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  min[0] = Math.min(min[0], px - hx);
  min[1] = Math.min(min[1], py - hy);
  min[2] = Math.min(min[2], pz - hz);
  max[0] = Math.max(max[0], px + hx);
  max[1] = Math.max(max[1], py + hy);
  max[2] = Math.max(max[2], pz + hz);
}

function appendConcreteSlabWalkAABBs(
  out: WalkSurfaceAabb[],
  doc: FloorDoc,
  floorWorldY: number,
  marginXZ: number,
  thickness: number,
  docHoles: readonly ShaftSlabHole[],
): void {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let has = false;
  for (const obj of doc.objects) {
    expandBounds(min, max, obj);
    has = true;
  }
  if (!has) return;

  const x0 = min[0] - marginXZ;
  const x1 = max[0] + marginXZ;
  const z0 = min[2] - marginXZ;
  const z1 = max[2] + marginXZ;
  /** Matches `addConcreteSlabWithOptionalShaftHoles`: slab top in plate space is `min.y`. */
  const slabTop = min[1] + floorWorldY;
  const slabRect: RectXZ = { x0, x1, z0, z1 };
  const pieces =
    docHoles.length > 0 ? subtractHolesFromRect(slabRect, docHoles) : [slabRect];
  const thin = thickness;
  for (const p of pieces) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) * 0.5;
    const cz = (p.z0 + p.z1) * 0.5;
    pushBox(
      out,
      cx - w * 0.5,
      slabTop - thin,
      cz - d * 0.5,
      cx + w * 0.5,
      slabTop,
      cz + d * 0.5,
    );
  }
}

/**
 * Walkable AABBs for one floor plate (objects already in plate space; add `floorWorldY` to Y).
 */
function appendHollowShellFloorWalkAABBs(
  out: WalkSurfaceAabb[],
  sx: number,
  sy: number,
  sz: number,
  px: number,
  wy: number,
  pz: number,
  docHoles: readonly ShaftSlabHole[],
  skipShaftCutouts: boolean,
): void {
  const wt = 0.12;
  const top = hollowShellFloorLocalTopY(sy);
  const thin = wt;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const rects = skipShaftCutouts
    ? ([{ x0: -hx, x1: hx, z0: -hz, z1: hz }] as const)
    : hollowShellXZRectsWithShaftCutouts(sx, sz, px, pz, docHoles);
  for (const r of rects) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) * 0.5;
    const cz = (r.z0 + r.z1) * 0.5;
    const local: WalkSurfaceAabb = {
      min: [cx - w * 0.5, top - thin, cz - d * 0.5],
      max: [cx + w * 0.5, top, cz + d * 0.5],
    };
    out.push(translateAabb(local, px, wy, pz));
  }
}

export type WalkSurfaceFloorOpts = {
  /** Omit per-plate stair AABBs for shafts drawn as full-height columns. */
  omitStairWalkPlanKeys?: ReadonlySet<string>;
};

export function walkSurfaceAABBsForFloorDoc(
  doc: FloorDoc,
  floorWorldY: number,
  opts?: WalkSurfaceFloorOpts,
): WalkSurfaceAabb[] {
  const out: WalkSurfaceAabb[] = [];
  const docHoles = collectShaftSlabHoles(doc);
  for (const obj of doc.objects) {
    const [px, py, pz] = obj.position;
    const sx = obj.scale?.[0] ?? 1;
    const sy = obj.scale?.[1] ?? 1;
    const sz = obj.scale?.[2] ?? 1;
    const pid = obj.prefabId.toLowerCase();
    const wy = py + floorWorldY;

    if (pid.includes("elevator")) {
      const top = shaftFloorLocalTopY(sy) + wy;
      const thin = 0.06;
      pushBox(
        out,
        px - sx * 0.5,
        top - thin,
        pz - sz * 0.5,
        px + sx * 0.5,
        top,
        pz + sz * 0.5,
      );
    } else if (pid.includes("stair_well") || pid.includes("stairwell")) {
      const pk = shaftPlanKey(px, pz);
      if (!opts?.omitStairWalkPlanKeys?.has(pk)) {
        for (const b of stairWellWalkLocalAABBs(sx, sy, sz, false)) {
          out.push(translateAabb(b, px, wy, pz));
        }
      }
    } else {
      appendHollowShellFloorWalkAABBs(
        out,
        sx,
        sy,
        sz,
        px,
        wy,
        pz,
        docHoles,
        Boolean(obj.rotation),
      );
    }
  }
  appendConcreteSlabWalkAABBs(out, doc, floorWorldY, 0.8, 0.16, docHoles);
  return out;
}

function appendBuildingStairShaftWalkAABBs(
  merged: WalkSurfaceAabb[],
  specs: readonly BuildingStairShaftSpec[],
  ox: number,
  oy: number,
  oz: number,
): void {
  for (const s of specs) {
    for (const b of stairWellWalkLocalAABBs(s.sx, s.megaSy, s.sz, true)) {
      merged.push({
        min: [
          b.min[0] + ox + s.px,
          b.min[1] + oy + s.centerY,
          b.min[2] + oz + s.pz,
        ],
        max: [
          b.max[0] + ox + s.px,
          b.max[1] + oy + s.centerY,
          b.max[2] + oz + s.pz,
        ],
      });
    }
  }
}

export function walkSurfaceAABBsForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  floorSpacingM: number,
): WalkSurfaceAabb[] {
  const ox = building.worldOrigin?.[0] ?? 0;
  const oy = building.worldOrigin?.[1] ?? 0;
  const oz = building.worldOrigin?.[2] ?? 0;
  const sorted = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const shaftSpecs = getBuildingStairShaftSpecs(
    building,
    getFloorDoc,
    sorted,
    floorSpacingM,
  );
  const omitStairKeys = new Set(shaftSpecs.map((s) => s.planKey));

  const merged: WalkSurfaceAabb[] = [];
  for (const ref of sorted) {
    const doc = getFloorDoc(ref.floorDocId);
    const plateY = oy + (ref.levelIndex - 1) * floorSpacingM;
    for (const b of walkSurfaceAABBsForFloorDoc(doc, plateY, {
      omitStairWalkPlanKeys: omitStairKeys,
    })) {
      merged.push({
        min: [b.min[0] + ox, b.min[1], b.min[2] + oz],
        max: [b.max[0] + ox, b.max[1], b.max[2] + oz],
      });
    }
  }
  if (shaftSpecs.length > 0) {
    appendBuildingStairShaftWalkAABBs(merged, shaftSpecs, ox, oy, oz);
  }
  return merged;
}

export type SampleWalkGroundOpts = {
  /** Max vertical distance above a surface top that still counts as “under” the probe. */
  stepUpMargin?: number;
  /**
   * Horizontal half-extent (m) of the feet vs each walk AABB — avoids falling through when the
   * single-point (x,z) sits in a crack between treads (set 0 to restore point sampling).
   */
  footRadiusXZ?: number;
};

/**
 * Highest walk surface under `probeTopY` for a **foot rectangle** around (x,z).
 * Returns **NaN** when no AABB overlaps the foot (so locomotion does not snap to the lobby slab
 * while you are still high in a shaft — that felt like “falling through” then yanking to the floor).
 */
export function sampleWalkGroundTopY(
  aabbs: readonly WalkSurfaceAabb[],
  x: number,
  z: number,
  probeTopY: number,
  opts?: SampleWalkGroundOpts,
): number {
  /** Defaults match `FP_WALK_*` in `@the-mammoth/engine` / server `movement.rs`. */
  const stepUpMargin = opts?.stepUpMargin ?? 0.82;
  const footR = opts?.footRadiusXZ ?? 0.22;
  const fx0 = x - footR;
  const fx1 = x + footR;
  const fz0 = z - footR;
  const fz1 = z + footR;
  let best = NaN;
  for (const b of aabbs) {
    if (fx1 < b.min[0] || fx0 > b.max[0] || fz1 < b.min[2] || fz0 > b.max[2]) continue;
    const top = b.max[1];
    if (top <= probeTopY + stepUpMargin) {
      best = Number.isFinite(best) ? Math.max(best, top) : top;
    }
  }
  if (!Number.isFinite(best)) return Number.NaN;
  return Math.max(best, WALK_FALLBACK_FLOOR_TOP_Y);
}

/** Axis-aligned XZ bounds of all walk surfaces (world metres). */
export type WalkSurfaceXzFootprint = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export function walkSurfaceAabbXZFootprint(
  aabbs: readonly WalkSurfaceAabb[],
): WalkSurfaceXzFootprint | null {
  if (aabbs.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of aabbs) {
    minX = Math.min(minX, b.min[0]);
    maxX = Math.max(maxX, b.max[0]);
    minZ = Math.min(minZ, b.min[2]);
    maxZ = Math.max(maxZ, b.max[2]);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minZ, maxZ };
}

export type ExteriorWalkGroundOpts = {
  /** Metres beyond the authored walk AABB hull before we treat (x,z) as “outside the building”. */
  footprintMarginM?: number;
  /**
   * If the downward probe origin is below this Y, exterior fallback may apply (keeps shafts
   * from snapping to the podium slab while you are high in the stack).
   */
  exteriorProbeMaxY?: number;
};

/**
 * Like {@link sampleWalkGroundTopY}, but when there is no hit **and** (x,z) lies clearly outside
 * the walk mesh XZ hull, returns {@link WALK_FALLBACK_FLOOR_TOP_Y} so outdoor / cell ground
 * matches `fpLocomotion` / server `FLOOR_Y` instead of falling forever.
 */
export function sampleWalkGroundTopYWithExteriorGround(
  aabbs: readonly WalkSurfaceAabb[],
  x: number,
  z: number,
  probeTopY: number,
  xzFootprint: WalkSurfaceXzFootprint,
  opts?: SampleWalkGroundOpts & { exterior?: ExteriorWalkGroundOpts },
): number {
  const inner = sampleWalkGroundTopY(aabbs, x, z, probeTopY, opts);
  if (Number.isFinite(inner)) return inner;

  const m = opts?.exterior?.footprintMarginM ?? 2;
  const probeMax =
    opts?.exterior?.exteriorProbeMaxY ?? WALK_FALLBACK_FLOOR_TOP_Y + 8;
  const { minX, maxX, minZ, maxZ } = xzFootprint;
  const outside =
    x < minX - m || x > maxX + m || z < minZ - m || z > maxZ + m;
  if (outside && probeTopY <= probeMax) return WALK_FALLBACK_FLOOR_TOP_Y;
  return Number.NaN;
}

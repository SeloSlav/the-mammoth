import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import {
  buildStaticCollisionSceneForBuilding,
  type CollisionAabb,
} from "./collisionScene.js";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "./buildingFloorStack.js";
import type { GetFloorOverrideDoc } from "./resolvedFloorDoc.js";
import { buildUnitExteriorWindowSealBlockersForBuilding } from "./unitExteriorWindowBlockers.js";

/** Metres — co-planar faces within this gap merge into one blocker. */
const MERGE_EPS = 0.002;

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < MERGE_EPS;
}

/**
 * Doorway jamb trim — how far to pull the collision-only face of a wall back from
 * the doorway opening. Matching the player radius was not enough in live play:
 * the depenetration solver still picked tiny `-x` pushes when the player hugged
 * the jamb and approached diagonally. A larger collision-only chamfer gives the
 * capsule enough room to slide through naturally while leaving visuals unchanged.
 */
const DOORWAY_COLLISION_INSET_M = 0.6;

/** Wall thickness cap used to recognise wall-shaped AABBs vs. floors/slabs. */
const WALL_MAX_THICKNESS_M = 0.5;

/** Allowed gap range between two co-planar wall pieces that counts as a doorway. */
const DOORWAY_MIN_GAP_M = 0.8;
const DOORWAY_MAX_GAP_M = 2.5;

/**
 * Minimum Y-overlap between two wall pieces to treat them as the same wall band.
 * Walls split into multiple Y slabs by door-sill / lintel carves can end up as thin
 * (30 mm) strips — we still want to pair them across a doorway, so the threshold
 * must be below the sill-strip height.
 */
const DOORWAY_Y_OVERLAP_MIN_M = 0.02;

type MutableBox = {
  min: [number, number, number];
  max: [number, number, number];
};

function yOverlapMeters(a: MutableBox, b: MutableBox): number {
  const lo = Math.max(a.min[1], b.min[1]);
  const hi = Math.min(a.max[1], b.max[1]);
  return hi - lo;
}

/**
 * Post-process: recognise doorway-shaped gaps in co-planar wall AABBs and pull the
 * jamb-facing edge of each wall back by {@link DOORWAY_COLLISION_INSET_M}. The visual
 * geometry is not touched — we only narrow what the player's capsule collides with so
 * the inside corner of the jamb can be cleared when approaching at an angle.
 *
 * Detection per AABB `B`:
 *  - Thin-in-X wall (xWidth ≤ {@link WALL_MAX_THICKNESS_M}): search for any other
 *    thin-in-X wall `A` sharing the same X face and overlapping ≥
 *    {@link DOORWAY_Y_OVERLAP_MIN_M} in Y, separated by a Z-gap in
 *    `[DOORWAY_MIN_GAP_M, DOORWAY_MAX_GAP_M]`. The Z-face of `B` toward the gap is
 *    trimmed by `inset`.
 *  - Mirrored for thin-in-Z walls on the X axis.
 *
 * The trim is symmetric: a wall flanked by doorways on both ends gets both edges
 * inset. Walls with no doorway partner are untouched. Complexity is `O(n^2)` over
 * wall pieces; in practice `n` is a few hundred per building and the pass runs once
 * during content generation.
 */
export function trimDoorwayJambCornersForCollision(
  aabbs: readonly CollisionAabb[],
  inset: number = DOORWAY_COLLISION_INSET_M,
): CollisionAabb[] {
  const frozen: MutableBox[] = aabbs.map((b) => ({
    min: [b.min[0], b.min[1], b.min[2]],
    max: [b.max[0], b.max[1], b.max[2]],
  }));
  const mut: MutableBox[] = aabbs.map((b) => ({
    min: [b.min[0], b.min[1], b.min[2]],
    max: [b.max[0], b.max[1], b.max[2]],
  }));

  const faceEq = (a: number, b: number): boolean => Math.abs(a - b) < MERGE_EPS;

  for (let i = 0; i < frozen.length; i++) {
    const bo = frozen[i]!;
    const bm = mut[i]!;
    const xw = bo.max[0] - bo.min[0];
    const zw = bo.max[2] - bo.min[2];

    // Thin-in-X wall — doorway gaps live along Z.
    if (xw <= WALL_MAX_THICKNESS_M) {
      let trimMaxZ = false;
      let trimMinZ = false;
      for (let j = 0; j < frozen.length; j++) {
        if (i === j) continue;
        const a = frozen[j]!;
        const axw = a.max[0] - a.min[0];
        if (axw > WALL_MAX_THICKNESS_M) continue;
        if (!faceEq(a.min[0], bo.min[0]) || !faceEq(a.max[0], bo.max[0])) continue;
        if (yOverlapMeters(a, bo) < DOORWAY_Y_OVERLAP_MIN_M) continue;
        const gapN = a.min[2] - bo.max[2];
        if (gapN >= DOORWAY_MIN_GAP_M && gapN <= DOORWAY_MAX_GAP_M) trimMaxZ = true;
        const gapS = bo.min[2] - a.max[2];
        if (gapS >= DOORWAY_MIN_GAP_M && gapS <= DOORWAY_MAX_GAP_M) trimMinZ = true;
      }
      if (trimMaxZ) bm.max[2] = Math.max(bm.min[2], bm.max[2] - inset);
      if (trimMinZ) bm.min[2] = Math.min(bm.max[2], bm.min[2] + inset);
    }

    // Thin-in-Z wall — doorway gaps live along X.
    if (zw <= WALL_MAX_THICKNESS_M) {
      let trimMaxX = false;
      let trimMinX = false;
      for (let j = 0; j < frozen.length; j++) {
        if (i === j) continue;
        const a = frozen[j]!;
        const azw = a.max[2] - a.min[2];
        if (azw > WALL_MAX_THICKNESS_M) continue;
        if (!faceEq(a.min[2], bo.min[2]) || !faceEq(a.max[2], bo.max[2])) continue;
        if (yOverlapMeters(a, bo) < DOORWAY_Y_OVERLAP_MIN_M) continue;
        const gapE = a.min[0] - bo.max[0];
        if (gapE >= DOORWAY_MIN_GAP_M && gapE <= DOORWAY_MAX_GAP_M) trimMaxX = true;
        const gapW = bo.min[0] - a.max[0];
        if (gapW >= DOORWAY_MIN_GAP_M && gapW <= DOORWAY_MAX_GAP_M) trimMinX = true;
      }
      if (trimMaxX) bm.max[0] = Math.max(bm.min[0], bm.max[0] - inset);
      if (trimMinX) bm.min[0] = Math.min(bm.max[0], bm.min[0] + inset);
    }
  }

  return mut.map((b) => ({
    min: [b.min[0], b.min[1], b.min[2]] as const,
    max: [b.max[0], b.max[1], b.max[2]] as const,
  }));
}

/**
 * Merge axis-aligned blockers that share a full face (same Y band + same span on the
 * orthogonal horizontal axis). Reduces internal seams from placeholder box tiling.
 */
export function mergeCoplanarTouchingBlockerAabbs(
  aabbs: readonly CollisionAabb[],
): CollisionAabb[] {
  type Box = {
    min: [number, number, number];
    max: [number, number, number];
  };
  const list: Box[] = aabbs.map((b) => ({
    min: [b.min[0], b.min[1], b.min[2]],
    max: [b.max[0], b.max[1], b.max[2]],
  }));

  const yBandMatch = (a: Box, b: Box): boolean =>
    approxEq(a.min[1], b.min[1]) && approxEq(a.max[1], b.max[1]);

  const xzOverlap1D = (a0: number, a1: number, b0: number, b1: number): boolean =>
    !(a1 < b0 - MERGE_EPS || b1 < a0 - MERGE_EPS);

  const tryMergePair = (a: Box, b: Box): Box | null => {
    if (!yBandMatch(a, b)) return null;

    // Same Z span — merge along X (touching or overlapping in X).
    if (approxEq(a.min[2], b.min[2]) && approxEq(a.max[2], b.max[2])) {
      if (!xzOverlap1D(a.min[0], a.max[0], b.min[0], b.max[0])) return null;
      return {
        min: [Math.min(a.min[0], b.min[0]), a.min[1], a.min[2]],
        max: [Math.max(a.max[0], b.max[0]), a.max[1], a.max[2]],
      };
    }

    // Same X span — merge along Z.
    if (approxEq(a.min[0], b.min[0]) && approxEq(a.max[0], b.max[0])) {
      if (!xzOverlap1D(a.min[2], a.max[2], b.min[2], b.max[2])) return null;
      return {
        min: [a.min[0], a.min[1], Math.min(a.min[2], b.min[2])],
        max: [a.max[0], a.max[1], Math.max(a.max[2], b.max[2])],
      };
    }

    return null;
  };

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const merged = tryMergePair(list[i]!, list[j]!);
        if (merged) {
          list[i] = merged;
          list.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }

  return list.map((b) => ({
    min: [b.min[0], b.min[1], b.min[2]] as const,
    max: [b.max[0], b.max[1], b.max[2]] as const,
  }));
}

export type FpBlockerBakeOptions = {
  floorSpacingM?: number;
  getFloorOverrideDoc?: GetFloorOverrideDoc;
  stairWellDef?: StairWellDef;
  /** Default true — merges co-planar touching boxes from mesh harvest. */
  mergeCoplanar?: boolean;
};

/**
 * Static **blocking** volumes for FPS horizontal collision (walls, shafts, props).
 * Still sourced from authored placeholder meshes, but post-processed to reduce seam count.
 * Walk / support surfaces come from {@link walkSurfaceAABBsForBuilding} — not duplicated here.
 */
export function buildFpBlockerAABBsForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  options?: FpBlockerBakeOptions,
): CollisionAabb[] {
  const scene = buildStaticCollisionSceneForBuilding(building, getFloorDoc, {
    floorSpacingM: options?.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M,
    getFloorOverrideDoc: options?.getFloorOverrideDoc,
    stairWellDef: options?.stairWellDef,
  });
  const raw = [...scene.solids];
  const merge = options?.mergeCoplanar !== false;
  const merged = merge ? mergeCoplanarTouchingBlockerAabbs(raw) : raw;
  const trimmed = trimDoorwayJambCornersForCollision(merged);
  const windowSeals = buildUnitExteriorWindowSealBlockersForBuilding(
    building,
    getFloorDoc,
    options?.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M,
    { getFloorOverrideDoc: options?.getFloorOverrideDoc },
  );
  return [...trimmed, ...windowSeals];
}

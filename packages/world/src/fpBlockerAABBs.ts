import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import {
  buildStaticCollisionSceneForBuilding,
  type CollisionAabb,
} from "./collisionScene.js";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "./buildingFloorStack.js";
import type { GetFloorOverrideDoc } from "./resolvedFloorDoc.js";

/** Metres — co-planar faces within this gap merge into one blocker. */
const MERGE_EPS = 0.002;

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < MERGE_EPS;
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
  let list: Box[] = aabbs.map((b) => ({
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
  return merge ? mergeCoplanarTouchingBlockerAabbs(raw) : raw;
}

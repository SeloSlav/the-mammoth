import { mammothVerticalStoryBandIndex } from "./buildingStory.js";
import type { WalkSurfaceAabb } from "./walkSurfaceAABBs.js";

export type WalkSurfaceStoreyFilterOpts = {
  buildingWorldOriginY: number;
  floorSpacingM: number;
  /** Inclusive 1-based storey band (matches floor-plate visibility). */
  bandLo: number;
  bandHi: number;
  /** Extra storeys above/below band for transitions. */
  padStoreys?: number;
  /** AABBs that must stay sampled (elevator cab, stairs). */
  alwaysInclude?: (aabb: WalkSurfaceAabb) => boolean;
};

/** Sentinel: no band filtering (full building walk set). */
export const WALK_SURFACE_STOREY_BAND_DISABLED = -999;

export function filterWalkSurfaceAabbsByStoreyBand(
  aabbs: readonly WalkSurfaceAabb[],
  opts: WalkSurfaceStoreyFilterOpts | null,
): readonly WalkSurfaceAabb[] {
  if (!opts || opts.bandLo <= WALK_SURFACE_STOREY_BAND_DISABLED) return aabbs;
  const pad = opts.padStoreys ?? 1;
  const lo = opts.bandLo - pad;
  const hi = opts.bandHi + pad;
  const originY = opts.buildingWorldOriginY;
  const spacing = opts.floorSpacingM;
  const out: WalkSurfaceAabb[] = [];
  for (const b of aabbs) {
    if (opts.alwaysInclude?.(b)) {
      out.push(b);
      continue;
    }
    const centerY = (b.min[1] + b.max[1]) * 0.5;
    const storey = mammothVerticalStoryBandIndex(centerY, originY, spacing) + 1;
    if (storey >= lo && storey <= hi) out.push(b);
  }
  return out.length > 0 ? out : aabbs;
}

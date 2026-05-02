import * as THREE from "three";

import type { CollisionAabb } from "./collisionScene.js";

export const EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT = 440;

/** Default Zagreb grove seed (`"zgre"` → int; keep in sync with server tree collision codegen). */
export const EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED = 0x7a67_7265;

export const EXTERIOR_PROCEDURAL_TREE_DEFAULT_MIN_FACADE_CLEARANCE_M = 11;

export const EXTERIOR_PROCEDURAL_TREE_DEFAULT_MAX_SCATTER_M = 170;

/** @see EzTreeMegablockVariant — index into this table (stored as `prototypeIndex` for compatibility). */
export const EZ_TREE_MEGABLOCK_VARIANTS = [
  {
    preset: "Ash Medium",
    weight: 0.18,
    heightMinM: 9,
    heightMaxM: 21,
    heightGamma: 0.95,
  },
  {
    preset: "Ash Large",
    weight: 0.06,
    heightMinM: 14,
    heightMaxM: 26,
    heightGamma: 0.92,
  },
  {
    preset: "Ash Small",
    weight: 0.1,
    heightMinM: 5,
    heightMaxM: 13,
    heightGamma: 0.85,
  },
  {
    preset: "Oak Medium",
    weight: 0.16,
    heightMinM: 10,
    heightMaxM: 20,
    heightGamma: 0.95,
  },
  {
    preset: "Oak Large",
    weight: 0.05,
    heightMinM: 13,
    heightMaxM: 24,
    heightGamma: 0.92,
  },
  {
    preset: "Oak Small",
    weight: 0.08,
    heightMinM: 5,
    heightMaxM: 11,
    heightGamma: 0.88,
  },
  {
    preset: "Aspen Medium",
    weight: 0.12,
    heightMinM: 12,
    heightMaxM: 24,
    heightGamma: 0.82,
  },
  {
    preset: "Aspen Large",
    weight: 0.08,
    heightMinM: 18,
    heightMaxM: 32,
    heightGamma: 0.78,
  },
  /** Planted spruce/pine strips common on socialist-era housing courtyards. */
  {
    preset: "Pine Medium",
    weight: 0.075,
    heightMinM: 7,
    heightMaxM: 16,
    heightGamma: 0.95,
  },
  {
    preset: "Pine Small",
    weight: 0.055,
    heightMinM: 4,
    heightMaxM: 10,
    heightGamma: 0.85,
  },
  /** Shrubs toward façades / path edges — low weight vs canopy trees. */
  {
    preset: "Bush 1",
    weight: 0.015,
    heightMinM: 1.2,
    heightMaxM: 2.9,
    heightGamma: 1,
  },
  {
    preset: "Bush 2",
    weight: 0.014,
    heightMinM: 1.1,
    heightMaxM: 2.6,
    heightGamma: 1,
  },
  {
    preset: "Bush 3",
    weight: 0.011,
    heightMinM: 1,
    heightMaxM: 2.5,
    heightGamma: 1,
  },
] as const;

export type ExteriorProceduralTreePlacement = {
  readonly x: number;
  readonly z: number;
  readonly heightM: number;
  readonly yawRad: number;
  /**
   * Index into {@link EZ_TREE_MEGABLOCK_VARIANTS} (historic name from the retired L‑system grove).
   */
  readonly prototypeIndex: number;
};

export type ExteriorProceduralTreeOptions = {
  readonly count?: number;
  readonly seed?: number;
  readonly groundY?: number;
  readonly minFacadeClearanceM?: number;
  readonly maxScatterDistanceM?: number;
};

type EzTreeMegablockVariant = (typeof EZ_TREE_MEGABLOCK_VARIANTS)[number];

const VARIANT_WEIGHT_TOTAL = EZ_TREE_MEGABLOCK_VARIANTS.reduce(
  (acc, v) => acc + v.weight,
  0,
);

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function variantHeightM(
  variant: EzTreeMegablockVariant,
  rand: () => number,
): number {
  const gamma = variant.heightGamma ?? 1;
  const t = Math.pow(rand(), gamma);
  return THREE.MathUtils.lerp(variant.heightMinM, variant.heightMaxM, t);
}

function pickVariantIndex(rand: () => number): number {
  const r = rand() * VARIANT_WEIGHT_TOTAL;
  let acc = 0;
  for (let i = 0; i < EZ_TREE_MEGABLOCK_VARIANTS.length; i++) {
    acc += EZ_TREE_MEGABLOCK_VARIANTS[i]!.weight;
    if (r <= acc) return i;
  }
  return EZ_TREE_MEGABLOCK_VARIANTS.length - 1;
}

/** Deterministic XY scatter outside the mamutica-like footprint — shared by ez-tree mesh builder. */
export function buildExteriorMegablockTreePlacements(
  footprint: THREE.Box3,
  options: Required<
    Pick<
      ExteriorProceduralTreeOptions,
      "count" | "seed" | "minFacadeClearanceM" | "maxScatterDistanceM"
    >
  >,
): ExteriorProceduralTreePlacement[] {
  const rand = mulberry32(options.seed);
  const minX = footprint.min.x;
  const maxX = footprint.max.x;
  const minZ = footprint.min.z;
  const maxZ = footprint.max.z;
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxZ - minZ);
  const sideWeights = [width, width, depth, depth];
  const total = sideWeights.reduce((a, b) => a + b, 0);
  const placements: ExteriorProceduralTreePlacement[] = [];

  for (let i = 0; i < options.count; i++) {
    const prototypeIndex = pickVariantIndex(rand);
    const variant = EZ_TREE_MEGABLOCK_VARIANTS[prototypeIndex]!;
    const sidePick = rand() * total;
    const side =
      sidePick < sideWeights[0]!
        ? 0
        : sidePick < sideWeights[0]! + sideWeights[1]!
          ? 1
          : sidePick < sideWeights[0]! + sideWeights[1]! + sideWeights[2]!
            ? 2
            : 3;
    /**
     * Most trees sit in the mid/far yard; only a minority use the "near" band, and that band
     * still keeps a floor distance so we do not hug the megablock façade.
     */
    const nearBand = rand() < 0.24;
    const scatter = nearBand
      ? options.maxScatterDistanceM * 0.14 +
        Math.pow(rand(), 1.85) * (options.maxScatterDistanceM * 0.36)
      : options.maxScatterDistanceM * (0.52 + rand() * 0.48);
    const offset = options.minFacadeClearanceM + scatter;
    const alongPad = nearBand ? 28 : 72;
    let x = 0;
    let z = 0;
    if (side === 0) {
      x = THREE.MathUtils.lerp(minX - alongPad, maxX + alongPad, rand());
      z = maxZ + offset;
    } else if (side === 1) {
      x = THREE.MathUtils.lerp(minX - alongPad, maxX + alongPad, rand());
      z = minZ - offset;
    } else if (side === 2) {
      x = maxX + offset;
      z = THREE.MathUtils.lerp(minZ - alongPad, maxZ + alongPad, rand());
    } else {
      x = minX - offset;
      z = THREE.MathUtils.lerp(minZ - alongPad, maxZ + alongPad, rand());
    }
    const jitter = nearBand ? 5 : 9;
    x += (rand() - 0.5) * jitter;
    z += (rand() - 0.5) * jitter;
    placements.push({
      x,
      z,
      heightM: variantHeightM(variant, rand),
      yawRad: rand() * Math.PI * 2,
      prototypeIndex,
    });
  }
  return placements;
}

/** Last occupied variant index (+1 = count) — exported for codegen / tooling. */
export const EZ_TREE_MEGABLOCK_VARIANT_COUNT = EZ_TREE_MEGABLOCK_VARIANTS.length;

export function xzFootprintHalfExtentMForEzTreeSpecies(
  prototypeIndex: number,
  heightM: number,
): number {
  const h = Math.max(heightM, 1e-3);
  if (prototypeIndex >= 10) {
    const shrub = THREE.MathUtils.clamp(h * 0.43 + 0.1, 0.42, Math.min(h * 0.7 + 0.08, 1.92));
    return shrub;
  }
  if (prototypeIndex === 6 || prototypeIndex === 7) {
    const narrowK = prototypeIndex === 7 ? 0.072 : 0.084;
    return THREE.MathUtils.clamp(h * narrowK, 0.44, prototypeIndex === 7 ? 1.72 : 1.58);
  }
  if (prototypeIndex === 8 || prototypeIndex === 9) {
    return THREE.MathUtils.clamp(h * 0.098, 0.5, 1.74);
  }
  const ashOrOakWide = prototypeIndex === 1 || prototypeIndex === 4;
  const ashOrOakCompact = prototypeIndex === 2 || prototypeIndex === 5;
  const k = ashOrOakWide ? 0.142 : ashOrOakCompact ? 0.108 : 0.127;
  return THREE.MathUtils.clamp(h * k + (ashOrOakWide ? 0.065 : ashOrOakCompact ? -0.035 : 0.02),
    ashOrOakCompact ? 0.55 : 0.62,
    ashOrOakWide ? 2.72 : ashOrOakCompact ? 1.94 : 2.18,
  );
}

/**
 * Authoritative-aligned vertical pillars (XZ square) baked per placement — blocks FP capsule + LOS.
 * Matches building-local coords where the grove hangs under `buildingRoot`.
 */
export function buildExteriorEzTreeCollisionAABBs(
  placements: readonly ExteriorProceduralTreePlacement[],
  groundBuildingLocalY: number,
): CollisionAabb[] {
  const yPadGround = 0.02;
  const yPadCanopyTop = 0.45;

  const out: CollisionAabb[] = [];
  for (const p of placements) {
    const hxz = xzFootprintHalfExtentMForEzTreeSpecies(p.prototypeIndex, p.heightM);
    const minY = groundBuildingLocalY - yPadGround;
    const maxY = groundBuildingLocalY + p.heightM + yPadCanopyTop;
    out.push({
      min: [p.x - hxz, minY, p.z - hxz],
      max: [p.x + hxz, maxY, p.z + hxz],
    });
  }
  return out;
}

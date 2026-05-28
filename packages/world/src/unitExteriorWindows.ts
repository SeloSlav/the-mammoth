import * as THREE from "three";
import type { CardinalFace, WallHoleXY, WallHoleYZ } from "./wallWithDoorCutout.js";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { unitHasAdjacentUnitAlongBarCap } from "./exteriorFaceExposure.js";

/**
 * E/W long façades get the multi-segment window band. N/S caps only on true bar ends — not the
 * short wall shared with the next unit along the wing (see {@link unitHasAdjacentUnitAlongBarCap}).
 */
export function unitShellFacesForExteriorWindows(
  exteriorFaces: readonly CardinalFace[],
  barEndCtx: { floor: FloorDoc; placedObject: PlacedObject },
): CardinalFace[] {
  const longFaces = exteriorFaces.filter((f) => f === "e" || f === "w");
  const nsCaps: CardinalFace[] = [];
  if (
    exteriorFaces.includes("n") &&
    !unitHasAdjacentUnitAlongBarCap(barEndCtx.floor, barEndCtx.placedObject, "n")
  ) {
    nsCaps.push("n");
  }
  if (
    exteriorFaces.includes("s") &&
    !unitHasAdjacentUnitAlongBarCap(barEndCtx.floor, barEndCtx.placedObject, "s")
  ) {
    nsCaps.push("s");
  }
  return [...longFaces, ...nsCaps];
}

/** Corridor spine caps: one centered window on each exposed short end (north and south). */
export function corridorCapFacesForExteriorWindows(
  exteriorFaces: readonly CardinalFace[],
): CardinalFace[] {
  const out: CardinalFace[] = [];
  if (exteriorFaces.includes("n")) out.push("n");
  if (exteriorFaces.includes("s")) out.push("s");
  return out;
}

const EDGE_INSET_M = 0.35;
const MULLION_GAP_M = 0.12;
const MIN_SEGMENT_WIDTH_M = 0.42;
/** Corridor N/S end caps: centered slit — tall and narrow, not unit E/W panels. */
export const CORRIDOR_CAP_WINDOW_WIDTH_M = 0.95;
const SILL_ABOVE_YLO_M = 0.55;
const WINDOW_BOTTOM_TRIM_M = 0.36;
const WINDOW_OPENING_HEIGHT_M = 1.78;
const WINDOW_HEAD_CLEARANCE_M = 0.06;
const CORRIDOR_CAP_SILL_ABOVE_YLO_M = 0.42;
const CORRIDOR_CAP_HEAD_CLEARANCE_M = 0.08;
/** Bump to reshuffle all unit facade window layouts (see `BuildFloorMeshesOptions.facadeSalt`). */
export const DEFAULT_EXTERIOR_FACADE_SALT = 1;

/** Room-local X tangent on N/S faces: east wing → +X corner, west wing → −X corner. */
export function exteriorCornerTangentOnNsFace(placedObjectId: string): "min" | "max" {
  if (placedObjectId.startsWith("unit_w_")) return "min";
  return "max";
}

function hashStringToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 0..2^32-1 seed for a single unit face. */
export function facadeSeedForUnitFace(opts: {
  facadeSalt: number;
  storyLevelIndex: number;
  floorDocId: string;
  placedObjectId: string;
  face: CardinalFace;
}): number {
  const s = `${opts.facadeSalt}\0${opts.storyLevelIndex}\0${opts.floorDocId}\0${opts.placedObjectId}\0${opts.face}`;
  return hashStringToUint32(s);
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Architectural façade windows are tiny panels rendered by the thousand (~1,200 on a 19-storey
 * building). `MeshPhysicalMaterial` with `transmission > 0` triggers the backbuffer-sampling
 * refraction path and runs an expensive PBR-plus-IOR fragment shader on every covered pixel —
 * that's a 50+ ms per-frame GPU regression on this scene. At any normal viewing distance a
 * tinted alpha-blended plane is visually indistinguishable from real transmission.
 *
 * Downgraded further from `MeshStandardMaterial` to `MeshBasicMaterial`: glass has no meaningful
 * specular highlight at architectural scale, so the PBR BRDF (GGX, Fresnel) buys us nothing vs.
 * the per-fragment cost on thousands of overlapping transparent panels. Basic runs no lighting
 * shader at all — just `color × opacity` blend — roughly 4-5× cheaper per covered pixel, which
 * matters because overlapping window overdraw stacks 3-4 deep across the visible façade.
 *
 * Keep opacity modest: high + saturated tint reads as a grey/blue slab over the exterior (from
 * inside especially); too low disappears on bright cladding. Near-white tints preserve outdoor
 * color through the blend.
 */
const GLASS_TINT_PRESETS: readonly {
  color: number;
  opacity: number;
}[] = [
  { color: 0xf7fafc, opacity: 0.18 },
  { color: 0xf2f6f9, opacity: 0.2 },
  { color: 0xfbfcfe, opacity: 0.16 },
  { color: 0xf5f8fa, opacity: 0.19 },
  { color: 0xf0f4f8, opacity: 0.21 },
  { color: 0xfafcfd, opacity: 0.17 },
];

const glassMaterialByTintId = new Map<number, THREE.MeshBasicMaterial>();

export function getExteriorWindowGlassMaterial(tintId: number): THREE.MeshBasicMaterial {
  const id = ((tintId % GLASS_TINT_PRESETS.length) + GLASS_TINT_PRESETS.length) % GLASS_TINT_PRESETS.length;
  const cached = glassMaterialByTintId.get(id);
  if (cached) return cached;
  const p = GLASS_TINT_PRESETS[id]!;
  const m = new THREE.MeshBasicMaterial({
    color: p.color,
    transparent: true,
    opacity: p.opacity,
    /** Without this, thousands of back-to-back glass panels at the same Z sort-flicker each frame. */
    depthWrite: false,
    /** Scene fog is grey; mixing it again on window panes dulls the exterior when viewed from units. */
    fog: false,
  });
  glassMaterialByTintId.set(id, m);
  return m;
}

export type UnitExteriorWindowPlan = {
  /** 1–4 segments (windows) along the wall tangent. */
  count: number;
  tintId: number;
  holesEw: WallHoleYZ[];
  holesNs: WallHoleXY[];
};

/** Long façade on the same unit — N/S caps reuse one panel from this face (size + tint). */
function primaryLongFacadeForUnit(placedObjectId: string): "e" | "w" {
  return placedObjectId.startsWith("unit_w_") ? "w" : "e";
}

type PlanLongFacadeOpts = {
  face: "e" | "w";
  vlenX: number;
  vlenZ: number;
  yLo: number;
  yHi: number;
  facadeSalt: number;
  storyLevelIndex: number;
  floorDocId: string;
  placedObjectId: string;
  /** When set, use this segment count instead of the seeded 1–4 draw (for corner sizing). */
  forcedSegmentCount?: number;
};

function narrowestLongFacadePanel(
  holes: readonly WallHoleYZ[],
): WallHoleYZ | null {
  if (holes.length === 0) return null;
  let best = holes[0]!;
  let bestW = Math.abs(best.z1 - best.z0);
  for (let i = 1; i < holes.length; i++) {
    const h = holes[i]!;
    const w = Math.abs(h.z1 - h.z0);
    if (w < bestW) {
      best = h;
      bestW = w;
    }
  }
  return best;
}

/** E/W façade with the most segments that fit — yields the smallest normal window panels. */
export function planSmallestLongFacadeWindowVariant(opts: PlanLongFacadeOpts): UnitExteriorWindowPlan {
  for (let tryN = 4; tryN >= 1; tryN--) {
    const plan = planLongFacadeWindowsForFace({ ...opts, forcedSegmentCount: tryN });
    if (plan.count === tryN) return plan;
  }
  return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
}

function planLongFacadeWindowsForFace(opts: PlanLongFacadeOpts): UnitExteriorWindowPlan {
  const seed = facadeSeedForUnitFace({
    facadeSalt: opts.facadeSalt,
    storyLevelIndex: opts.storyLevelIndex,
    floorDocId: opts.floorDocId,
    placedObjectId: opts.placedObjectId,
    face: opts.face,
  });
  const rnd = mulberry32(seed);

  const tangentSpan = Math.max(0, opts.vlenZ - 2 * EDGE_INSET_M);

  const y0 = opts.yLo + SILL_ABOVE_YLO_M + WINDOW_BOTTOM_TRIM_M;
  const y1 = Math.min(
    opts.yHi - WINDOW_HEAD_CLEARANCE_M,
    opts.yLo + SILL_ABOVE_YLO_M + WINDOW_OPENING_HEIGHT_M,
  );
  if (tangentSpan < MIN_SEGMENT_WIDTH_M || y1 <= y0 + 0.4) {
    return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
  }

  let n =
    opts.forcedSegmentCount !== undefined
      ? opts.forcedSegmentCount
      : 1 + Math.floor(rnd() * 4);
  while (
    n > 1 &&
    tangentSpan < n * MIN_SEGMENT_WIDTH_M + (n - 1) * MULLION_GAP_M
  ) {
    n -= 1;
  }
  if (tangentSpan < MIN_SEGMENT_WIDTH_M + (n - 1) * MULLION_GAP_M) {
    n = 1;
  }

  const tintId = Math.floor(rnd() * GLASS_TINT_PRESETS.length);

  const tMin = -opts.vlenZ * 0.5 + EDGE_INSET_M;
  const tMax = opts.vlenZ * 0.5 - EDGE_INSET_M;

  const usable = tMax - tMin;
  const gapTotal = (n - 1) * MULLION_GAP_M;
  const remaining = usable - gapTotal;
  if (remaining < n * MIN_SEGMENT_WIDTH_M) {
    return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
  }

  const weights: number[] = [];
  let wSum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.88 + rnd() * 0.24;
    weights.push(w);
    wSum += w;
  }
  const widths = weights.map((w) => (w / wSum) * remaining);

  const holesEw: WallHoleYZ[] = [];
  let cursor = tMin;
  for (let i = 0; i < n; i++) {
    const w = widths[i]!;
    const a = cursor;
    const b = cursor + w;
    cursor = b + (i < n - 1 ? MULLION_GAP_M : 0);
    holesEw.push({ z0: a, z1: b, y0, y1 });
  }

  return { count: n, tintId, holesEw, holesNs: [] };
}

/**
 * One E/W façade panel on an N/S cap at the tower corner — exact size of the narrowest panel from
 * the densest (max-segment) normal long-façade variant for that unit, tint from the authored draw.
 */
function planSingleCornerWindowOnNsFace(opts: {
  face: CardinalFace;
  vlenX: number;
  vlenZ: number;
  yLo: number;
  yHi: number;
  facadeSalt: number;
  storyLevelIndex: number;
  floorDocId: string;
  placedObjectId: string;
  wallSpanX?: { min: number; max: number };
}): UnitExteriorWindowPlan {
  const longFace = primaryLongFacadeForUnit(opts.placedObjectId);
  const longPlan = planLongFacadeWindowsForFace({
    face: longFace,
    vlenX: opts.vlenX,
    vlenZ: opts.vlenZ,
    yLo: opts.yLo,
    yHi: opts.yHi,
    facadeSalt: opts.facadeSalt,
    storyLevelIndex: opts.storyLevelIndex,
    floorDocId: opts.floorDocId,
    placedObjectId: opts.placedObjectId,
  });
  if (longPlan.count === 0) {
    return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
  }

  const smallestVariant = planSmallestLongFacadeWindowVariant({
    face: longFace,
    vlenX: opts.vlenX,
    vlenZ: opts.vlenZ,
    yLo: opts.yLo,
    yHi: opts.yHi,
    facadeSalt: opts.facadeSalt,
    storyLevelIndex: opts.storyLevelIndex,
    floorDocId: opts.floorDocId,
    placedObjectId: opts.placedObjectId,
  });
  const ref = narrowestLongFacadePanel(smallestVariant.holesEw);
  if (!ref) {
    return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
  }

  const width = Math.abs(ref.z1 - ref.z0);
  const y0 = ref.y0;
  const y1 = ref.y1;

  const xLo = (opts.wallSpanX?.min ?? -opts.vlenX * 0.5) + EDGE_INSET_M;
  const xHi = (opts.wallSpanX?.max ?? opts.vlenX * 0.5) - EDGE_INSET_M;
  if (width < MIN_SEGMENT_WIDTH_M || xHi - xLo < width + 1e-4 || y1 <= y0 + 0.4) {
    return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
  }

  const corner = exteriorCornerTangentOnNsFace(opts.placedObjectId);
  const x0 = corner === "max" ? xHi - width : xLo;
  const x1 = corner === "max" ? xHi : xLo + width;

  return {
    count: 1,
    tintId: longPlan.tintId,
    holesEw: [],
    holesNs: [{ x0, x1, y0, y1 }],
  };
}

/** Centered tall narrow slit on a corridor north/south end cap. */
export function planCorridorCapExteriorWindow(opts: {
  face: "n" | "s";
  vlenX: number;
  yLo: number;
  yHi: number;
  facadeSalt: number;
  storyLevelIndex: number;
  floorDocId: string;
  placedObjectId: string;
}): UnitExteriorWindowPlan {
  const seed = facadeSeedForUnitFace({
    facadeSalt: opts.facadeSalt,
    storyLevelIndex: opts.storyLevelIndex,
    floorDocId: opts.floorDocId,
    placedObjectId: opts.placedObjectId,
    face: opts.face,
  });
  const rnd = mulberry32(seed);
  const tintId = Math.floor(rnd() * GLASS_TINT_PRESETS.length);

  const tMin = -opts.vlenX * 0.5 + EDGE_INSET_M;
  const tMax = opts.vlenX * 0.5 - EDGE_INSET_M;
  const tangentSpan = tMax - tMin;
  if (tangentSpan < MIN_SEGMENT_WIDTH_M) {
    return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
  }

  const width = Math.min(CORRIDOR_CAP_WINDOW_WIDTH_M, tangentSpan * 0.88);
  const xMid = (tMin + tMax) * 0.5;
  const x0 = xMid - width * 0.5;
  const x1 = xMid + width * 0.5;

  /** Tall slit — same opening height as before, centered on the N/S cap (was sill-anchored and read high). */
  const openingHeight =
    opts.yHi - opts.yLo - CORRIDOR_CAP_SILL_ABOVE_YLO_M - CORRIDOR_CAP_HEAD_CLEARANCE_M;
  const yMid = (opts.yLo + opts.yHi) * 0.5;
  const y0 = yMid - openingHeight * 0.5;
  const y1 = yMid + openingHeight * 0.5;
  if (y1 <= y0 + 0.8) {
    return { count: 0, tintId: 0, holesEw: [], holesNs: [] };
  }

  return {
    count: 1,
    tintId,
    holesEw: [],
    holesNs: [{ x0, x1, y0, y1 }],
  };
}

export function planUnitExteriorWindowsForFace(opts: {
  face: CardinalFace;
  vlenX: number;
  vlenZ: number;
  yLo: number;
  yHi: number;
  facadeSalt: number;
  storyLevelIndex: number;
  floorDocId: string;
  placedObjectId: string;
  wallSpanX?: { min: number; max: number };
}): UnitExteriorWindowPlan {
  if (opts.face === "n" || opts.face === "s") {
    return planSingleCornerWindowOnNsFace(opts);
  }

  return planLongFacadeWindowsForFace({
    face: opts.face,
    vlenX: opts.vlenX,
    vlenZ: opts.vlenZ,
    yLo: opts.yLo,
    yHi: opts.yHi,
    facadeSalt: opts.facadeSalt,
    storyLevelIndex: opts.storyLevelIndex,
    floorDocId: opts.floorDocId,
    placedObjectId: opts.placedObjectId,
  });
}

/**
 * Same `wt` as `addHollowRoomShell` / `addWallConstantXWithHoles` — each window is one slab in the
 * holed wall plane (not a second offset shell), so baked AABBs match `shell_wall_*` and the FP
 * capsule does not fight overlapping volumes.
 */
export const UNIT_SHELL_WALL_THICKNESS_M = 0.11;

/**
 * Glass-filled wall segments in exterior window openings: same box placement and thickness as the
 * plaster `shell_wall_*` pieces (see `addWallConstantXWithHoles`), with glass material in the hole.
 */
export function addUnitExteriorWindowGlassMeshes(
  group: THREE.Group,
  opts: {
    faces: readonly CardinalFace[];
    hx: number;
    hz: number;
    /** Per-face tint (same id as {@link getExteriorWindowGlassMaterial}). */
    tintByFace: Partial<Record<CardinalFace, number>>;
    holesEw: Partial<Record<"e" | "w", readonly WallHoleYZ[]>>;
    holesNs: Partial<Record<"n" | "s", readonly WallHoleXY[]>>;
  },
): void {
  const { hx, hz, faces, tintByFace } = opts;
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  let gi = 0;
  for (const face of faces) {
    const tintId = tintByFace[face] ?? 0;
    const mat = getExteriorWindowGlassMaterial(tintId);
    if (face === "e" || face === "w") {
      const holes = opts.holesEw[face];
      if (!holes?.length) continue;
      const xCenter = face === "e" ? hx - wt * 0.5 : -hx + wt * 0.5;
      for (const h of holes) {
        const z0 = Math.min(h.z0, h.z1);
        const z1 = Math.max(h.z0, h.z1);
        const y0 = Math.min(h.y0, h.y1);
        const y1 = Math.max(h.y0, h.y1);
        const dz = z1 - z0;
        const dy = y1 - y0;
        if (dz < 0.05 || dy < 0.05) continue;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(wt, dy, dz), mat);
        mesh.name = `unit_exterior_glass_${face}_${gi++}`;
        mesh.position.set(xCenter, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    } else {
      const holes = opts.holesNs[face];
      if (!holes?.length) continue;
      const zCenter = face === "n" ? hz - wt * 0.5 : -hz + wt * 0.5;
      for (const h of holes) {
        const x0 = Math.min(h.x0, h.x1);
        const x1 = Math.max(h.x0, h.x1);
        const y0 = Math.min(h.y0, h.y1);
        const y1 = Math.max(h.y0, h.y1);
        const dx = x1 - x0;
        const dy = y1 - y0;
        if (dx < 0.05 || dy < 0.05) continue;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(dx, dy, wt), mat);
        mesh.name = `unit_exterior_glass_${face}_${gi++}`;
        mesh.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, zCenter);
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }
  }
}

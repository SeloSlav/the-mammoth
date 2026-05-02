import * as THREE from "three";
import { ENABLE_STAIRWELL_HEATER_CIGARETTE_LITTER } from "./featureFlags.js";
import type { StairCornerLanding, StairSwitchbackLayout } from "./stairWellGeometry.js";
import { loadPropTemplate } from "./stairWellLandingProps.js";

/** FP client URL; legacy single-cigarette litter (included in multi-variant litter). */
export const STAIRWELL_CIGARETTE_MODEL_URL = "/static/models/objects/used-cigarette.glb";

type StairwellLitterVariantSpec = {
  readonly id: string;
  readonly modelUrl: string;
  /** Longest local bbox axis is scaled so it is about this many meters in world units. */
  readonly targetMaxExtentM: number;
  /** Sampling weight vs other variants (relative; normalized after load failures). */
  readonly weight: number;
};

/** Small trash props scattered on stair landings / tread tops (weighted random placement). */
const STAIRWELL_LITTER_VARIANTS: readonly StairwellLitterVariantSpec[] = [
  {
    id: "cigarette",
    modelUrl: STAIRWELL_CIGARETTE_MODEL_URL,
    targetMaxExtentM: 0.08,
    weight: 4,
  },
  {
    id: "pack",
    modelUrl: "/static/models/objects/empty-cigarette-pack.glb",
    targetMaxExtentM: 0.12,
    weight: 2,
  },
  {
    id: "bottle",
    modelUrl: "/static/models/objects/empty-beer-bottle.glb",
    targetMaxExtentM: 0.28,
    weight: 2,
  },
  {
    id: "can",
    modelUrl: "/static/models/objects/empty-beer-can-ozujsko.glb",
    targetMaxExtentM: 0.13,
    weight: 2,
  },
];

/** Inclusive random count per stair segment (storey); placements may reuse treads/landings. */
const MIN_LITTER_PER_STAIR_SEGMENT = 5;
const MAX_LITTER_PER_STAIR_SEGMENT = 10;

const _instDummy = new THREE.Object3D();
const _instLocal = new THREE.Matrix4();
const _instWorld = new THREE.Matrix4();
const _instSegInv = new THREE.Matrix4();
const _instScratch = new THREE.Matrix4();

type LoadedLitterVariant = {
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  scaleToWorld: number;
  /** Extra radius so frustum sphere covers scaled mesh around each instance origin. */
  frustumOriginPadM: number;
  weight: number;
};

function computeScaleToWorld(geometry: THREE.BufferGeometry, targetMaxExtentM: number): number {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb || bb.isEmpty()) return 0.05;
  const dx = bb.max.x - bb.min.x;
  const dy = bb.max.y - bb.min.y;
  const dz = bb.max.z - bb.min.z;
  const longest = Math.max(dx, dy, dz);
  if (longest < 1e-8) return 0.05;
  return THREE.MathUtils.clamp(targetMaxExtentM / longest, 0.0005, 0.5);
}

function pushLitterInstanceInSegmentSpace(args: {
  segInv: THREE.Matrix4;
  parentWorld: THREE.Matrix4;
  lx: number;
  ly: number;
  lz: number;
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  uniformScale: number;
  out: THREE.Matrix4[];
}): void {
  const { segInv, parentWorld, lx, ly, lz, yawRad, pitchRad, rollRad, uniformScale, out } = args;
  _instDummy.position.set(lx, ly, lz);
  _instDummy.rotation.set(pitchRad, yawRad, rollRad, "XYZ");
  _instDummy.scale.setScalar(uniformScale);
  _instDummy.updateMatrix();
  _instWorld.copy(parentWorld).multiply(_instDummy.matrix);
  _instLocal.copy(segInv).multiply(_instWorld);
  out.push(_instLocal.clone());
}

function setInstancedLitterBoundingSphere(
  inst: THREE.InstancedMesh,
  count: number,
  originPadM: number,
): void {
  if (count <= 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    inst.getMatrixAt(i, _instScratch);
    const e = _instScratch.elements;
    const x = e[12]!;
    const y = e[13]!;
    const z = e[14]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const r =
    Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 0.5 + Math.max(originPadM, 0.04);
  const sphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.max(r, 0.04));
  inst.boundingSphere = sphere;
}

/**
 * Deterministic seed for litter placement (combine plan key + storey index at call sites).
 */
export function stairwellLitterScatterSeed(salt: string, storeyIndex: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h ^ Math.imul(storeyIndex | 0, 2654435761)) >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (found) return;
    if (o instanceof THREE.Mesh) found = o;
  });
  return found;
}

function findLandingMeshForCorner(
  root: THREE.Object3D,
  landing: StairCornerLanding,
): THREE.Mesh | undefined {
  let found: THREE.Mesh | undefined;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.mammothStairCornerLandingRef === landing) found = o;
  });
  return found;
}

function resolveLandingMesh(
  segmentRoot: THREE.Object3D,
  litterSearchRoot: THREE.Object3D,
  landing: StairCornerLanding,
): THREE.Mesh | undefined {
  return (
    findLandingMeshForCorner(segmentRoot, landing) ??
    findLandingMeshForCorner(litterSearchRoot, landing)
  );
}

function findTreadMeshForIndex(root: THREE.Object3D, ti: number): THREE.Mesh | undefined {
  let found: THREE.Mesh | undefined;
  const needle = `stair_tread_${ti}`;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name === needle) found = o;
  });
  return found;
}

function resolveTreadMesh(
  segmentRoot: THREE.Object3D,
  litterSearchRoot: THREE.Object3D,
  ti: number,
): THREE.Mesh | undefined {
  return findTreadMeshForIndex(segmentRoot, ti) ?? findTreadMeshForIndex(litterSearchRoot, ti);
}

let loadedVariants: readonly LoadedLitterVariant[] | null = null;
let sharedInit: Promise<void> | null = null;

async function tryLoadLitterVariant(spec: StairwellLitterVariantSpec): Promise<LoadedLitterVariant | null> {
  try {
    const scene = await loadPropTemplate(spec.modelUrl);
    const src = findFirstMesh(scene);
    if (!src) {
      console.warn(`[stairwellLitter] no mesh in ${spec.modelUrl}`);
      return null;
    }
    const geometry = src.geometry.clone();
    const scaleToWorld = computeScaleToWorld(geometry, spec.targetMaxExtentM);
    const bb = geometry.boundingBox;
    let longest = 0.05;
    if (bb && !bb.isEmpty()) {
      longest = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    }
    const frustumOriginPadM = longest * scaleToWorld * 0.62;
    const m = src.material;
    const material = (Array.isArray(m) ? m[0] : m) as THREE.Material;
    return {
      id: spec.id,
      geometry,
      material,
      scaleToWorld,
      frustumOriginPadM,
      weight: spec.weight,
    };
  } catch (err) {
    console.warn(`[stairwellLitter] failed to load ${spec.modelUrl}:`, err);
    return null;
  }
}

function ensureAllLitterVariantsLoaded(): Promise<void> {
  if (loadedVariants && loadedVariants.length > 0) return Promise.resolve();
  if (sharedInit) return sharedInit;

  sharedInit = Promise.all(STAIRWELL_LITTER_VARIANTS.map((s) => tryLoadLitterVariant(s)))
    .then((rows) => {
      const ok = rows.filter((x): x is LoadedLitterVariant => x !== null);
      if (ok.length === 0) {
        sharedInit = null;
        throw new Error("[stairwellLitter] no litter GLBs could be loaded");
      }
      loadedVariants = ok;
    })
    .catch((err) => {
      sharedInit = null;
      throw err;
    });

  return sharedInit;
}

/**
 * Resolves litter GLBs once; call from FP mount **before** `instantiateBuildingFloorStack` so litter can
 * parent synchronously and survive static floor/stair geometry merge.
 */
export async function ensureStairwellLitterMeshesReady(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!ENABLE_STAIRWELL_HEATER_CIGARETTE_LITTER) return;
  await ensureAllLitterVariantsLoaded();
}

/** @deprecated Prefer {@link ensureStairwellLitterMeshesReady} — loads all stairwell litter props, not only cigarettes. */
export const ensureStairwellCigaretteMeshReady = ensureStairwellLitterMeshesReady;

export type AttachStairwellCigaretteLitterArgs = {
  /** Stair segment group (shaft-local geometry). */
  root: THREE.Group;
  /**
   * Where to find tread/landing meshes: the stair **column** (FP) or floor-plate merge root, not
   * only `root` — after merge, preserved meshes are reparented here while `root` may be orphaned.
   */
  litterSearchRoot: THREE.Object3D;
  L: StairSwitchbackLayout;
  omitOnlyLanding: StairCornerLanding | undefined;
  omitTreads: boolean;
  scatterSeed: number;
};

function weightedVariantIndex(rng: () => number, weights: readonly number[]): number {
  let t = 0;
  for (const w of weights) t += w;
  if (t <= 0) return 0;
  let r = rng() * t;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function placeStairwellLitterSync(args: AttachStairwellCigaretteLitterArgs): void {
  const variants = loadedVariants;
  if (!variants || variants.length === 0) return;

  const rng = mulberry32(args.scatterSeed ^ 0x4f6cdd1d);
  const search = args.litterSearchRoot;
  const segment = args.root;

  type PoolEntry =
    | { kind: "landing"; cl: StairCornerLanding }
    | { kind: "tread"; ti: number };

  const landingPool: PoolEntry[] = [];
  for (const cl of args.L.cornerLandings) {
    if (cl === args.omitOnlyLanding) continue;
    landingPool.push({ kind: "landing", cl });
  }
  const treadPool: PoolEntry[] = [];
  if (!args.omitTreads) {
    for (let ti = 0; ti < args.L.treads.length; ti++) {
      treadPool.push({ kind: "tread", ti });
    }
  }

  const anchors: PoolEntry[] = [...landingPool, ...treadPool];
  if (anchors.length === 0) return;

  const span = MAX_LITTER_PER_STAIR_SEGMENT - MIN_LITTER_PER_STAIR_SEGMENT + 1;
  const wantCount = MIN_LITTER_PER_STAIR_SEGMENT + Math.floor(rng() * span);

  segment.updateMatrixWorld(true);
  _instSegInv.copy(segment.matrixWorld).invert();

  const weights = variants.map((v) => v.weight);
  const buckets: THREE.Matrix4[][] = variants.map(() => []);

  for (let i = 0; i < wantCount; i++) {
    const vi = weightedVariantIndex(rng, weights);
    const v = variants[vi]!;
    const baseScale = v.scaleToWorld;
    const entry =
      i === 0 && landingPool.length > 0
        ? landingPool[Math.floor(rng() * landingPool.length)]!
        : anchors[Math.floor(rng() * anchors.length)]!;
    const variantScale = baseScale * (0.88 + rng() * 0.24);

    if (entry.kind === "landing") {
      const lm = resolveLandingMesh(segment, search, entry.cl);
      if (!lm) continue;
      lm.updateMatrixWorld(true);
      const inset = 0.14;
      const lx = (rng() * 2 - 1) * Math.max(0.05, entry.cl.halfW - inset);
      const lz = (rng() * 2 - 1) * Math.max(0.05, entry.cl.halfD - inset);
      const sy = Math.max(1e-6, Math.abs(lm.scale.y));
      const ly = entry.cl.thicknessHalf * sy + 0.012;
      pushLitterInstanceInSegmentSpace({
        segInv: _instSegInv,
        parentWorld: lm.matrixWorld,
        lx,
        ly,
        lz,
        yawRad: rng() * Math.PI * 2,
        pitchRad: (rng() - 0.5) * 0.35,
        rollRad: (rng() - 0.5) * 0.45,
        uniformScale: variantScale,
        out: buckets[vi]!,
      });
    } else {
      const tr = args.L.treads[entry.ti];
      const tm = resolveTreadMesh(segment, search, entry.ti);
      if (!tr || !tm) continue;
      tm.updateMatrixWorld(true);
      const lx = (rng() * 2 - 1) * tr.halfAlong * 0.62;
      const lz = (rng() * 2 - 1) * tr.halfAcross * 0.42;
      const ly = tr.riseHalf + 0.004;
      pushLitterInstanceInSegmentSpace({
        segInv: _instSegInv,
        parentWorld: tm.matrixWorld,
        lx,
        ly,
        lz,
        yawRad: (rng() - 0.5) * 1.3,
        pitchRad: (rng() - 0.5) * 0.25,
        rollRad: (rng() - 0.5) * 0.35,
        uniformScale: variantScale,
        out: buckets[vi]!,
      });
    }
  }

  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi]!;
    const instanceMatrices = buckets[vi]!;
    const n = instanceMatrices.length;
    if (n === 0) continue;

    const inst = new THREE.InstancedMesh(v.geometry, v.material, n);
    inst.name = `stairwell_litter:${v.id}`;
    inst.userData.mammothStairwellLitter = true;
    inst.userData.mammothSkipFloorGeometryMerge = true;
    inst.userData.mammothNoCollision = true;
    inst.userData.mammothUnitInterior = true;
    inst.castShadow = false;
    inst.receiveShadow = false;
    inst.frustumCulled = true;
    for (let i = 0; i < n; i++) {
      inst.setMatrixAt(i, instanceMatrices[i]!);
    }
    inst.instanceMatrix.needsUpdate = true;
    setInstancedLitterBoundingSphere(inst, n, v.frustumOriginPadM);
    segment.add(inst);
  }
}

/**
 * Places mixed stairwell litter (cigarette butts, packs, bottles, cans) on corner landings and/or tread
 * tops. One {@link THREE.InstancedMesh} per variant per segment (single draw per type, tight frustum
 * sphere). Skips shadow casting.
 */
export function attachStairwellCigaretteLitter(args: AttachStairwellCigaretteLitterArgs): void {
  if (typeof window === "undefined") return;
  if (!ENABLE_STAIRWELL_HEATER_CIGARETTE_LITTER) return;

  if (loadedVariants && loadedVariants.length > 0) {
    placeStairwellLitterSync(args);
    return;
  }

  void ensureAllLitterVariantsLoaded()
    .then(() => {
      placeStairwellLitterSync(args);
    })
    .catch((err) => {
      console.warn("[attachStairwellCigaretteLitter] failed:", err);
    });
}

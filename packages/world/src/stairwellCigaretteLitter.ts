import * as THREE from "three";
import type { StairCornerLanding, StairSwitchbackLayout } from "./stairWellGeometry.js";
import { loadPropTemplate } from "./stairWellLandingProps.js";

/** FP client URL; same origin as other stairwell props. */
export const STAIRWELL_CIGARETTE_MODEL_URL = "/static/models/objects/used-cigarette.glb";

/**
 * After uniform scale, the mesh's longest axis is about this many meters (realistic litter size).
 */
const CIGARETTE_TARGET_MAX_EXTENT_M = 0.08;

/** Inclusive random count per stair segment (storey); placements may reuse treads/landings. */
const MIN_CIGARETTES_PER_STAIR_SEGMENT = 5;
const MAX_CIGARETTES_PER_STAIR_SEGMENT = 10;

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

let sharedGeometry: THREE.BufferGeometry | null = null;
let sharedMaterial: THREE.Material | null = null;
/** Uniform scale so bbox longest edge ≈ `CIGARETTE_TARGET_MAX_EXTENT_M`. */
let cigaretteScaleToWorld: number | null = null;
let sharedInit: Promise<void> | null = null;

function refreshCigaretteAutoscale(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb || bb.isEmpty()) {
    cigaretteScaleToWorld = 0.05;
    return;
  }
  const dx = bb.max.x - bb.min.x;
  const dy = bb.max.y - bb.min.y;
  const dz = bb.max.z - bb.min.z;
  const longest = Math.max(dx, dy, dz);
  if (longest < 1e-8) {
    cigaretteScaleToWorld = 0.05;
    return;
  }
  cigaretteScaleToWorld = THREE.MathUtils.clamp(
    CIGARETTE_TARGET_MAX_EXTENT_M / longest,
    0.0005,
    0.25,
  );
}

function ensureSharedCigaretteMesh(): Promise<void> {
  if (sharedGeometry && sharedMaterial) return Promise.resolve();
  if (sharedInit) return sharedInit;

  sharedInit = loadPropTemplate(STAIRWELL_CIGARETTE_MODEL_URL)
    .then((scene) => {
      const src = findFirstMesh(scene);
      if (!src) return;
      sharedGeometry = src.geometry.clone();
      refreshCigaretteAutoscale(sharedGeometry);
      const m = src.material;
      sharedMaterial = (Array.isArray(m) ? m[0] : m) as THREE.Material;
    })
    .catch((err) => {
      sharedInit = null;
      throw err;
    });

  return sharedInit;
}

/**
 * Resolves the GLB once; call from FP mount **before** `instantiateBuildingFloorStack` so litter can
 * parent synchronously and survive static floor/stair geometry merge (merge runs right after stack build).
 */
export async function ensureStairwellCigaretteMeshReady(): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureSharedCigaretteMesh();
}

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

function placeStairwellCigaretteLitterSync(args: AttachStairwellCigaretteLitterArgs): void {
  if (!sharedGeometry || !sharedMaterial) return;

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

  const span =
    MAX_CIGARETTES_PER_STAIR_SEGMENT - MIN_CIGARETTES_PER_STAIR_SEGMENT + 1;
  const wantCount =
    MIN_CIGARETTES_PER_STAIR_SEGMENT + Math.floor(rng() * span);

  for (let i = 0; i < wantCount; i++) {
    const entry =
      i === 0 && landingPool.length > 0
        ? landingPool[Math.floor(rng() * landingPool.length)]!
        : anchors[Math.floor(rng() * anchors.length)]!;
    const mesh = new THREE.Mesh(sharedGeometry, sharedMaterial);
    mesh.name = `stairwell_cigarette_${i}`;
    mesh.userData.mammothSkipFloorGeometryMerge = true;
    mesh.userData.mammothNoCollision = true;
    mesh.userData.mammothUnitInterior = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const baseScale = cigaretteScaleToWorld ?? 0.05;
    mesh.scale.setScalar(baseScale * (0.88 + rng() * 0.24));

    if (entry.kind === "landing") {
      const lm = resolveLandingMesh(segment, search, entry.cl);
      if (!lm) continue;
      const inset = 0.14;
      const lx = (rng() * 2 - 1) * Math.max(0.05, entry.cl.halfW - inset);
      const lz = (rng() * 2 - 1) * Math.max(0.05, entry.cl.halfD - inset);
      const sy = Math.max(1e-6, Math.abs(lm.scale.y));
      const ly = entry.cl.thicknessHalf * sy + 0.012;
      mesh.position.set(lx, ly, lz);
      mesh.rotation.y = rng() * Math.PI * 2;
      lm.add(mesh);
    } else {
      const tr = args.L.treads[entry.ti];
      const tm = resolveTreadMesh(segment, search, entry.ti);
      if (!tr || !tm) continue;
      const lx = (rng() * 2 - 1) * tr.halfAlong * 0.62;
      const lz = (rng() * 2 - 1) * tr.halfAcross * 0.42;
      const ly = tr.riseHalf + 0.004;
      mesh.position.set(lx, ly, lz);
      mesh.rotation.y = (rng() - 0.5) * 1.3;
      tm.add(mesh);
    }
  }
}

/**
 * Places a random count (default 50–100) of tiny cigarette props per stair segment on corner
 * landings and/or tread tops (same pad/tread may repeat with new random offsets). Count is in
 * `MIN_CIGARETTES_PER_STAIR_SEGMENT`–`MAX_CIGARETTES_PER_STAIR_SEGMENT` inclusive.
 * Uses one shared {@link THREE.BufferGeometry} for all instances in the session (low VRAM, low
 * upload cost); meshes are marked merge-skip so FP static-world merge does not strip them.
 *
 * When the GLB is not ready yet, defers once — for FP, call {@link ensureStairwellCigaretteMeshReady}
 * before stack build so placement runs synchronously and survives merge.
 */
export function attachStairwellCigaretteLitter(args: AttachStairwellCigaretteLitterArgs): void {
  if (typeof window === "undefined") return;

  if (sharedGeometry && sharedMaterial) {
    placeStairwellCigaretteLitterSync(args);
    return;
  }

  void ensureSharedCigaretteMesh()
    .then(() => {
      placeStairwellCigaretteLitterSync(args);
    })
    .catch((err) => {
      console.warn("[attachStairwellCigaretteLitter] failed:", err);
    });
}

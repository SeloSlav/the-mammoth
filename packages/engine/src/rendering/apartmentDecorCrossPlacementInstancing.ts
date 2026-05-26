import * as THREE from "three";
import {
  isApartmentFishTankModelRelPath,
  isApartmentNotebookModelRelPath,
} from "@the-mammoth/schemas";

const APARTMENT_DECOR_MODEL_ROOT = "static/models/";
const APARTMENT_DECOR_MODEL_EXTENSIONS = [".glb", ".obj"] as const;

const GROW_TRAY_MODEL_PATHS = [
  "static/models/objects/grow-tray-empty.glb",
  "static/models/objects/grow-tray.glb",
] as const;

/** Minimum identical placements before batching. */
const MIN_INSTANCES_PER_PATH = 3;

export type ApartmentDecorInstancingBatchSummary = {
  batches: number;
  instances: number;
  paths: string[];
};

export type ApplyApartmentDecorCrossPlacementInstancingOptions = {
  /**
   * Placement roots to consider (world matrices must be current). Defaults to direct
   * children of `batchParent` tagged as decor props.
   */
  placementRoots?: readonly THREE.Object3D[];
};

/** Last rebuild stats — dev console / optional HUD hook. */
let lastInstancingSummary: ApartmentDecorInstancingBatchSummary | null = null;

export function getLastApartmentDecorInstancingSummary(): ApartmentDecorInstancingBatchSummary | null {
  return lastInstancingSummary;
}

function apartmentDecorModelExtension(modelRelPath: string): string | null {
  const lower = modelRelPath.trim().toLowerCase();
  for (const ext of APARTMENT_DECOR_MODEL_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

function normalizeApartmentDecorModelRelPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/+/u, "");
  if (trimmed.includes("..")) return null;
  if (apartmentDecorModelExtension(trimmed) === null) return null;

  const full = trimmed.startsWith(APARTMENT_DECOR_MODEL_ROOT)
    ? trimmed
    : `${APARTMENT_DECOR_MODEL_ROOT}${trimmed}`;
  if (!full.startsWith(APARTMENT_DECOR_MODEL_ROOT)) return null;
  return full;
}

function isGrowTrayModelPath(modelRelPath: string): boolean {
  return GROW_TRAY_MODEL_PATHS.some((p) => modelRelPath.includes(p));
}

function decorPathEligible(modelRelPath: string, placedKind: unknown): boolean {
  const norm = normalizeApartmentDecorModelRelPath(modelRelPath) ?? modelRelPath.trim();
  if (isApartmentFishTankModelRelPath(norm)) return false;
  if (isApartmentNotebookModelRelPath(norm)) return false;
  if (isGrowTrayModelPath(norm)) return false;
  if (typeof placedKind === "string" && placedKind.includes("stash")) return false;
  return true;
}

function isDecorPlacementRoot(obj: THREE.Object3D): boolean {
  if (obj.userData.mammothApartmentDecorInstanced === true) return false;
  if (obj.userData.mammothApartmentDecorProp !== true) return false;
  return typeof obj.userData.mammothApartmentDecorModelRelPath === "string";
}

export function collectApartmentDecorPlacementRoots(
  batchParent: THREE.Object3D,
  options?: ApplyApartmentDecorCrossPlacementInstancingOptions,
): THREE.Object3D[] {
  if (options?.placementRoots !== undefined) {
    return options.placementRoots.filter(isDecorPlacementRoot);
  }
  return batchParent.children.filter(isDecorPlacementRoot);
}

/** Removes prior instanced batches on `batchParent` and unhides source placement roots in its subtree. */
export function clearApartmentDecorCrossPlacementBatches(batchParent: THREE.Object3D): void {
  for (let i = batchParent.children.length - 1; i >= 0; i--) {
    const ch = batchParent.children[i]!;
    if (typeof ch.userData.mammothApartmentDecorInstancedBatch !== "string") continue;
    batchParent.remove(ch);
  }
  batchParent.traverse((obj) => {
    if (obj.userData.mammothApartmentDecorInstanced !== true) return;
    obj.visible = true;
    delete obj.userData.mammothApartmentDecorInstanced;
  });
}

function decorRootHasDedicatedPick(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if (found) return;
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothApartmentStashPick === true) return;
    const name = obj.name;
    if (typeof name === "string" && name.includes("_pick:")) found = true;
  });
  return found;
}

function firstInstancingMesh(root: THREE.Object3D): THREE.Mesh | null {
  let hit: THREE.Mesh | null = null;
  root.traverse((obj) => {
    if (hit || !(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothCeilingLensGlowMesh === true) return;
    if (!(obj.geometry instanceof THREE.BufferGeometry)) return;
    hit = obj;
  });
  return hit;
}

function isDevLog(): boolean {
  try {
    const im = import.meta as unknown as { env?: { DEV?: boolean } };
    return im.env?.DEV === true;
  } catch {
    return false;
  }
}

/**
 * Batches repeated non-interactive decor props into `InstancedMesh`es (same geometry + material).
 * Visuals unchanged — draw-call savings only. Safe to call repeatedly on the same `batchParent`
 * (e.g. stairwell fixtures loading async).
 */
export function applyApartmentDecorCrossPlacementInstancing(
  batchParent: THREE.Object3D,
  options?: ApplyApartmentDecorCrossPlacementInstancingOptions,
): void {
  clearApartmentDecorCrossPlacementBatches(batchParent);
  lastInstancingSummary = null;

  const placementRoots = collectApartmentDecorPlacementRoots(batchParent, options);
  const byPath = new Map<string, THREE.Object3D[]>();

  for (const root of placementRoots) {
    const path = root.userData.mammothApartmentDecorModelRelPath as string;
    if (!decorPathEligible(path, root.userData.mammothApartmentDecorPlacedKind)) continue;
    if (decorRootHasDedicatedPick(root)) continue;
    if (firstInstancingMesh(root) === null) continue;
    const key = normalizeApartmentDecorModelRelPath(path) ?? path;
    const list = byPath.get(key) ?? [];
    list.push(root);
    byPath.set(key, list);
  }

  const scratchMatrix = new THREE.Matrix4();
  const parentInv = new THREE.Matrix4();
  const batchedPaths: string[] = [];
  let batchCount = 0;
  let instanceCount = 0;

  for (const [path, roots] of byPath) {
    if (roots.length < MIN_INSTANCES_PER_PATH) continue;
    const templateMesh = firstInstancingMesh(roots[0]!);
    if (!templateMesh) continue;

    const geometry = templateMesh.geometry;
    const material = templateMesh.material;
    if (Array.isArray(material)) continue;

    const instanced = new THREE.InstancedMesh(geometry, material, roots.length);
    instanced.name = `decor_inst:${path.split("/").pop() ?? path}`;
    instanced.frustumCulled = true;
    instanced.userData.mammothApartmentDecorInstancedBatch = path;
    instanced.userData.mammothSkipFloorGeometryMerge = true;
    instanced.layers.mask = templateMesh.layers.mask;

    batchParent.updateMatrixWorld(true);
    parentInv.copy(batchParent.matrixWorld).invert();

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i]!;
      root.updateMatrixWorld(true);
      scratchMatrix.multiplyMatrices(parentInv, root.matrixWorld);
      instanced.setMatrixAt(i, scratchMatrix);
      root.visible = false;
      root.userData.mammothApartmentDecorInstanced = true;
    }
    instanced.instanceMatrix.needsUpdate = true;
    batchParent.add(instanced);

    batchCount += 1;
    instanceCount += roots.length;
    batchedPaths.push(`${path}×${roots.length}`);
  }

  if (batchCount > 0) {
    lastInstancingSummary = { batches: batchCount, instances: instanceCount, paths: batchedPaths };
    if (isDevLog()) {
      console.info(
        "[apartmentDecorInstancing] batched decor (draw-call savings only; visuals unchanged):",
        lastInstancingSummary,
      );
    }
  } else if (isDevLog() && placementRoots.length > 0) {
    console.info(
      "[apartmentDecorInstancing] no batches — need ≥",
      MIN_INSTANCES_PER_PATH,
      "copies of the same model without stash/fish/notebook picks",
    );
  }
}

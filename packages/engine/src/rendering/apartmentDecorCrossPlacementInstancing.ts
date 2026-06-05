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

const MAMMOTH_EXTERIOR_FACADE_DECOR_UD = "mammothExteriorFacadeDecor";

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

type ApartmentDecorInstancingSector = {
  key: string;
  apartmentUnitKey: string | null;
  plateLevelIndex: number | null;
};

/** Last rebuild stats — dev console / optional HUD hook. */
let lastInstancingSummary: ApartmentDecorInstancingBatchSummary | null = null;

export function getLastApartmentDecorInstancingSummary(): ApartmentDecorInstancingBatchSummary | null {
  return lastInstancingSummary;
}

export type ApartmentDecorInstancingSceneSnapshot = {
  visibleBatches: number;
  visibleInstances: number;
  frustumBatches: number;
  frustumInstances: number;
  hiddenPlacementRoots: number;
  /** Rough draw-call reduction: hidden sources minus visible instanced batches. */
  estDrawCallsSaved: number;
  /** Last rebuild paths from {@link getLastApartmentDecorInstancingSummary}. */
  lastRebuildSummary: string;
};

function objectVisibleInSceneHierarchy(obj: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

/** Live scene scan for profiler HUD / perf ring (cheap traverse). */
export function summarizeApartmentDecorCrossPlacementInstancingInScene(
  sceneRoot: THREE.Object3D,
  frustum?: THREE.Frustum,
): ApartmentDecorInstancingSceneSnapshot {
  let visibleBatches = 0;
  let visibleInstances = 0;
  let frustumBatches = 0;
  let frustumInstances = 0;
  let hiddenPlacementRoots = 0;

  sceneRoot.traverse((obj) => {
    if (obj.userData.mammothApartmentDecorInstanced === true) {
      if (!obj.visible) hiddenPlacementRoots += 1;
      return;
    }
    if (!(obj instanceof THREE.InstancedMesh)) return;
    if (typeof obj.userData.mammothApartmentDecorInstancedBatch !== "string") return;
    if (!objectVisibleInSceneHierarchy(obj)) return;
    visibleBatches += 1;
    visibleInstances += obj.count;
    if (frustum?.intersectsObject(obj)) {
      frustumBatches += 1;
      frustumInstances += obj.count;
    }
  });

  const last = getLastApartmentDecorInstancingSummary();
  return {
    visibleBatches,
    visibleInstances,
    frustumBatches,
    frustumInstances,
    hiddenPlacementRoots,
    estDrawCallsSaved: Math.max(0, hiddenPlacementRoots - visibleBatches),
    lastRebuildSummary: last?.paths.join(", ") ?? "",
  };
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

/**
 * Activates apartment-unit batches from the same authored PVS used by placement roots.
 * Non-unit batches keep their existing visibility owner (for example floor-band culling).
 */
export function syncApartmentDecorCrossPlacementBatchVisibility(
  batchParent: THREE.Object3D,
  options: {
    allowDemand: boolean;
    visibleUnitKeys: ReadonlySet<string> | null;
  },
): void {
  for (const child of batchParent.children) {
    if (typeof child.userData.mammothApartmentDecorInstancedBatch !== "string") continue;
    const unitKey = child.userData.mammothApartmentUnitKey;
    if (typeof unitKey !== "string") continue;
    child.visible =
      options.allowDemand &&
      options.visibleUnitKeys !== null &&
      options.visibleUnitKeys.has(unitKey);
  }
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

function collectInstancingMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothCeilingLensGlowMesh === true) return;
    if (!(obj.geometry instanceof THREE.BufferGeometry)) return;
    meshes.push(obj);
  });
  return meshes;
}

function nearestApartmentDecorInstancingSector(root: THREE.Object3D): ApartmentDecorInstancingSector {
  let apartmentUnitKey: string | null = null;
  let plateLevelIndex: number | null = null;

  for (let cur: THREE.Object3D | null = root; cur; cur = cur.parent) {
    if (apartmentUnitKey === null) {
      const rawUnitKey = cur.userData.mammothApartmentUnitKey;
      if (typeof rawUnitKey === "string" && rawUnitKey.length > 0) {
        apartmentUnitKey = rawUnitKey;
      }
    }
    if (plateLevelIndex === null) {
      const rawLevel = cur.userData.mammothPlateLevelIndex;
      if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
        plateLevelIndex = rawLevel;
      }
    }
    if (apartmentUnitKey !== null && plateLevelIndex !== null) break;
  }

  if (apartmentUnitKey !== null) {
    return {
      key: `unit:${apartmentUnitKey}`,
      apartmentUnitKey,
      plateLevelIndex,
    };
  }
  if (plateLevelIndex !== null) {
    return {
      key: `level:${plateLevelIndex}`,
      apartmentUnitKey,
      plateLevelIndex,
    };
  }
  return {
    key: "global",
    apartmentUnitKey,
    plateLevelIndex,
  };
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
  const bySectorAndPath = new Map<
    string,
    {
      path: string;
      roots: THREE.Object3D[];
      sector: ApartmentDecorInstancingSector;
    }
  >();

  for (const root of placementRoots) {
    const path = root.userData.mammothApartmentDecorModelRelPath as string;
    if (!decorPathEligible(path, root.userData.mammothApartmentDecorPlacedKind)) continue;
    // Facade shutters use a separate exterior visibility path independent of apartment PVS.
    if (root.userData[MAMMOTH_EXTERIOR_FACADE_DECOR_UD] === true) continue;
    if (decorRootHasDedicatedPick(root)) continue;
    if (collectInstancingMeshes(root).length === 0) continue;
    const normalizedPath = normalizeApartmentDecorModelRelPath(path) ?? path;
    const sector = nearestApartmentDecorInstancingSector(root);
    const key = `${sector.key}\n${normalizedPath}`;
    const entry = bySectorAndPath.get(key) ?? {
      path: normalizedPath,
      roots: [],
      sector,
    };
    entry.roots.push(root);
    bySectorAndPath.set(key, entry);
  }

  const scratchMatrix = new THREE.Matrix4();
  const parentInv = new THREE.Matrix4();
  const batchedPaths: string[] = [];
  let batchCount = 0;
  let instanceCount = 0;

  for (const { path, roots, sector } of bySectorAndPath.values()) {
    if (roots.length < MIN_INSTANCES_PER_PATH) continue;
    const templateMeshes = collectInstancingMeshes(roots[0]!);
    if (templateMeshes.length === 0) continue;

    batchParent.updateMatrixWorld(true);
    parentInv.copy(batchParent.matrixWorld).invert();

    let pathBatched = false;
    for (let meshIndex = 0; meshIndex < templateMeshes.length; meshIndex++) {
      const templateMesh = templateMeshes[meshIndex]!;
      const geometry = templateMesh.geometry;
      const material = templateMesh.material;
      if (Array.isArray(material)) continue;

      const instanced = new THREE.InstancedMesh(geometry, material, roots.length);
      instanced.name = `decor_inst:${path.split("/").pop() ?? path}:${templateMesh.name || meshIndex}`;
      instanced.frustumCulled = true;
      instanced.userData.mammothApartmentDecorInstancedBatch = path;
      instanced.userData.mammothApartmentDecorInstancedSectorKey = sector.key;
      instanced.userData.mammothSkipFloorGeometryMerge = true;
      if (sector.apartmentUnitKey !== null) {
        instanced.userData.mammothApartmentUnitKey = sector.apartmentUnitKey;
      }
      if (sector.plateLevelIndex !== null) {
        instanced.userData.mammothPlateLevelIndex = sector.plateLevelIndex;
      }
      instanced.layers.mask = templateMesh.layers.mask;

      for (let i = 0; i < roots.length; i++) {
        const root = roots[i]!;
        root.updateMatrixWorld(true);
        const instanceMeshes = collectInstancingMeshes(root);
        const sourceMesh = instanceMeshes[meshIndex];
        if (!sourceMesh) continue;
        sourceMesh.updateMatrixWorld(true);
        scratchMatrix.multiplyMatrices(parentInv, sourceMesh.matrixWorld);
        instanced.setMatrixAt(i, scratchMatrix);
        if (!pathBatched) {
          root.visible = false;
          root.userData.mammothApartmentDecorInstanced = true;
        }
      }
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingBox();
      instanced.computeBoundingSphere();
      batchParent.add(instanced);
      pathBatched = true;
    }

    if (!pathBatched) continue;

    batchCount += 1;
    instanceCount += roots.length;
    batchedPaths.push(`${sector.key}:${path}×${roots.length}`);
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

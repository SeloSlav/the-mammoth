import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  getMammothDroppedWorldTargetMaxDimM,
  MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M,
} from "@the-mammoth/assets";
import {
  bindMammothMetallicReadableEnv,
  loadGltfSceneFirstMatch,
  mammothCatalogGlbCandidates,
} from "@the-mammoth/engine";
import { DEFAULT_BUILDING_FLOOR_SPACING_M, mammothVerticalStoryBandIndex } from "@the-mammoth/world";
import { apartmentUnitKeyContainingWorldPoint } from "../fpApartment/fpApartmentGameplay.js";
import { POSE_AOI_RECENTER } from "../fpSession/fpSessionConstants.js";
import type { DbConnection } from "../../module_bindings";
import type { DroppedItem } from "../../module_bindings/types";

/** Horizontal pickup radius (m). Keep in sync with `apps/server/src/dropped_item.rs` `PICKUP_RADIUS_SQ`. */
export const MAMMOTH_PICKUP_RADIUS_M = 3.5;
/**
 * Same-band |ΔY| ceiling after vertical storey matched — parachute guard; aligns with server
 * `PICKUP_MAX_ABS_DY_SAME_BAND_M`.
 */
export const MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 1.08;

/** @deprecated Prefer {@link MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M}; kept for stray imports. */
export const MAMMOTH_PICKUP_MAX_ABS_DY_M = MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M;

export type MammothDroppedPickupBandOpts = {
  buildingWorldOriginY: number;
  floorSpacingM: number;
};
const MIN_REASONABLE_MESH_BB_DIM_M = 0.02;
/** Match `apps/server/src/dropped_item.rs` `DROP_Y_LIFT_M` — player drop mesh above replicated feet. */
const DROP_ITEM_Y_LIFT_M = 0.11;

const _dropInstPos = new THREE.Matrix4();
const _dropInstYaw = new THREE.Matrix4();
const _dropInstOut = new THREE.Matrix4();

/**
 * Anchored loot Y includes clearance above the walk slab; player drops add a smaller lift. Either can sit
 * just across a discrete {@link mammothVerticalStoryBandIndex} boundary from feet while still being the
 * same playable floor (common upstairs; ground band 0 is wide enough to hide it).
 */
export function dropVerticalBandMatchesFeet(
  feetY: number,
  dropY: number,
  verticalBands: MammothDroppedPickupBandOpts,
): boolean {
  const oy = verticalBands.buildingWorldOriginY;
  const spacing = verticalBands.floorSpacingM;
  const feetBand = mammothVerticalStoryBandIndex(feetY, oy, spacing);
  const ys = [dropY, dropY - MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M, dropY - DROP_ITEM_Y_LIFT_M];
  for (const y of ys) {
    if (mammothVerticalStoryBandIndex(y, oy, spacing) === feetBand) return true;
  }
  return false;
}

/**
 * `DroppedItem.id` is `u64`; the Spacetime client may surface it as `bigint` or `number`. Mixed `===`
 * checks miss, and async GLB loads then delete the fallback mesh thinking the row vanished.
 */
export function tryNormalizeDroppedItemId(id: unknown): bigint | null {
  if (typeof id === "bigint") return id;
  if (typeof id === "number" && Number.isFinite(id)) return BigInt(Math.trunc(id));
  if (typeof id === "string" && /^[0-9]+$/.test(id)) return BigInt(id);
  return null;
}

/**
 * Render gate for world drops: same vertical storey as feet, and either corridor loot (not inside
 * any unit hull) or loot inside the viewer's current residential unit. Pickup still uses
 * {@link droppedPickupWithinServerVolume}; this only culls replicated GLB meshes from the scene.
 */
export function resolveDroppedItemVisualVisible(input: {
  dropX: number;
  dropY: number;
  dropZ: number;
  feetY: number;
  verticalBands: MammothDroppedPickupBandOpts | null;
  containingUnitKey: string | null;
  dropResidentialUnitKey: string | null;
}): boolean {
  const sameFloor =
    input.verticalBands === null ||
    dropVerticalBandMatchesFeet(input.feetY, input.dropY, input.verticalBands);
  const sameUnit =
    input.containingUnitKey !== null &&
    input.dropResidentialUnitKey !== null &&
    input.dropResidentialUnitKey === input.containingUnitKey;

  if (sameUnit) return true;
  if (!sameFloor) return false;
  if (input.containingUnitKey !== null) {
    return input.dropResidentialUnitKey === null;
  }
  return input.dropResidentialUnitKey === null;
}

export function droppedPickupWithinServerVolume(
  feetX: number,
  feetY: number,
  feetZ: number,
  dropX: number,
  dropY: number,
  dropZ: number,
  radiusM: number = MAMMOTH_PICKUP_RADIUS_M,
  maxAbsDyM: number = MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
  verticalBands?: MammothDroppedPickupBandOpts | null,
): boolean {
  const dx = dropX - feetX;
  const dz = dropZ - feetZ;
  if (dx * dx + dz * dz > radiusM * radiusM) return false;
  if (verticalBands != null && !dropVerticalBandMatchesFeet(feetY, dropY, verticalBands)) {
    return false;
  }
  return Math.abs(dropY - feetY) <= maxAbsDyM;
}

/** Removes an instanced draw batch without disposing shared template geometry/material. */
function detachInstancedMesh(inst: THREE.InstancedMesh): void {
  inst.removeFromParent();
}

/**
 * Uniform scale + Y shift so the longest AABB edge matches the catalog target (meters) and
 * the mesh rests on the placement Y from the server (`@the-mammoth/assets` sizing table).
 */
export function fitDroppedWorldItemModelToCatalog(object: THREE.Object3D, defId: string): void {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, MIN_REASONABLE_MESH_BB_DIM_M);
  const targetM = getMammothDroppedWorldTargetMaxDimM(defId);
  const s = targetM / maxDim;
  object.scale.multiplyScalar(s);

  object.updateWorldMatrix(true, true);
  const boxAfter = new THREE.Box3().setFromObject(object);
  object.position.y -= boxAfter.min.y;
}

export type NearestDroppedPickup = {
  droppedItemId: bigint;
  defId: string;
};

/** Decode `Option<u16>` subscription row shapes — mirrors `username.readOptionalString`. */
export function readOptionalU16(value: unknown): number | undefined {
  if (value == null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null && "tag" in value) {
    const v = value as { tag: string; value?: unknown };
    const tag = String(v.tag).toLowerCase();
    if (tag === "some") {
      if (typeof v.value === "number" && Number.isFinite(v.value)) return v.value;
      if (typeof v.value === "bigint") {
        const n = Number(v.value);
        return Number.isFinite(n) ? n : undefined;
      }
    }
    if (tag === "none") return undefined;
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.some === "number" && Number.isFinite(rec.some)) return rec.some;
  return undefined;
}

/** `true` for server-scheduled anchored world piles (`DroppedItem.world_spawn_slot`). */
export function droppedItemIsWorldAnchor(row: DroppedItem): boolean {
  return readOptionalU16(row.worldSpawnSlot) !== undefined;
}

/** Closest dropped item within pickup volume; optional `predicate` filters candidates first. */
export function findNearestDroppedPickup(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
  radiusM: number = MAMMOTH_PICKUP_RADIUS_M,
  predicate?: (row: DroppedItem) => boolean,
  maxAbsDyM: number = MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
  verticalBands?: MammothDroppedPickupBandOpts | null,
): NearestDroppedPickup | null {
  const pred = predicate ?? (() => true);
  let best: NearestDroppedPickup | null = null;
  let bestDxz = Infinity;
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    if (!pred(row)) continue;
    if (
      !droppedPickupWithinServerVolume(x, y, z, row.x, row.y, row.z, radiusM, maxAbsDyM, verticalBands)
    ) {
      continue;
    }
    const dx = row.x - x;
    const dz = row.z - z;
    const dxz = dx * dx + dz * dz;
    if (dxz < bestDxz) {
      bestDxz = dxz;
      const nid = tryNormalizeDroppedItemId(row.id);
      if (nid === null) continue;
      best = { droppedItemId: nid, defId: row.defId };
    }
  }
  return best;
}

/** Single pass: nearest world-anchor + nearest plain drop within pickup volume (HUD + hold pulse). */
export function findNearestDroppedPickupsHud(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
  radiusM: number = MAMMOTH_PICKUP_RADIUS_M,
  maxAbsDyM: number = MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
  verticalBands?: MammothDroppedPickupBandOpts | null,
): { worldAnchor: NearestDroppedPickup | null; plain: NearestDroppedPickup | null } {
  let bestWorld: NearestDroppedPickup | null = null;
  let bestWorldDxz = Infinity;
  let bestPlain: NearestDroppedPickup | null = null;
  let bestPlainDxz = Infinity;
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    if (!droppedPickupWithinServerVolume(x, y, z, row.x, row.y, row.z, radiusM, maxAbsDyM, verticalBands)) {
      continue;
    }
    const dx = row.x - x;
    const dz = row.z - z;
    const dxz = dx * dx + dz * dz;
    const isWorld = droppedItemIsWorldAnchor(row);
    const nid = tryNormalizeDroppedItemId(row.id);
    if (nid === null) continue;
    const hit: NearestDroppedPickup = { droppedItemId: nid, defId: row.defId };
    if (isWorld) {
      if (dxz < bestWorldDxz) {
        bestWorldDxz = dxz;
        bestWorld = hit;
      }
    } else if (dxz < bestPlainDxz) {
      bestPlainDxz = dxz;
      bestPlain = hit;
    }
  }
  return { worldAnchor: bestWorld, plain: bestPlain };
}

function droppedIdKey(id: DroppedItem["id"]): string {
  const n = tryNormalizeDroppedItemId(id);
  return n !== null ? n.toString() : String(id);
}

function droppedItemRowExists(conn: DbConnection, droppedItemId: bigint): boolean {
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    const id = tryNormalizeDroppedItemId(row.id);
    if (id !== null && id === droppedItemId) return true;
  }
  return false;
}

type DropMeshLayer = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Mesh transform relative to the catalog-fitted drop anchor (yaw + world position applied per instance). */
  localMatrix: THREE.Matrix4;
};

type DefTemplateState =
  | { status: "ready"; layers: DropMeshLayer[] }
  | { status: "glb_unavailable" };

type CachedDropRow = {
  row: DroppedItem;
  dropUnitKey: string | null;
};

type DefInstancedPool = {
  layers: DropMeshLayer[];
  meshes: THREE.InstancedMesh[];
  capacity: number;
};

type FallbackInstancedPool = {
  mesh: THREE.InstancedMesh;
  capacity: number;
};

function extractDropMeshLayers(fittedRoot: THREE.Object3D, defId: string): DropMeshLayer[] {
  fitDroppedWorldItemModelToCatalog(fittedRoot, defId);
  fittedRoot.updateWorldMatrix(true, true);
  const layers: DropMeshLayer[] = [];
  fittedRoot.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material;
    const material = (Array.isArray(mat) ? mat[0] : mat) as THREE.Material;
    if (!material) return;
    // Full matrix under the catalog-fitted root at origin — must not re-base with inv(root)
    // or direct-child meshes lose the uniform shrink from {@link fitDroppedWorldItemModelToCatalog}.
    layers.push({
      geometry: m.geometry as THREE.BufferGeometry,
      material,
      localMatrix: m.matrixWorld.clone(),
    });
  });
  return layers;
}

function composeDropInstanceMatrix(
  row: DroppedItem,
  localMatrix: THREE.Matrix4,
  out: THREE.Matrix4,
): THREE.Matrix4 {
  _dropInstPos.makeTranslation(row.x, row.y, row.z);
  _dropInstYaw.makeRotationY(row.yaw);
  out.multiplyMatrices(_dropInstPos, _dropInstYaw);
  out.multiply(localMatrix);
  return out;
}

function resizeInstancedMesh(
  parent: THREE.Object3D,
  prev: THREE.InstancedMesh | null,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  needed: number,
  name: string,
): { mesh: THREE.InstancedMesh; capacity: number } {
  const capacity = Math.max(needed, prev ? prev.count : 0, 8);
  if (
    prev &&
    prev.instanceMatrix.count >= needed &&
    prev.geometry === geometry &&
    prev.material === material
  ) {
    prev.count = needed;
    prev.visible = needed > 0;
    return { mesh: prev, capacity: prev.instanceMatrix.count };
  }
  if (prev) {
    detachInstancedMesh(prev);
  }
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = needed;
  mesh.visible = needed > 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  parent.add(mesh);
  return { mesh, capacity };
}

export type MountDroppedItemsWorldOptions = {
  /**
   * Vertical storey gates for pickups — aligns with {@link mammothVerticalStoryBandIndex}.
   */
  pickupBandOpts?: MammothDroppedPickupBandOpts | null;
  /**
   * Combat sim arena: show every replicated drop on the pad (skip residential hull culling).
   */
  alwaysShowDroppedItems?: boolean;
  /**
   * Runs immediately before `pickup_dropped_item`. In solo/local play this publishes the current
   * client feet so the server reducer validates against what the player is actually standing on.
   */
  beforePickup?: () => void | Promise<void>;
  /**
   * Called after `pickup_dropped_item` settles and the dropped row is gone from the local cache
   * (server granted the stack). Not called when pickup is a no-op (too far, inventory full, etc.).
   */
  onPickupRemoved?: () => void | Promise<void>;
};

/**
 * Subscribes to dropped items in an XZ AOI, renders GLB (or fallback box), and supports E pickup.
 *
 * Server world-anchor spawns use the **same** table (`world_spawn_slot`): pickup prefers those over
 * player drops inside the reducer path here (mirror legacy world_loot precedence).
 */
export function mountDroppedItemsWorld(
  scene: THREE.Scene,
  conn: DbConnection,
  /** @deprecated Ignored: baseline `SELECT * FROM dropped_item` already replicates all rows. Kept for call-site stability. */
  aoiHalfM: number,
  options?: MountDroppedItemsWorldOptions,
): {
  subscribeAoi: (cx: number, cz: number) => void;
  syncDroppedItemVisualVisibility: (
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
  ) => void;
  tryPickupNearest: (x: number, y: number, z: number) => void;
  dispose: () => void;
} {
  const root = new THREE.Group();
  root.name = "dropped_items";
  scene.add(root);

  const loader = new GLTFLoader();
  const rowCache = new Map<string, CachedDropRow>();
  const defTemplateState = new Map<string, DefTemplateState>();
  const defTemplatePromise = new Map<string, Promise<DefTemplateState>>();
  const defInstancedPools = new Map<string, DefInstancedPool>();
  const fallbackLocalByDefId = new Map<string, THREE.Matrix4>();
  let fallbackPool: FallbackInstancedPool | null = null;
  let sharedFallbackGeometry: THREE.BoxGeometry | null = null;
  let sharedFallbackMaterial: THREE.MeshBasicMaterial | null = null;

  let dbDirty = true;
  let lastVisGate = {
    feetBand: Number.NaN,
    containingUnitKey: null as string | null,
    cellX: Number.NaN,
    cellZ: Number.NaN,
  };

  const metallicReadableEnv = (): THREE.Texture | null => {
    const env = scene.userData.mammothFpMetallicReadableEnv;
    return env instanceof THREE.Texture ? env : (scene.environment ?? null);
  };

  const resolvedBandOpts =
    options?.pickupBandOpts === undefined ? null : options.pickupBandOpts;
  const alwaysShowDroppedItems = options?.alwaysShowDroppedItems === true;

  let sub: { unsubscribe: () => void } | null = null;
  try {
    sub = conn
      .subscriptionBuilder()
      .onApplied(() => {
        syncFromDb();
      })
      .subscribe(["SELECT * FROM dropped_item"]);
  } catch (e) {
    console.warn("[droppedItems] subscribe failed", e);
  }

  const prepareLoadedSceneForTemplate = (rootGltf: THREE.Group): void => {
    rootGltf.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    bindMammothMetallicReadableEnv(rootGltf, metallicReadableEnv());
  };

  const resolveDefTemplate = (defId: string): Promise<DefTemplateState> => {
    const settled = defTemplateState.get(defId);
    if (settled) return Promise.resolve(settled);
    const inflight = defTemplatePromise.get(defId);
    if (inflight) return inflight;

    const candidates = [...mammothCatalogGlbCandidates(defId)];
    if (candidates.length === 0) {
      const st: DefTemplateState = { status: "glb_unavailable" };
      defTemplateState.set(defId, st);
      return Promise.resolve(st);
    }

    const p = loadGltfSceneFirstMatch(loader, candidates)
      .then(({ scene: loadedScene }) => {
        prepareLoadedSceneForTemplate(loadedScene);
        const layers = extractDropMeshLayers(loadedScene, defId);
        if (layers.length === 0) {
          const st: DefTemplateState = { status: "glb_unavailable" };
          defTemplateState.set(defId, st);
          defTemplatePromise.delete(defId);
          return st;
        }
        const st: DefTemplateState = { status: "ready", layers };
        defTemplateState.set(defId, st);
        defTemplatePromise.delete(defId);
        dbDirty = true;
        return st;
      })
      .catch(() => {
        const st: DefTemplateState = { status: "glb_unavailable" };
        defTemplateState.set(defId, st);
        defTemplatePromise.delete(defId);
        return st;
      });

    defTemplatePromise.set(defId, p);
    return p;
  };

  const ensureFallbackLocalMatrix = (defId: string): THREE.Matrix4 => {
    const cached = fallbackLocalByDefId.get(defId);
    if (cached) return cached;
    const staging = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.04, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x9aa8b8 }),
    );
    staging.add(mesh);
    fitDroppedWorldItemModelToCatalog(staging, defId);
    staging.updateWorldMatrix(true, true);
    const local = staging.matrix.clone();
    fallbackLocalByDefId.set(defId, local);
    return local;
  };

  const ensureSharedFallbackAssets = (): {
    geometry: THREE.BoxGeometry;
    material: THREE.MeshBasicMaterial;
  } => {
    if (!sharedFallbackGeometry) {
      sharedFallbackGeometry = new THREE.BoxGeometry(0.14, 0.04, 0.24);
    }
    if (!sharedFallbackMaterial) {
      sharedFallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x9aa8b8 });
    }
    return { geometry: sharedFallbackGeometry, material: sharedFallbackMaterial };
  };

  const visGateChanged = (
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
  ): boolean => {
    const feetBand =
      resolvedBandOpts === null
        ? 0
        : mammothVerticalStoryBandIndex(
            feetY,
            resolvedBandOpts.buildingWorldOriginY,
            resolvedBandOpts.floorSpacingM,
          );
    const cellX = Math.floor(feetX / POSE_AOI_RECENTER);
    const cellZ = Math.floor(feetZ / POSE_AOI_RECENTER);
    if (
      feetBand === lastVisGate.feetBand &&
      containingUnitKey === lastVisGate.containingUnitKey &&
      cellX === lastVisGate.cellX &&
      cellZ === lastVisGate.cellZ
    ) {
      return false;
    }
    lastVisGate = { feetBand, containingUnitKey, cellX, cellZ };
    return true;
  };

  const rowShouldRender = (
    cached: CachedDropRow,
    feetY: number,
    containingUnitKey: string | null,
  ): boolean => {
    if (alwaysShowDroppedItems) return true;
    const row = cached.row;
    return resolveDroppedItemVisualVisible({
      dropX: row.x,
      dropY: row.y,
      dropZ: row.z,
      feetY,
      verticalBands: resolvedBandOpts,
      containingUnitKey,
      dropResidentialUnitKey: cached.dropUnitKey,
    });
  };

  const rebuildInstances = (
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
  ): void => {
    const glbRowsByDef = new Map<string, DroppedItem[]>();
    const fallbackRows: DroppedItem[] = [];

    for (const cached of rowCache.values()) {
      if (!rowShouldRender(cached, feetY, containingUnitKey)) continue;
      const defId = cached.row.defId;
      void resolveDefTemplate(defId);
      const state = defTemplateState.get(defId);
      if (state?.status === "ready") {
        let bucket = glbRowsByDef.get(defId);
        if (!bucket) {
          bucket = [];
          glbRowsByDef.set(defId, bucket);
        }
        bucket.push(cached.row);
      } else {
        fallbackRows.push(cached.row);
      }
    }

    for (const [defId, pool] of defInstancedPools) {
      const rows = glbRowsByDef.get(defId) ?? [];
      glbRowsByDef.delete(defId);
      const needed = rows.length;
      for (let li = 0; li < pool.layers.length; li++) {
        const layer = pool.layers[li]!;
        const prev = pool.meshes[li] ?? null;
        const resized = resizeInstancedMesh(
          root,
          prev,
          layer.geometry,
          layer.material,
          needed,
          `drop_inst:${defId}:${li}`,
        );
        pool.meshes[li] = resized.mesh;
        pool.capacity = resized.capacity;
        for (let i = 0; i < needed; i++) {
          composeDropInstanceMatrix(rows[i]!, layer.localMatrix, _dropInstOut);
          resized.mesh.setMatrixAt(i, _dropInstOut);
        }
        if (needed > 0) {
          resized.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }

    for (const [defId, rows] of glbRowsByDef) {
      const state = defTemplateState.get(defId);
      if (state?.status !== "ready") continue;
      const pool: DefInstancedPool = {
        layers: state.layers,
        meshes: [],
        capacity: 0,
      };
      defInstancedPools.set(defId, pool);
      const needed = rows.length;
      for (let li = 0; li < state.layers.length; li++) {
        const layer = state.layers[li]!;
        const resized = resizeInstancedMesh(
          root,
          null,
          layer.geometry,
          layer.material,
          needed,
          `drop_inst:${defId}:${li}`,
        );
        pool.meshes[li] = resized.mesh;
        pool.capacity = resized.capacity;
        for (let i = 0; i < needed; i++) {
          composeDropInstanceMatrix(rows[i]!, layer.localMatrix, _dropInstOut);
          resized.mesh.setMatrixAt(i, _dropInstOut);
        }
        if (needed > 0) {
          resized.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }

    const fallbackNeeded = fallbackRows.length;
    if (fallbackNeeded > 0) {
      const { geometry, material } = ensureSharedFallbackAssets();
      const prev = fallbackPool?.mesh ?? null;
      const resized = resizeInstancedMesh(
        root,
        prev,
        geometry,
        material,
        fallbackNeeded,
        "drop_inst:fallback",
      );
      fallbackPool = { mesh: resized.mesh, capacity: resized.capacity };
      for (let i = 0; i < fallbackNeeded; i++) {
        const row = fallbackRows[i]!;
        const local = ensureFallbackLocalMatrix(row.defId);
        composeDropInstanceMatrix(row, local, _dropInstOut);
        resized.mesh.setMatrixAt(i, _dropInstOut);
      }
      resized.mesh.instanceMatrix.needsUpdate = true;
    } else if (fallbackPool) {
      fallbackPool.mesh.count = 0;
      fallbackPool.mesh.visible = false;
    }
  };

  const syncFromDb = () => {
    const seen = new Set<string>();
    for (const r of conn.db.dropped_item) {
      const row = r as DroppedItem;
      const key = droppedIdKey(row.id);
      seen.add(key);
      rowCache.set(key, {
        row,
        dropUnitKey: apartmentUnitKeyContainingWorldPoint(conn, row.x, row.y, row.z),
      });
      void resolveDefTemplate(row.defId);
    }
    for (const k of rowCache.keys()) {
      if (!seen.has(k)) rowCache.delete(k);
    }
    dbDirty = true;
  };

  const syncDroppedItemVisualVisibility = (
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
  ): void => {
    if (!dbDirty && !visGateChanged(feetX, feetY, feetZ, containingUnitKey)) return;
    dbDirty = false;
    rebuildInstances(feetX, feetY, feetZ, containingUnitKey);
  };

  const onRowChange = () => {
    syncFromDb();
  };

  conn.db.dropped_item.onInsert(onRowChange);
  conn.db.dropped_item.onUpdate(onRowChange);
  conn.db.dropped_item.onDelete(onRowChange);

  /**
   * Stable dropped-item subscription is owned above. AOI calls are kept for the mount API and resync
   * visuals after spawn / teleport in case rows landed before listeners were wired.
   */
  const subscribeAoi = (_cx: number, _cz: number) => {
    void aoiHalfM;
    syncFromDb();
  };

  syncFromDb();

  const tryPickupNearest = (x: number, y: number, z: number) => {
    if (!conn.identity) return;
    const hit = findNearestDroppedPickup(
      conn,
      x,
      y,
      z,
      MAMMOTH_PICKUP_RADIUS_M,
      (row) => !droppedItemIsWorldAnchor(row),
      MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
      resolvedBandOpts,
    );
    if (!hit) return;
    const droppedItemId = hit.droppedItemId;
    void (async () => {
      try {
        await options?.beforePickup?.();
        await conn.reducers.pickupDroppedItem({ droppedItemId });
      } catch {
        return;
      }
      if (!droppedItemRowExists(conn, droppedItemId)) {
        await options?.onPickupRemoved?.();
      }
    })();
  };

  const dispose = () => {
    conn.db.dropped_item.removeOnInsert(onRowChange);
    conn.db.dropped_item.removeOnUpdate(onRowChange);
    conn.db.dropped_item.removeOnDelete(onRowChange);
    sub?.unsubscribe();
    scene.remove(root);
    for (const pool of defInstancedPools.values()) {
      for (const mesh of pool.meshes) {
        detachInstancedMesh(mesh);
      }
    }
    defInstancedPools.clear();
    if (fallbackPool) {
      detachInstancedMesh(fallbackPool.mesh);
      fallbackPool = null;
    }
    sharedFallbackGeometry?.dispose();
    sharedFallbackGeometry = null;
    sharedFallbackMaterial?.dispose();
    sharedFallbackMaterial = null;
    rowCache.clear();
    defTemplateState.clear();
    defTemplatePromise.clear();
    fallbackLocalByDefId.clear();
  };

  return { subscribeAoi, syncDroppedItemVisualVisibility, tryPickupNearest, dispose };
}

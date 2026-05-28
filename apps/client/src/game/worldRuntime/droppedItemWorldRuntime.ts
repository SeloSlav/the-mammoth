import * as THREE from "three";
import { and } from "spacetimedb";
import { MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M } from "@the-mammoth/assets";
import {
  bindMammothMetallicReadableEnv,
  loadGltfSceneFirstMatch,
  mammothCatalogGlbCandidates,
} from "@the-mammoth/engine";
import { DEFAULT_BUILDING_FLOOR_SPACING_M, mammothVerticalStoryBandIndex } from "@the-mammoth/world";
import { apartmentUnitKeyContainingWorldPoint } from "../fpApartment/fpApartmentGameplay.js";
import { DROPPED_ITEM_RENDER_MAX_HORIZONTAL_M, POSE_AOI_RECENTER } from "../fpSession/fpSessionConstants.js";
import type { DbConnection, SubscriptionHandle } from "../../module_bindings";
import { tables } from "../../module_bindings";
import type { DroppedItem } from "../../module_bindings/types";
import { fitDroppedWorldItemModelToCatalog } from "./droppedItemWorldFit.js";
import {
  attachPickupProxyLayers,
  buildDropMeshLayersFromGltf,
  buildPickupProxyVisualRoot,
  buildProceduralDropMeshLayers,
  type DropMeshLayer,
} from "./droppedItemWorldMesh.js";
import {
  addRowToDefPool,
  addRowToFallbackPool,
  createDefInstancedPool,
  createFallbackPool,
  disposeDefInstancedPools,
  detachFallbackMesh,
  rebuildDefPoolFromRows,
  rebuildFallbackPoolFromRows,
  removeRowFromDefPool,
  removeRowFromFallbackPool,
  type DefInstancedPool,
  type FallbackInstancedPool,
} from "./droppedItemWorldInstancing.js";

export { fitDroppedWorldItemModelToCatalog } from "./droppedItemWorldFit.js";

/** Horizontal pickup radius (m). Keep in sync with `apps/server/src/dropped_item.rs` `PICKUP_RADIUS_SQ`. */
export const MAMMOTH_PICKUP_RADIUS_M = 3.5;
/**
 * Same-band |ΔY| ceiling after vertical storey matched — parachute guard; aligns with server
 * `PICKUP_MAX_ABS_DY_SAME_BAND_M`.
 */
export const MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 1.08;

/** @deprecated Prefer {@link MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M}; kept for stray imports. */
export const MAMMOTH_PICKUP_MAX_ABS_DY_M = MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M;

/** Max horizontal distance (m) to instance a drop on the same storey / unit gate. */
export const MAMMOTH_DROPPED_RENDER_MAX_HORIZONTAL_M = DROPPED_ITEM_RENDER_MAX_HORIZONTAL_M;

/** Match `apps/server/src/dropped_item.rs` `DROP_Y_LIFT_M` — player drop mesh above replicated feet. */
const DROP_ITEM_Y_LIFT_M = 0.11;

export type MammothDroppedPickupBandOpts = {
  buildingWorldOriginY: number;
  floorSpacingM: number;
};

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

/** Y window for spatial `dropped_item` subscriptions around the viewer's storey. */
export function droppedItemSubscriptionYBounds(
  feetY: number,
  verticalBands: MammothDroppedPickupBandOpts | null,
): { yMin: number; yMax: number } | null {
  if (verticalBands === null) return null;
  const { buildingWorldOriginY: oy, floorSpacingM: spacing } = verticalBands;
  const band = mammothVerticalStoryBandIndex(feetY, oy, spacing);
  const yMin = oy + band * spacing - 0.75;
  const yMax =
    oy + (band + 1) * spacing + spacing * 0.12 + MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M + DROP_ITEM_Y_LIFT_M;
  return { yMin, yMax };
}

export function droppedItemWithinRenderHorizontalRange(
  feetX: number,
  feetZ: number,
  dropX: number,
  dropZ: number,
  maxHorizontalM: number = MAMMOTH_DROPPED_RENDER_MAX_HORIZONTAL_M,
): boolean {
  const dx = dropX - feetX;
  const dz = dropZ - feetZ;
  return dx * dx + dz * dz <= maxHorizontalM * maxHorizontalM;
}

export function tryNormalizeDroppedItemId(id: unknown): bigint | null {
  if (typeof id === "bigint") return id;
  if (typeof id === "number" && Number.isFinite(id)) return BigInt(Math.trunc(id));
  if (typeof id === "string" && /^[0-9]+$/.test(id)) return BigInt(id);
  return null;
}

export function resolveDroppedItemVisualVisible(input: {
  dropX: number;
  dropY: number;
  dropZ: number;
  feetX?: number;
  feetZ?: number;
  feetY: number;
  verticalBands: MammothDroppedPickupBandOpts | null;
  containingUnitKey: string | null;
  dropResidentialUnitKey: string | null;
  maxHorizontalM?: number;
}): boolean {
  const sameFloor =
    input.verticalBands === null ||
    dropVerticalBandMatchesFeet(input.feetY, input.dropY, input.verticalBands);
  const sameUnit =
    input.containingUnitKey !== null &&
    input.dropResidentialUnitKey !== null &&
    input.dropResidentialUnitKey === input.containingUnitKey;

  if (sameUnit) {
    if (input.feetX !== undefined && input.feetZ !== undefined) {
      return droppedItemWithinRenderHorizontalRange(
        input.feetX,
        input.feetZ,
        input.dropX,
        input.dropZ,
        input.maxHorizontalM,
      );
    }
    return true;
  }
  if (!sameFloor) return false;
  let corridorLoot = false;
  if (input.containingUnitKey !== null) {
    corridorLoot = input.dropResidentialUnitKey === null;
  } else {
    corridorLoot = input.dropResidentialUnitKey === null;
  }
  if (!corridorLoot) return false;
  if (input.feetX === undefined || input.feetZ === undefined) return true;
  return droppedItemWithinRenderHorizontalRange(
    input.feetX,
    input.feetZ,
    input.dropX,
    input.dropZ,
    input.maxHorizontalM,
  );
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

export type NearestDroppedPickup = {
  droppedItemId: bigint;
  defId: string;
};

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

export function droppedItemIsWorldAnchor(row: DroppedItem): boolean {
  return readOptionalU16(row.worldSpawnSlot) !== undefined;
}

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

type DefTemplateState =
  | { status: "ready"; layers: DropMeshLayer[] }
  | { status: "glb_unavailable" };

type CachedDropRow = {
  row: DroppedItem;
  dropUnitKey: string | null;
};

export type MountDroppedItemsWorldOptions = {
  pickupBandOpts?: MammothDroppedPickupBandOpts | null;
  /** @deprecated Combat sim uses the normal band + horizontal gate. */
  alwaysShowDroppedItems?: boolean;
  beforePickup?: () => void | Promise<void>;
  onPickupRemoved?: () => void | Promise<void>;
};

export function mountDroppedItemsWorld(
  scene: THREE.Scene,
  conn: DbConnection,
  aoiHalfM: number,
  options?: MountDroppedItemsWorldOptions,
): {
  subscribeAoi: (cx: number, cy: number, cz: number) => void;
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
  const pickupProxyRoot = new THREE.Group();
  pickupProxyRoot.name = "dropped_items_pickup_proxy";
  root.add(pickupProxyRoot);

  const rowCache = new Map<string, CachedDropRow>();
  const pickupProxies = new Map<string, THREE.Group>();
  const defTemplateState = new Map<string, DefTemplateState>();
  const defTemplatePromise = new Map<string, Promise<DefTemplateState>>();
  const defInstancedPools = new Map<string, DefInstancedPool>();
  const fallbackLocalByDefId = new Map<string, THREE.Matrix4>();
  let fallbackPool: FallbackInstancedPool | null = null;
  let sharedFallbackGeometry: THREE.BoxGeometry | null = null;
  let sharedFallbackMaterial: THREE.MeshBasicMaterial | null = null;

  let templateReloadPending = false;
  let syncVisibleAtFeetImpl: (
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
    forceFullRebuild: boolean,
  ) => void = () => {};
  let subscriptionFullRebuildPending = true;
  let lastVisGate = {
    feetBand: Number.NaN,
    containingUnitKey: null as string | null,
    cellX: Number.NaN,
    cellZ: Number.NaN,
  };
  let lastSubAnchor = { cellX: Number.NaN, cellZ: Number.NaN, feetBand: Number.NaN };
  let lastRebuildFeet = { x: Number.NaN, z: Number.NaN };
  const RENDER_REBUILD_TRAVEL_M = 12;
  let lastRenderFeet = { x: 0, y: 0, z: 0, unitKey: null as string | null };
  let dropSub: SubscriptionHandle | null = null;

  const renderAnchorMoved = (feetX: number, feetZ: number): boolean => {
    if (!Number.isFinite(lastRebuildFeet.x)) return true;
    const dx = feetX - lastRebuildFeet.x;
    const dz = feetZ - lastRebuildFeet.z;
    return dx * dx + dz * dz >= RENDER_REBUILD_TRAVEL_M * RENDER_REBUILD_TRAVEL_M;
  };

  const resolvedBandOpts =
    options?.pickupBandOpts === undefined ? null : options.pickupBandOpts;
  const alwaysShowDroppedItems = options?.alwaysShowDroppedItems === true;

  const metallicReadableEnv = (): THREE.Texture | null => {
    const env = scene.userData.mammothFpMetallicReadableEnv;
    return env instanceof THREE.Texture ? env : (scene.environment ?? null);
  };

  const prepareLoadedSceneForTemplate = (rootGltf: THREE.Object3D): void => {
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

    const procedural = buildProceduralDropMeshLayers(defId);
    if (procedural && procedural.length > 0) {
      const staging = new THREE.Group();
      for (const layer of procedural) {
        const mesh = new THREE.Mesh(layer.geometry, layer.material);
        mesh.applyMatrix4(layer.localMatrix);
        staging.add(mesh);
      }
      prepareLoadedSceneForTemplate(staging);
      const st: DefTemplateState = { status: "ready", layers: procedural };
      defTemplateState.set(defId, st);
      templateReloadPending = true;
      syncVisibleAtFeetImpl(
        lastRenderFeet.x,
        lastRenderFeet.y,
        lastRenderFeet.z,
        lastRenderFeet.unitKey,
        true,
      );
      return Promise.resolve(st);
    }

    const candidates = [...mammothCatalogGlbCandidates(defId)];
    if (candidates.length === 0) {
      const st: DefTemplateState = { status: "glb_unavailable" };
      defTemplateState.set(defId, st);
      return Promise.resolve(st);
    }

    const p = loadGltfSceneFirstMatch(candidates)
      .then(({ scene: loadedScene }) => {
        prepareLoadedSceneForTemplate(loadedScene);
        const layers = buildDropMeshLayersFromGltf(loadedScene, defId);
        if (layers.length === 0) {
          const st: DefTemplateState = { status: "glb_unavailable" };
          defTemplateState.set(defId, st);
          defTemplatePromise.delete(defId);
          return st;
        }
        const st: DefTemplateState = { status: "ready", layers };
        defTemplateState.set(defId, st);
        defTemplatePromise.delete(defId);
        templateReloadPending = true;
        syncVisibleAtFeetImpl(
          lastRenderFeet.x,
          lastRenderFeet.y,
          lastRenderFeet.z,
          lastRenderFeet.unitKey,
          true,
        );
        return st;
      })
      .catch((err) => {
        console.warn(`[droppedItems] GLB failed for ${defId}`, err);
        const st: DefTemplateState = { status: "glb_unavailable" };
        defTemplateState.set(defId, st);
        defTemplatePromise.delete(defId);
        syncVisibleAtFeetImpl(
          lastRenderFeet.x,
          lastRenderFeet.y,
          lastRenderFeet.z,
          lastRenderFeet.unitKey,
          true,
        );
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
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
  ): boolean => {
    const row = cached.row;
    if (alwaysShowDroppedItems) {
      return droppedItemWithinRenderHorizontalRange(feetX, feetZ, row.x, row.z);
    }
    /** Same volume as pickup / HUD prompts — mission apartment loot must not stay invisible at the sill. */
    if (
      droppedPickupWithinServerVolume(
        feetX,
        feetY,
        feetZ,
        row.x,
        row.y,
        row.z,
        MAMMOTH_PICKUP_RADIUS_M,
        MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
        resolvedBandOpts,
      )
    ) {
      return true;
    }
    return resolveDroppedItemVisualVisible({
      dropX: row.x,
      dropY: row.y,
      dropZ: row.z,
      feetX,
      feetZ,
      feetY,
      verticalBands: resolvedBandOpts,
      containingUnitKey,
      dropResidentialUnitKey: cached.dropUnitKey,
    });
  };

  const ensureDefPool = (defId: string, layers: DropMeshLayer[]): DefInstancedPool => {
    let pool = defInstancedPools.get(defId);
    if (!pool) {
      pool = createDefInstancedPool(layers);
      defInstancedPools.set(defId, pool);
    }
    return pool;
  };

  const ensureFallbackPoolObj = (): FallbackInstancedPool => {
    const { geometry, material } = ensureSharedFallbackAssets();
    if (!fallbackPool) {
      const mesh = new THREE.InstancedMesh(geometry, material, 8);
      mesh.name = "drop_inst:fallback";
      mesh.visible = false;
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      root.add(mesh);
      fallbackPool = createFallbackPool(mesh, 8);
    }
    return fallbackPool;
  };

  const removeVisibleRow = (rowKey: string, defId: string): void => {
    const pool = defInstancedPools.get(defId);
    if (pool?.slotByKey.has(rowKey)) {
      removeRowFromDefPool(pool, rowKey);
      return;
    }
    if (fallbackPool?.slotByKey.has(rowKey)) {
      removeRowFromFallbackPool(fallbackPool, rowKey);
    }
  };

  const addVisibleRow = (rowKey: string, row: DroppedItem): void => {
    const state = defTemplateState.get(row.defId);
    if (state?.status === "ready") {
      const pool = ensureDefPool(row.defId, state.layers);
      addRowToDefPool(root, pool, row.defId, rowKey, row);
      return;
    }
    const fb = ensureFallbackPoolObj();
    const { geometry, material } = ensureSharedFallbackAssets();
    addRowToFallbackPool(root, fb, rowKey, row, ensureFallbackLocalMatrix(row.defId), geometry, material);
  };

  /** Beyond this horizontal distance, visible drops use the shared fallback box (triangle LOD). */
  const dropGlbNearHorizontalMSq =
    (DROPPED_ITEM_RENDER_MAX_HORIZONTAL_M * 0.6) *
    (DROPPED_ITEM_RENDER_MAX_HORIZONTAL_M * 0.6);
  const pickupRadiusSq = MAMMOTH_PICKUP_RADIUS_M * MAMMOTH_PICKUP_RADIUS_M;
  const dropWithinGlbDetailRange = (
    rowX: number,
    rowZ: number,
    rowY: number,
    feetX: number,
    feetY: number,
    feetZ: number,
  ): boolean => {
    const dx = rowX - feetX;
    const dz = rowZ - feetZ;
    if (dx * dx + dz * dz <= pickupRadiusSq) return true;
    if (dx * dx + dz * dz <= dropGlbNearHorizontalMSq) return true;
    return droppedPickupWithinServerVolume(
      feetX,
      feetY,
      feetZ,
      rowX,
      rowY,
      rowZ,
      MAMMOTH_PICKUP_RADIUS_M,
      MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
      resolvedBandOpts,
    );
  };

  const dropWithinPickupVolume = (
    row: DroppedItem,
    feetX: number,
    feetY: number,
    feetZ: number,
  ): boolean =>
    droppedPickupWithinServerVolume(
      feetX,
      feetY,
      feetZ,
      row.x,
      row.y,
      row.z,
      MAMMOTH_PICKUP_RADIUS_M,
      MAMMOTH_PICKUP_MAX_ABS_DY_SAME_BAND_M,
      resolvedBandOpts,
    );

  const fullRebuildInstances = (
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
  ): void => {
    const glbRowsByDef = new Map<string, { rows: DroppedItem[]; keys: string[] }>();
    const fallbackRows: DroppedItem[] = [];
    const fallbackKeys: string[] = [];

    for (const [key, cached] of rowCache) {
      if (!rowShouldRender(cached, feetX, feetY, feetZ, containingUnitKey)) continue;
      if (dropWithinPickupVolume(cached.row, feetX, feetY, feetZ)) continue;
      const defId = cached.row.defId;
      void resolveDefTemplate(defId);
      const state = defTemplateState.get(defId);
      const useGlb =
        state?.status === "ready" &&
        dropWithinGlbDetailRange(
          cached.row.x,
          cached.row.z,
          cached.row.y,
          feetX,
          feetY,
          feetZ,
        );
      if (useGlb) {
        let bucket = glbRowsByDef.get(defId);
        if (!bucket) {
          bucket = { rows: [], keys: [] };
          glbRowsByDef.set(defId, bucket);
        }
        bucket.rows.push(cached.row);
        bucket.keys.push(key);
      } else {
        fallbackRows.push(cached.row);
        fallbackKeys.push(key);
      }
    }

    for (const [defId, pool] of defInstancedPools) {
      const bucket = glbRowsByDef.get(defId);
      if (bucket) {
        rebuildDefPoolFromRows(root, pool, defId, bucket.rows, bucket.keys);
        glbRowsByDef.delete(defId);
      } else {
        clearDefPoolOnly(pool);
      }
    }

    for (const [defId, bucket] of glbRowsByDef) {
      const state = defTemplateState.get(defId);
      if (state?.status !== "ready") continue;
      const pool = ensureDefPool(defId, state.layers);
      rebuildDefPoolFromRows(root, pool, defId, bucket.rows, bucket.keys);
    }

    const { geometry, material } = ensureSharedFallbackAssets();
    if (fallbackRows.length > 0) {
      const fb = ensureFallbackPoolObj();
      rebuildFallbackPoolFromRows(
        root,
        fb,
        fallbackRows,
        fallbackKeys,
        (row) => ensureFallbackLocalMatrix(row.defId),
        geometry,
        material,
      );
    } else if (fallbackPool) {
      clearFallbackPoolOnly(fallbackPool);
    }
  };

  function clearDefPoolOnly(pool: DefInstancedPool): void {
    pool.rows.length = 0;
    pool.rowKeys.length = 0;
    pool.slotByKey.clear();
    for (const mesh of pool.meshes) {
      mesh.count = 0;
      mesh.visible = false;
    }
  }

  function clearFallbackPoolOnly(pool: FallbackInstancedPool): void {
    pool.rows.length = 0;
    pool.rowKeys.length = 0;
    pool.slotByKey.clear();
    pool.mesh.count = 0;
    pool.mesh.visible = false;
  }

  function syncVisibleAtFeet(
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
    forceFullRebuild: boolean,
  ): void {
    lastRenderFeet = { x: feetX, y: feetY, z: feetZ, unitKey: containingUnitKey };
    ingestRowCacheFromDbNearFeet(feetX, feetY, feetZ);
    rebuildPickupProxies(feetX, feetY, feetZ);
    if (
      forceFullRebuild ||
      templateReloadPending ||
      subscriptionFullRebuildPending ||
      visGateChanged(feetX, feetY, feetZ, containingUnitKey) ||
      renderAnchorMoved(feetX, feetZ)
    ) {
      templateReloadPending = false;
      subscriptionFullRebuildPending = false;
      fullRebuildInstances(feetX, feetY, feetZ, containingUnitKey);
      lastRebuildFeet = { x: feetX, z: feetZ };
    }
  }
  syncVisibleAtFeetImpl = syncVisibleAtFeet;

  const cacheRow = (row: DroppedItem): CachedDropRow => {
    const cached: CachedDropRow = {
      row,
      dropUnitKey: apartmentUnitKeyContainingWorldPoint(conn, row.x, row.y, row.z),
    };
    rowCache.set(droppedIdKey(row.id), cached);
    return cached;
  };

  const ingestRowCacheFromDbNearFeet = (feetX: number, feetY: number, feetZ: number): void => {
    for (const r of conn.db.dropped_item) {
      const row = r as DroppedItem;
      if (!dropWithinPickupVolume(row, feetX, feetY, feetZ)) continue;
      cacheRow(row);
      void resolveDefTemplate(row.defId);
    }
  };

  const rebuildPickupProxies = (feetX: number, feetY: number, feetZ: number): void => {
    const active = new Set<string>();
    for (const [key, cached] of rowCache) {
      if (!dropWithinPickupVolume(cached.row, feetX, feetY, feetZ)) continue;
      active.add(key);
      const row = cached.row;
      const state = defTemplateState.get(row.defId);
      const templateKey =
        state?.status === "ready" ? `ready:${state.layers.length}` : state?.status ?? "pending";
      let proxy = pickupProxies.get(key);
      if (!proxy) {
        proxy = new THREE.Group();
        proxy.name = `pickup_proxy:${row.defId}`;
        pickupProxies.set(key, proxy);
        pickupProxyRoot.add(proxy);
      }
      if (proxy.userData.mammothPickupProxyTemplate !== templateKey) {
        proxy.userData.mammothPickupProxyTemplate = templateKey;
        if (state?.status === "ready" && state.layers.length > 0) {
          attachPickupProxyLayers(proxy, state.layers);
        } else {
          proxy.clear();
          proxy.add(buildPickupProxyVisualRoot(row.defId));
        }
      }
      proxy.position.set(row.x, row.y, row.z);
      proxy.rotation.y = row.yaw;
      proxy.visible = true;
    }
    for (const [key, proxy] of pickupProxies) {
      if (active.has(key)) continue;
      proxy.removeFromParent();
      proxy.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material;
        if (!Array.isArray(mat) && mat) mat.dispose();
      });
      pickupProxies.delete(key);
    }
  };

  const fullResyncFromDb = (): void => {
    rowCache.clear();
    for (const r of conn.db.dropped_item) {
      const row = r as DroppedItem;
      cacheRow(row);
      void resolveDefTemplate(row.defId);
    }
    subscriptionFullRebuildPending = true;
  };

  const onInsert = (_ctx: unknown, row: DroppedItem) => {
    const key = droppedIdKey(row.id);
    const cached = cacheRow(row);
    void resolveDefTemplate(row.defId);
    if (rowShouldRender(cached, lastRenderFeet.x, lastRenderFeet.y, lastRenderFeet.z, lastRenderFeet.unitKey)) {
      addVisibleRow(key, row);
    }
  };

  const onUpdate = (_ctx: unknown, _old: DroppedItem, row: DroppedItem) => {
    const key = droppedIdKey(row.id);
    removeVisibleRow(key, _old.defId);
    const cached = cacheRow(row);
    void resolveDefTemplate(row.defId);
    if (rowShouldRender(cached, lastRenderFeet.x, lastRenderFeet.y, lastRenderFeet.z, lastRenderFeet.unitKey)) {
      addVisibleRow(key, row);
    }
  };

  const onDelete = (_ctx: unknown, row: DroppedItem) => {
    const key = droppedIdKey(row.id);
    removeVisibleRow(key, row.defId);
    rowCache.delete(key);
  };

  const buildDropSubscriptionQuery = (cx: number, cy: number, cz: number) => {
    const half = aoiHalfM;
    const x0 = cx - half;
    const x1 = cx + half;
    const z0 = cz - half;
    const z1 = cz + half;
    const yBounds = droppedItemSubscriptionYBounds(cy, resolvedBandOpts);
    if (yBounds) {
      return tables.dropped_item.where((r) =>
        and(
          and(and(r.x.gte(x0), r.x.lte(x1)), and(r.z.gte(z0), r.z.lte(z1))),
          and(r.y.gte(yBounds.yMin), r.y.lte(yBounds.yMax)),
        ),
      );
    }
    return tables.dropped_item.where((r) =>
      and(and(r.x.gte(x0), r.x.lte(x1)), and(r.z.gte(z0), r.z.lte(z1))),
    );
  };

  const subscribeAoi = (cx: number, cy: number, cz: number): void => {
    const cellX = Math.floor(cx / POSE_AOI_RECENTER);
    const cellZ = Math.floor(cz / POSE_AOI_RECENTER);
    const feetBand =
      resolvedBandOpts === null
        ? 0
        : mammothVerticalStoryBandIndex(
            cy,
            resolvedBandOpts.buildingWorldOriginY,
            resolvedBandOpts.floorSpacingM,
          );
    if (
      cellX === lastSubAnchor.cellX &&
      cellZ === lastSubAnchor.cellZ &&
      feetBand === lastSubAnchor.feetBand &&
      dropSub?.isActive()
    ) {
      return;
    }
    lastSubAnchor = { cellX, cellZ, feetBand };

    if (dropSub?.isActive()) {
      dropSub.unsubscribe();
    }
    conn.db.dropped_item.removeOnInsert(onInsert);
    conn.db.dropped_item.removeOnUpdate(onUpdate);
    conn.db.dropped_item.removeOnDelete(onDelete);

    try {
      dropSub = conn
        .subscriptionBuilder()
        .onApplied(() => {
          fullResyncFromDb();
          syncVisibleAtFeet(lastRenderFeet.x, lastRenderFeet.y, lastRenderFeet.z, lastRenderFeet.unitKey, true);
        })
        .subscribe(buildDropSubscriptionQuery(cx, cy, cz));
    } catch (e) {
      console.warn("[droppedItems] spatial subscribe failed", e);
    }

    conn.db.dropped_item.onInsert(onInsert);
    conn.db.dropped_item.onUpdate(onUpdate);
    conn.db.dropped_item.onDelete(onDelete);
  };

  const syncDroppedItemVisualVisibility = (
    feetX: number,
    feetY: number,
    feetZ: number,
    containingUnitKey: string | null,
  ): void => {
    syncVisibleAtFeet(feetX, feetY, feetZ, containingUnitKey, false);
  };

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
    conn.db.dropped_item.removeOnInsert(onInsert);
    conn.db.dropped_item.removeOnUpdate(onUpdate);
    conn.db.dropped_item.removeOnDelete(onDelete);
    if (dropSub?.isActive()) {
      dropSub.unsubscribe();
    }
    dropSub = null;
    scene.remove(root);
    disposeDefInstancedPools(defInstancedPools.values());
    defInstancedPools.clear();
    detachFallbackMesh(fallbackPool);
    fallbackPool = null;
    sharedFallbackGeometry?.dispose();
    sharedFallbackGeometry = null;
    sharedFallbackMaterial?.dispose();
    sharedFallbackMaterial = null;
    rowCache.clear();
    defTemplateState.clear();
    defTemplatePromise.clear();
    fallbackLocalByDefId.clear();
    for (const proxy of pickupProxies.values()) {
      proxy.removeFromParent();
    }
    pickupProxies.clear();
  };

  return { subscribeAoi, syncDroppedItemVisualVisibility, tryPickupNearest, dispose };
}

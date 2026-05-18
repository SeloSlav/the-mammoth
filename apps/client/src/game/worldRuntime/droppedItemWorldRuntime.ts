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

/**
 * Anchored loot Y includes clearance above the walk slab; player drops add a smaller lift. Either can sit
 * just across a discrete {@link mammothVerticalStoryBandIndex} boundary from feet while still being the
 * same playable floor (common upstairs; ground band 0 is wide enough to hide it).
 */
function dropVerticalBandMatchesFeet(
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

function disposeDroppedVisualBranch(rootNode: THREE.Object3D): void {
  rootNode.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) {
      for (const x of mat) x.dispose();
    } else if (mat) {
      mat.dispose();
    }
  });
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

type DroppedGlbTemplate = {
  /** Un-parented master; each drop uses {@link THREE.Object3D.clone}. */
  root: THREE.Object3D;
};

type DefTemplateState =
  | { status: "ready"; template: DroppedGlbTemplate }
  | { status: "glb_unavailable" };

export type MountDroppedItemsWorldOptions = {
  /**
   * Vertical storey gates for pickups — aligns with {@link mammothVerticalStoryBandIndex}.
   */
  pickupBandOpts?: MammothDroppedPickupBandOpts | null;
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
  tryPickupNearest: (x: number, y: number, z: number) => void;
  dispose: () => void;
} {
  const root = new THREE.Group();
  root.name = "dropped_items";
  scene.add(root);

  const loader = new GLTFLoader();
  const idToGroup = new Map<string, THREE.Group>();
  /** Drop rows currently resolving a visual (avoid duplicate async work per id). */
  const rowVisualInFlight = new Set<string>();
  const defTemplateState = new Map<string, DefTemplateState>();
  const defTemplatePromise = new Map<string, Promise<DefTemplateState>>();
  const metallicReadableEnv = (): THREE.Texture | null => {
    const env = scene.userData.mammothFpMetallicReadableEnv;
    return env instanceof THREE.Texture ? env : (scene.environment ?? null);
  };

  const resolvedBandOpts =
    options?.pickupBandOpts === undefined ? null : options.pickupBandOpts;

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
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    bindMammothMetallicReadableEnv(rootGltf, metallicReadableEnv());
  };

  /**
   * One GLB load + parse per `def_id` for the whole session; every dropped row clones the template.
   * Failed catalogs (missing GLB) are remembered so subscription churn does not re-hit the network.
   */
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
        const st: DefTemplateState = {
          status: "ready",
          template: { root: loadedScene },
        };
        defTemplateState.set(defId, st);
        defTemplatePromise.delete(defId);
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

  const applyPose = (g: THREE.Group, row: DroppedItem) => {
    g.position.set(row.x, row.y, row.z);
    g.rotation.y = row.yaw;
  };

  const spawnFallbackBox = (key: string, row: DroppedItem) => {
    /** Unlit so pickups stay visible in dim interiors / WebGPU without relying on scene fill lights. */
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.04, 0.24),
      new THREE.MeshBasicMaterial({ color: 0x9aa8b8 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const inner = new THREE.Group();
    inner.add(mesh);
    fitDroppedWorldItemModelToCatalog(inner, row.defId);
    const g = new THREE.Group();
    g.name = `drop_${key}`;
    g.add(inner);
    applyPose(g, row);
    root.add(g);
    idToGroup.set(key, g);
  };

  const ensureVisual = (row: DroppedItem) => {
    const droppedItemId = tryNormalizeDroppedItemId(row.id);
    if (droppedItemId === null) return;
    const key = droppedItemId.toString();
    const existing = idToGroup.get(key);
    if (existing) {
      applyPose(existing, row);
      return;
    }
    if (rowVisualInFlight.has(key)) {
      const g = idToGroup.get(key);
      if (g) applyPose(g, row);
      return;
    }

    const candidates = [...mammothCatalogGlbCandidates(row.defId)];
    if (candidates.length === 0) {
      spawnFallbackBox(key, row);
      return;
    }

    rowVisualInFlight.add(key);
    spawnFallbackBox(key, row);

    void resolveDefTemplate(row.defId).then((state) => {
      rowVisualInFlight.delete(key);

      const pendingGroup = idToGroup.get(key);
      if (!pendingGroup) {
        // Row was deleted while the GLB was loading; delete handling already removed the fallback.
        return;
      }

      if (state.status === "glb_unavailable") {
        applyPose(pendingGroup, row);
        return;
      }

      root.remove(pendingGroup);
      disposeDroppedVisualBranch(pendingGroup);
      idToGroup.delete(key);

      const clone = state.template.root.clone(true);
      fitDroppedWorldItemModelToCatalog(clone, row.defId);
      const g = new THREE.Group();
      g.name = `drop_${key}`;
      g.add(clone);
      applyPose(g, row);
      root.add(g);
      idToGroup.set(key, g);
    });
  };

  const syncFromDb = () => {
    const seen = new Set<string>();
    for (const r of conn.db.dropped_item) {
      const row = r as DroppedItem;
      seen.add(droppedIdKey(row.id));
      ensureVisual(row);
    }
    for (const [k, g] of idToGroup) {
      if (!seen.has(k)) {
        root.remove(g);
        disposeDroppedVisualBranch(g);
        idToGroup.delete(k);
      }
    }
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
    for (const g of idToGroup.values()) {
      disposeDroppedVisualBranch(g);
    }
    idToGroup.clear();
    rowVisualInFlight.clear();
    defTemplateState.clear();
    defTemplatePromise.clear();
  };

  return { subscribeAoi, tryPickupNearest, dispose };
}

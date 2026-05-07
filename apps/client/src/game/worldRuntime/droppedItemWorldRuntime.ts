import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { and } from "spacetimedb";
import { getMammothDroppedWorldTargetMaxDimM } from "@the-mammoth/assets";
import { loadGltfSceneFirstMatch, mammothCatalogGlbCandidates } from "@the-mammoth/engine";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
import type { DbConnection, SubscriptionHandle } from "../../module_bindings";
import { tables } from "../../module_bindings";
import type { DroppedItem } from "../../module_bindings/types";

/** Horizontal pickup radius (m). Keep in sync with `apps/server/src/dropped_item.rs` `PICKUP_RADIUS_SQ`. */
export const MAMMOTH_PICKUP_RADIUS_M = 3.5;
/**
 * Max |ΔY| (m) between feet and drop for pickup. Matches server `PICKUP_MAX_ABS_DY_M`.
 * Derived as a fraction of storey spacing so it stays **below one storey** (~`60/19` m) — a flat ~4 m
 * cap allowed picking up anchored loot on the deck above/below when XZ matched.
 */
export const MAMMOTH_PICKUP_MAX_ABS_DY_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 0.85;

/** Lower bound for longest mesh AABB edge when fitting (avoids insane scale if GLB bounds are degenerate). */
const MIN_REASONABLE_MESH_BB_DIM_M = 0.02;

export function droppedPickupWithinServerVolume(
  feetX: number,
  feetY: number,
  feetZ: number,
  dropX: number,
  dropY: number,
  dropZ: number,
  radiusM: number = MAMMOTH_PICKUP_RADIUS_M,
  maxAbsDyM: number = MAMMOTH_PICKUP_MAX_ABS_DY_M,
): boolean {
  const dx = dropX - feetX;
  const dz = dropZ - feetZ;
  if (dx * dx + dz * dz > radiusM * radiusM) return false;
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
  maxAbsDyM: number = MAMMOTH_PICKUP_MAX_ABS_DY_M,
): NearestDroppedPickup | null {
  const pred = predicate ?? (() => true);
  let best: NearestDroppedPickup | null = null;
  let bestDxz = Infinity;
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    if (!pred(row)) continue;
    if (!droppedPickupWithinServerVolume(x, y, z, row.x, row.y, row.z, radiusM, maxAbsDyM)) {
      continue;
    }
    const dx = row.x - x;
    const dz = row.z - z;
    const dxz = dx * dx + dz * dz;
    if (dxz < bestDxz) {
      bestDxz = dxz;
      const id = row.id;
      const droppedItemId = typeof id === "bigint" ? id : BigInt(id as number);
      best = { droppedItemId, defId: row.defId };
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
  maxAbsDyM: number = MAMMOTH_PICKUP_MAX_ABS_DY_M,
): { worldAnchor: NearestDroppedPickup | null; plain: NearestDroppedPickup | null } {
  let bestWorld: NearestDroppedPickup | null = null;
  let bestWorldDxz = Infinity;
  let bestPlain: NearestDroppedPickup | null = null;
  let bestPlainDxz = Infinity;
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    if (!droppedPickupWithinServerVolume(x, y, z, row.x, row.y, row.z, radiusM, maxAbsDyM)) {
      continue;
    }
    const dx = row.x - x;
    const dz = row.z - z;
    const dxz = dx * dx + dz * dz;
    const isWorld = droppedItemIsWorldAnchor(row);
    const id = row.id;
    const droppedItemId = typeof id === "bigint" ? id : BigInt(id as number);
    const hit: NearestDroppedPickup = { droppedItemId, defId: row.defId };
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
  return typeof id === "bigint" ? id.toString() : String(id);
}

function droppedItemRowExists(conn: DbConnection, droppedItemId: bigint): boolean {
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    const id = typeof row.id === "bigint" ? row.id : BigInt(row.id as number);
    if (id === droppedItemId) return true;
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

  let droppedSub: SubscriptionHandle | null = null;

  const prepareLoadedSceneForTemplate = (scene: THREE.Group): void => {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
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
      .then(({ scene }) => {
        prepareLoadedSceneForTemplate(scene);
        const st: DefTemplateState = {
          status: "ready",
          template: { root: scene },
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
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.04, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x7a8a9a, metalness: 0.2, roughness: 0.75 }),
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
    const key = droppedIdKey(row.id);
    const droppedItemId = typeof row.id === "bigint" ? row.id : BigInt(row.id as number);
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

      if (!droppedItemRowExists(conn, droppedItemId)) {
        const g = idToGroup.get(key);
        if (g) {
          root.remove(g);
          disposeDroppedVisualBranch(g);
          idToGroup.delete(key);
        }
        return;
      }

      const pendingGroup = idToGroup.get(key);

      if (state.status === "glb_unavailable") {
        if (pendingGroup) applyPose(pendingGroup, row);
        else spawnFallbackBox(key, row);
        return;
      }

      if (pendingGroup) {
        root.remove(pendingGroup);
        disposeDroppedVisualBranch(pendingGroup);
        idToGroup.delete(key);
      }

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

  const subscribeAoi = (cx: number, cz: number) => {
    droppedSub?.unsubscribe();
    const x0 = cx - aoiHalfM;
    const x1 = cx + aoiHalfM;
    const z0 = cz - aoiHalfM;
    const z1 = cz + aoiHalfM;
    const query = tables.dropped_item.where((r) =>
      and(r.x.gte(x0), r.x.lte(x1), r.z.gte(z0), r.z.lte(z1)),
    );
    droppedSub = conn
      .subscriptionBuilder()
      .onApplied(() => {
        syncFromDb();
      })
      .subscribe(query);
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
    );
    if (!hit) return;
    const droppedItemId = hit.droppedItemId;
    void (async () => {
      try {
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
    droppedSub?.unsubscribe();
    droppedSub = null;
    conn.db.dropped_item.removeOnInsert(onRowChange);
    conn.db.dropped_item.removeOnUpdate(onRowChange);
    conn.db.dropped_item.removeOnDelete(onRowChange);
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

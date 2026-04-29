import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { and } from "spacetimedb";
import { loadGltfSceneFirstMatch, mammothCatalogGlbCandidates } from "@the-mammoth/engine";
import type { DbConnection, SubscriptionHandle } from "../../module_bindings";
import { tables } from "../../module_bindings";
import type { DroppedItem } from "../../module_bindings/types";
import { getMammothDroppedWorldModelUrl } from "../../inventory/mammothItemCatalog";

/** Keep in sync with `apps/server/src/dropped_item.rs` `PICKUP_RADIUS_SQ` (√ here). */
export const MAMMOTH_PICKUP_RADIUS_M = 2.75;

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

/** Closest dropped item within `radiusM`; optional `predicate` filters candidates. */
export function findNearestDroppedPickup(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
  radiusM: number = MAMMOTH_PICKUP_RADIUS_M,
  predicate?: (row: DroppedItem) => boolean,
): NearestDroppedPickup | null {
  const pred = predicate ?? (() => true);
  const r2 = radiusM * radiusM;
  let best: NearestDroppedPickup | null = null;
  let bestD = Infinity;
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    if (!pred(row)) continue;
    const dx = row.x - x;
    const dy = row.y - y;
    const dz = row.z - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > r2) continue;
    if (d < bestD) {
      bestD = d;
      const id = row.id;
      const droppedItemId = typeof id === "bigint" ? id : BigInt(id as number);
      best = { droppedItemId, defId: row.defId };
    }
  }
  return best;
}

/** Single pass: nearest world-anchor + nearest plain drop within radius (HUD + hold pulse). */
export function findNearestDroppedPickupsHud(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
  radiusM: number = MAMMOTH_PICKUP_RADIUS_M,
): { worldAnchor: NearestDroppedPickup | null; plain: NearestDroppedPickup | null } {
  const r2 = radiusM * radiusM;
  let bestWorld: NearestDroppedPickup | null = null;
  let bestWorldD = Infinity;
  let bestPlain: NearestDroppedPickup | null = null;
  let bestPlainD = Infinity;
  for (const r of conn.db.dropped_item) {
    const row = r as DroppedItem;
    const dx = row.x - x;
    const dy = row.y - y;
    const dz = row.z - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > r2) continue;
    const isWorld = droppedItemIsWorldAnchor(row);
    const id = row.id;
    const droppedItemId = typeof id === "bigint" ? id : BigInt(id as number);
    const hit: NearestDroppedPickup = { droppedItemId, defId: row.defId };
    if (isWorld) {
      if (d < bestWorldD) {
        bestWorldD = d;
        bestWorld = hit;
      }
    } else if (d < bestPlainD) {
      bestPlainD = d;
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
  const loading = new Set<string>();

  let droppedSub: SubscriptionHandle | null = null;

  const applyPose = (g: THREE.Group, row: DroppedItem) => {
    g.position.set(row.x, row.y, row.z);
    g.rotation.y = row.yaw;
  };

  const spawnFallbackBox = (key: string, row: DroppedItem) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x7a8a9a, metalness: 0.2, roughness: 0.75 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const g = new THREE.Group();
    g.name = `drop_${key}`;
    g.add(mesh);
    applyPose(g, row);
    root.add(g);
    idToGroup.set(key, g);
  };

  const ensureVisual = (row: DroppedItem) => {
    const key = droppedIdKey(row.id);
    const existing = idToGroup.get(key);
    if (existing) {
      applyPose(existing, row);
      return;
    }
    if (loading.has(key)) return;

    const candidates = [...mammothCatalogGlbCandidates(row.defId)];
    if (candidates.length === 0) {
      spawnFallbackBox(key, row);
      return;
    }

    loading.add(key);
    void loadGltfSceneFirstMatch(loader, candidates)
      .then(({ scene }) => {
        loading.delete(key);
        if (idToGroup.has(key)) return;
        const clone = scene.clone(true);
        clone.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        const g = new THREE.Group();
        g.name = `drop_${key}`;
        g.add(clone);
        applyPose(g, row);
        root.add(g);
        idToGroup.set(key, g);
      })
      .catch(() => {
        loading.delete(key);
        if (!idToGroup.has(key)) spawnFallbackBox(key, row);
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
    idToGroup.clear();
  };

  return { subscribeAoi, tryPickupNearest, dispose };
}

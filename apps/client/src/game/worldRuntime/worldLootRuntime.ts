import type { DbConnection } from "../../module_bindings";
import type { WorldLootPickup } from "../../module_bindings/types";

/** Server `world_loot.rs` uses ~2.95 m. */
const RADIUS_M = 2.95;

export type NearestWorldLoot = { lootId: bigint; defId: string; quantity: number };

export function findNearestWorldLoot(
  conn: DbConnection,
  x: number,
  y: number,
  z: number,
  radiusM = RADIUS_M,
): NearestWorldLoot | null {
  const r2 = radiusM * radiusM;
  let best: NearestWorldLoot | null = null;
  let bestD = Infinity;
  for (const row of conn.db.world_loot_pickup) {
    const loot = row as WorldLootPickup;
    const dx = loot.x - x;
    const dy = loot.y - y;
    const dz = loot.z - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > r2 || d >= bestD) continue;
    bestD = d;
    const lid = loot.id;
    const lootId = typeof lid === "bigint" ? lid : BigInt(lid as number);
    best = { lootId, defId: loot.defId, quantity: loot.quantity };
  }
  return best;
}

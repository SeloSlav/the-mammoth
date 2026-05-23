import type { DbConnection } from "../../module_bindings";
import type { CollisionAabb } from "@the-mammoth/world";

const NPC_STATE_DEAD = 2;
const BABUSHKA_BODY_RADIUS_M = 0.28;
const BABUSHKA_BODY_HEIGHT_M = 1.55;
const NPC_FIREARM_LATERAL_INFLATE_M = 0.04;

/** Client-only firearm decal targets — mirrors server `trace_best_npc_hit` capsule sizing. */
export function visitCombatSimNpcFirearmTargetsInXZ(
  conn: DbConnection,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (aabb: CollisionAabb) => void,
): void {
  for (const row of conn.db.world_npc.iter()) {
    if (row.state === NPC_STATE_DEAD || row.health <= 0) continue;
    const pr = BABUSHKA_BODY_RADIUS_M + NPC_FIREARM_LATERAL_INFLATE_M;
    const minX = row.x - pr;
    const maxX = row.x + pr;
    const minZ = row.z - pr;
    const maxZ = row.z + pr;
    if (maxX < x0 || minX > x1 || maxZ < z0 || minZ > z1) continue;
    visit({
      min: [minX, row.y, minZ],
      max: [maxX, row.y + BABUSHKA_BODY_HEIGHT_M, maxZ],
    });
  }
}

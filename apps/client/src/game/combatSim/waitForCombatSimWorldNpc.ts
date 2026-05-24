import type { DbConnection } from "../../module_bindings";
import type { Identity } from "spacetimedb";
import type { WorldNpc } from "../../module_bindings/types";

const COMBAT_SIM_SESSION_PREFIX = "combat_sim:";
const BABUSHKA_ARCHETYPE = "babushka";
const DEFAULT_WAIT_MS = 10_000;

function isCombatSimBabushkaRow(row: WorldNpc, owner: Identity | null | undefined): boolean {
  if (row.archetype !== BABUSHKA_ARCHETYPE) return false;
  if (!row.sessionKey.startsWith(COMBAT_SIM_SESSION_PREFIX)) return false;
  if (!owner) return true;
  return row.chaseIdentity?.isEqual(owner) ?? false;
}

/**
 * `enter_combat_sim` can return before the client's `world_npc` subscription applies the insert.
 * Wait for the babushka row so `createFpNpcSession` does not mount with an empty snapshot.
 */
export function waitForCombatSimBabushkaRow(
  conn: DbConnection,
  timeoutMs = DEFAULT_WAIT_MS,
  owner: Identity | null | undefined = conn.identity,
): Promise<WorldNpc | null> {
  return new Promise((resolve) => {
    for (const row of conn.db.world_npc.iter()) {
      if (isCombatSimBabushkaRow(row, owner)) {
        resolve(row);
        return;
      }
    }

    let settled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    const finish = (row: WorldNpc | null) => {
      if (settled) return;
      settled = true;
      if (poll !== null) clearInterval(poll);
      conn.db.world_npc.removeOnInsert(onInsert);
      resolve(row);
    };

    const onInsert = (_ctx: unknown, row: WorldNpc) => {
      if (isCombatSimBabushkaRow(row, owner)) {
        finish(row);
      }
    };
    conn.db.world_npc.onInsert(onInsert);

    const deadline = performance.now() + timeoutMs;
    poll = setInterval(() => {
      for (const row of conn.db.world_npc.iter()) {
        if (isCombatSimBabushkaRow(row, owner)) {
          finish(row);
          return;
        }
      }
      if (performance.now() >= deadline) {
        finish(null);
      }
    }, 40);
  });
}

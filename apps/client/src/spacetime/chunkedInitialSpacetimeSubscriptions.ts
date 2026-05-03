import type { DbConnection } from "../module_bindings";
import { fpLoadingDbgMark } from "../game/fpSession/fpLoadingDebug.js";
import { yieldToMain } from "../game/fpSession/yieldToMain.js";

/**
 * Full snapshots applied after {@link buildInitialSubscriptionBatches}'s two {@code user} queries.
 *
 * Largest / highest-churn snapshots stay last so chunked applies keep smaller tables between yields.
 *
 * Queries may overlap broader subscriptions elsewhere in this client (e.g. two {@code user} queries);
 * matching rows unify in the WASM cache—the duplicate full-user snapshot is deliberate so batch 0 stays O(1)
 * rows for fast name-gate reducer readiness without dropping multiplayer display-name lookups.
 */
const INITIAL_TABLE_SNAPSHOT_BATCHES_AFTER_USER_PAIR: readonly (readonly string[])[] = [
  [
    "SELECT * FROM inventory_item",
    "SELECT * FROM craft_queue_item",
    "SELECT * FROM hud_toast_event",
    "SELECT * FROM player_vitals",
  ],
  [
    "SELECT * FROM elevator_car",
    "SELECT * FROM elevator_landing_door",
    "SELECT * FROM apartment_unit",
    "SELECT * FROM apartment_door",
    "SELECT * FROM apartment_door_gameplay",
  ],
  [
    "SELECT * FROM chat_message",
    "SELECT * FROM flashlight_charge",
    "SELECT * FROM dropped_item",
    "SELECT * FROM world_sound_event",
  ],
  ["SELECT * FROM player_pose"],
];

/**
 * Baseline batches: [**0**] scoped `user` (this connection), [**1**] full `user`, then prior chunks 2+.
 *
 * Caller must subscribe with identity already set on {@link DbConnection}.
 */
export function buildInitialSubscriptionBatches(
  cc: DbConnection,
): readonly (readonly string[])[] {
  const id = cc.identity;
  const selfScopedUser: readonly string[] =
    id != null
      ? [`SELECT * FROM user WHERE identity = 0x${id.toHexString()}`]
      : ["SELECT * FROM user"];
  const fullUser: readonly string[] = ["SELECT * FROM user"];

  return [selfScopedUser, fullUser, ...INITIAL_TABLE_SNAPSHOT_BATCHES_AFTER_USER_PAIR] as const;
}

export async function runChunkedInitialSpacetimeSubscriptions(
  cc: DbConnection,
  opts: {
    isActive: () => boolean;
    onBatchApplied?: (batchIndex: number, lastBatchIndex: number) => void;
    onAllBatchesCommitted: () => void;
  },
): Promise<void> {
  const batches = buildInitialSubscriptionBatches(cc);
  const lastBatchIndex = batches.length - 1;

  for (let i = 0; i < batches.length; i++) {
    if (!opts.isActive()) return;

    await yieldToMain();

    await new Promise<void>((resolve, reject) => {
      try {
        cc
          .subscriptionBuilder()
          .onApplied(() => {
            if (!opts.isActive()) {
              resolve();
              return;
            }
            fpLoadingDbgMark("spacetime_subscription:baseline_batch_applied", {
              batchIndex: i,
              batchQueryCount: batches[i]!.length,
            });
            opts.onBatchApplied?.(i, lastBatchIndex);
            resolve();
          })
          .subscribe([...batches[i]!]);
      } catch (e) {
        reject(e);
      }
    });

    if (i + 1 < batches.length && opts.isActive()) {
      await yieldToMain();
    }
  }

  if (!opts.isActive()) return;
  opts.onAllBatchesCommitted();
}

import type { DbConnection } from "../module_bindings";
import { fpLoadingDbgMark } from "../game/fpSession/fpLoadingDebug.js";
import { yieldToMain } from "../game/fpSession/yieldToMain.js";

/**
 * Full-table snapshots applied in WASM as one batch per subscribe() call — large baselines peg the
 * main thread until they return. Smaller sequential subs + awaits between them allow input/paint
 * between WASM apply bursts.
 *
 * Queries must stay disjoint from narrower follow-up subscriptions in gameplay (filtered
 * {@code player_pose} AOI, etc.) to avoid duplicated server work — see subscriptions docs on overlap.
 *
 * Largest / highest-churn snapshots are queued last so earlier batches unblock auth UI + smaller tables.
 */
export const INITIAL_SPACETIME_TABLE_QUERY_BATCHES: readonly (readonly string[])[] = [
  ["SELECT * FROM user"],
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

export async function runChunkedInitialSpacetimeSubscriptions(
  cc: DbConnection,
  opts: {
    isActive: () => boolean;
    onBatchApplied?: (batchIndex: number, lastBatchIndex: number) => void;
    onAllBatchesCommitted: () => void;
  },
): Promise<void> {
  const batches = INITIAL_SPACETIME_TABLE_QUERY_BATCHES;
  const lastBatchIndex = batches.length - 1;

  for (let i = 0; i < batches.length; i++) {
    if (!opts.isActive()) return;

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

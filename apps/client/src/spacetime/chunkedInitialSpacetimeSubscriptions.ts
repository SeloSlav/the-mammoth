import type { DbConnection } from "../module_bindings";
import { fpLoadingDbgMark } from "../game/fpSession/fpLoadingDebug.js";
import { yieldToMain } from "../game/fpSession/yieldToMain.js";

/**
 * Baseline table snapshots after batch **0** (self-scoped {@code user}).
 *
 * Largest / highest-churn snapshots stay last so chunked applies keep smaller tables between yields.
 */
const INITIAL_TABLE_SNAPSHOT_BATCHES_AFTER_SELF_USER: readonly (readonly string[])[] = [
  [
    "SELECT * FROM inventory_item",
    "SELECT * FROM craft_queue_item",
    "SELECT * FROM hud_toast_event",
    "SELECT * FROM player_vitals",
    "SELECT * FROM flashlight_charge",
    "SELECT * FROM water_bottle_fill",
    "SELECT * FROM apartment_water_tank",
    "SELECT * FROM dropped_item",
    "SELECT * FROM world_sound_event",
  ],
  [
    "SELECT * FROM elevator_car",
    "SELECT * FROM elevator_landing_door",
    "SELECT * FROM apartment_unit",
    "SELECT * FROM apartment_door",
    "SELECT * FROM apartment_door_gameplay",
  ],
];

/**
 * Baseline batches: [**0**] scoped {@code user}, then inventory/world, elevators/apartments,
 * identity-scoped {@code player_pose} + {@code player_active_hotbar}.
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

  const poseBatch: readonly string[] =
    id != null
      ? [`SELECT * FROM player_pose WHERE identity = 0x${id.toHexString()}`]
      : ["SELECT * FROM player_pose"];

  const hotbarBatch: readonly string[] =
    id != null
      ? [`SELECT * FROM player_active_hotbar WHERE identity = 0x${id.toHexString()}`]
      : ["SELECT * FROM player_active_hotbar"];

  return [selfScopedUser, ...INITIAL_TABLE_SNAPSHOT_BATCHES_AFTER_SELF_USER, poseBatch, hotbarBatch];
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

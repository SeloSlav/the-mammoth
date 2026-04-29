import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import { hotbarInstantConsumeSoundProfile } from "../fpInteraction/fpConsumableUse.js";
import { tryBeginHotbarInstantConsumeCooldown } from "./fpHotbarInstantConsumeCooldown";
import { getHotbarSlotInventoryItem } from "./fpHotbarResolve";
import { playHotbarConsumeLocalAfterServer } from "./hotbarConsumeLocalAudio";
import { setFpHotbarSelectedSlot } from "./fpHotbarSelection";

/**
 * Clears FP hotbar selection synchronously, then primes audio and invokes `consume_hotbar_item`.
 *
 * Selection must be cleared before any `await`: while audio prime and the reducer round-trip
 * run, `getFpHotbarSelectedSlot()` would otherwise still equal the slot being consumed, so a
 * second click or digit press can enqueue another consume (stack drops by 2+).
 */
export async function runFpHotbarInstantConsume(
  conn: DbConnection,
  owner: Identity,
  hotbarSlot: number,
  primeAudio: () => Promise<void>,
  logLabel: string,
): Promise<void> {
  if (!tryBeginHotbarInstantConsumeCooldown(hotbarSlot)) {
    return;
  }

  const row = getHotbarSlotInventoryItem(conn, owner, hotbarSlot);
  const profile = hotbarInstantConsumeSoundProfile(row?.defId ?? "");

  setFpHotbarSelectedSlot(null);
  try {
    await primeAudio();
    await conn.reducers.consumeHotbarItem({ hotbarSlot });
    playHotbarConsumeLocalAfterServer(profile);
  } catch (err) {
    console.warn(`[${logLabel}] consumeHotbarItem failed`, err);
  }
}

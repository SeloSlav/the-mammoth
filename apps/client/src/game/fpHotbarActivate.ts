import type { Identity } from "spacetimedb";
import type { DbConnection } from "../module_bindings";
import { getMammothItemDef, mammothItemDefSupportsHotbarInstantConsume } from "../inventory/mammothItemCatalog";
import { getHotbarSlotInventoryItem } from "./fpHotbarResolve";

/** Hotbar rail size — keep in sync with server `NUM_PLAYER_HOTBAR_SLOTS` and HUD grid. */
export const HOTBAR_SLOT_COUNT = 6;

/**
 * Suppresses duplicate `DigitN` / `NumpadN` events (OS key-repeat, noisy hardware) when the second
 * press would **not** be an intentional instant-consume. **Skipped** when the second press would
 * consume (same slot + instant-use stack) so fast and slow double-taps both work.
 */
export const HOTBAR_DIGIT_DEBOUNCE_MS = 130;

/** True when this hotbar slot holds a stack whose catalog def supports instant hotbar consume. */
export function hotbarSlotHasInstantConsume(
  conn: DbConnection,
  owner: Identity,
  slotIndex: number,
): boolean {
  const row = getHotbarSlotInventoryItem(conn, owner, slotIndex);
  if (!row) return false;
  return mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef(row.defId));
}

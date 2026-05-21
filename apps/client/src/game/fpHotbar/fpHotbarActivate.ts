import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import { getMammothItemDef, mammothItemDefSupportsHotbarInstantConsume } from "../../inventory/mammothItemCatalog";
import { waterBottleFillFraction } from "../../inventory/waterContainerHelpers";
import { getHotbarSlotInventoryItem } from "./fpHotbarResolve";

/** Hotbar rail size — keep in sync with server `NUM_PLAYER_HOTBAR_SLOTS` and HUD grid. */
export const HOTBAR_SLOT_COUNT = 6;

/**
 * Suppresses duplicate `DigitN` / `NumpadN` events (OS key-repeat, noisy hardware) when the second
 * press would **not** be an intentional instant-consume. **Skipped** when the second press would
 * consume (same slot + instant-use stack) so fast and slow double-taps both work. **Skipped** when
 * the rail is already on that slot so the press can unequip to fists (same-slot toggle).
 */
export const HOTBAR_DIGIT_DEBOUNCE_MS = 130;

/**
 * `true` when this key event should be dropped as a noisy duplicate before applying hotbar logic.
 */
export function fpHotbarDigitKeySuppressedByDebounce(options: {
  prevSel: number | null;
  newSlot: number;
  willConsume: boolean;
  keyCode: string;
  lastCode: string;
  lastSlot: number;
  lastAtMs: number;
  nowMs: number;
}): boolean {
  if (options.willConsume) return false;
  if (options.prevSel === options.newSlot) return false;
  return (
    options.keyCode === options.lastCode &&
    options.lastSlot === options.newSlot &&
    options.nowMs - options.lastAtMs < HOTBAR_DIGIT_DEBOUNCE_MS
  );
}

/** True when this hotbar slot supports left-click / double-tap use (consumable or water bottle). */
export function hotbarSlotHasHotbarUseAction(
  conn: DbConnection,
  owner: Identity,
  slotIndex: number,
): boolean {
  const row = getHotbarSlotInventoryItem(conn, owner, slotIndex);
  if (!row) return false;
  const def = getMammothItemDef(row.defId);
  if (!def) return false;
  if (def.waterContainer != null) {
    return (
      waterBottleFillFraction(conn, row.instanceId, def.waterContainer.capacityLiters) >
      0.001
    );
  }
  return mammothItemDefSupportsHotbarInstantConsume(def);
}

/** @deprecated Use {@link hotbarSlotHasHotbarUseAction} — kept for instant-conume-only checks. */
export function hotbarSlotHasInstantConsume(
  conn: DbConnection,
  owner: Identity,
  slotIndex: number,
): boolean {
  const row = getHotbarSlotInventoryItem(conn, owner, slotIndex);
  if (!row) return false;
  return mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef(row.defId));
}

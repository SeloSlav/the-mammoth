import { equippedHeldItemIdFromDefId } from "@the-mammoth/engine";
import type { HeldItemId } from "@the-mammoth/game";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import type { InventoryItem } from "../../module_bindings/types";

export function getHotbarSlotInventoryItem(
  conn: DbConnection,
  owner: Identity,
  slotIndex: number,
): InventoryItem | undefined {
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Hotbar") continue;
    const v = loc.value;
    if (!v.ownerId.isEqual(owner)) continue;
    if (v.slotIndex !== slotIndex) continue;
    return row as InventoryItem;
  }
  return undefined;
}

const RANGED_DEF_IDS = new Set(["pistol", "shotgun-coach"]);

/** True when selected hotbar def is wired to {@link conn.reducers.submitFirearmShot}. */
export function hotbarDefIdSupportsRangedAttack(defId: string | null | undefined): boolean {
  return !!defId && RANGED_DEF_IDS.has(defId);
}

/** `true` only for hotbar items that map to a shipped melee weapon implementation (excludes ranged). */
export function hotbarDefIdSupportsMeleeAttack(defId: string | null | undefined): boolean {
  if (!defId || hotbarDefIdSupportsRangedAttack(defId)) return false;
  return equippedHeldItemIdFromDefId(defId) !== "unarmed";
}

/**
 * Maps the selected hotbar slot (+ DB rows) to the local player's `equippedPrimary`.
 */
export function resolveHeldItemFromHotbar(
  conn: DbConnection,
  owner: Identity,
  selectedSlot: number | null,
): HeldItemId {
  if (selectedSlot === null) return "unarmed";
  const row = getHotbarSlotInventoryItem(conn, owner, selectedSlot);
  if (!row) return "unarmed";
  return equippedHeldItemIdFromDefId(row.defId);
}

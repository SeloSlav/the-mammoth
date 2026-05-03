import { equippedHeldItemIdFromDefId } from "@the-mammoth/engine";
import type { HeldItemId } from "@the-mammoth/game";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import type { InventoryItem } from "../../module_bindings/types";

/** Keep ammo pairing aligned with `apps/server/src/firearm.rs` (`ammo_def_for_weapon`). */
const FIREARM_AMMO_DEF_BY_WEAPON: Readonly<Record<string, string>> = {
  pistol: "ammo-9mm",
  "shotgun-coach": "ammo-shotgun-shell",
};

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

const RANGED_DEF_IDS = new Set(Object.keys(FIREARM_AMMO_DEF_BY_WEAPON));

/** Ammo `def_id` consumed when firing `weaponDefId`, if any. */
export function firearmAmmoDefIdForWeapon(weaponDefId: string): string | undefined {
  return FIREARM_AMMO_DEF_BY_WEAPON[weaponDefId];
}

/**
 * True when the player has at least one round of the correct ammo in **inventory grid or hotbar**
 * (matches server `submit_firearm_shot` carry eligibility — excludes stash).
 */
export function localPlayerHasCarriedAmmoForWeapon(
  conn: DbConnection,
  owner: Identity,
  weaponDefId: string,
): boolean {
  const ammoDef = firearmAmmoDefIdForWeapon(weaponDefId);
  if (!ammoDef) return false;
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Inventory" && loc.tag !== "Hotbar") continue;
    if (!loc.value.ownerId.isEqual(owner)) continue;
    if (row.defId !== ammoDef || row.quantity < 1) continue;
    return true;
  }
  return false;
}

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

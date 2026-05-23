/**
 * Player backpack slot counts — keep in sync with `apps/server/src/inventory/mod.rs`.
 */

/** Backpack slots at spawn (no upgrades). */
export const PLAYER_INVENTORY_BASE_SLOTS = 8 as const;

/** First upgrade tier (+2 slots). Not implemented yet. */
export const PLAYER_INVENTORY_UPGRADE_1_SLOTS = 10 as const;

/** Planned max with all backpack upgrades. */
export const PLAYER_INVENTORY_MAX_SLOTS = 12 as const;

/** HUD grid columns for the inventory panel (base layout is 4×2; max is 4×3). */
export const PLAYER_INVENTORY_GRID_COLS = 4 as const;

/** Hover hint for backpack slots not yet unlocked. */
export const PLAYER_INVENTORY_LOCKED_SLOT_HINT = "Find a bigger backpack." as const;

/** Active backpack slots for the local player (until upgrade reducers exist). */
export function playerInventoryActiveSlotCount(): number {
  return PLAYER_INVENTORY_BASE_SLOTS;
}

/** Inventory HUD always shows the max grid; inactive slots render locked. */
export function playerInventoryHudSlotCount(): number {
  return PLAYER_INVENTORY_MAX_SLOTS;
}

export function isPlayerInventorySlotLocked(
  slotIndex: number,
  activeSlots: number = playerInventoryActiveSlotCount(),
): boolean {
  return slotIndex >= activeSlots && slotIndex < PLAYER_INVENTORY_MAX_SLOTS;
}

export function playerInventoryGridRows(
  activeSlots: number = PLAYER_INVENTORY_BASE_SLOTS,
): number {
  return Math.ceil(activeSlots / PLAYER_INVENTORY_GRID_COLS);
}

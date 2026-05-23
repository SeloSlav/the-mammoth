/**
 * Player backpack slot counts — keep in sync with `apps/server/src/inventory/mod.rs`.
 */

/** Backpack slots at spawn (no upgrades). */
export const PLAYER_INVENTORY_BASE_SLOTS = 8 as const;

/** First upgrade tier (+2 slots). Not implemented yet. */
export const PLAYER_INVENTORY_UPGRADE_1_SLOTS = 10 as const;

/** Planned max with all backpack upgrades. */
export const PLAYER_INVENTORY_MAX_SLOTS = 12 as const;

/** HUD grid columns for the inventory panel (base layout is 4×2). */
export const PLAYER_INVENTORY_GRID_COLS = 4 as const;

export function playerInventoryGridRows(
  activeSlots: number = PLAYER_INVENTORY_BASE_SLOTS,
): number {
  return Math.ceil(activeSlots / PLAYER_INVENTORY_GRID_COLS);
}

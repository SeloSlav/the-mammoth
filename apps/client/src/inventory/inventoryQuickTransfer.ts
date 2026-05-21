import type { MammothPopulatedItem } from "./inventoryDragDropTypes";

/** Index of the first slot whose value is null or undefined, or null if none. */
export function firstEmptySlotIndex<T>(slots: ReadonlyArray<T | null | undefined>): number | null {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] == null) return i;
  }
  return null;
}

function firstMergeSlotIndex(
  destSlots: ReadonlyArray<MammothPopulatedItem | null>,
  moving: MammothPopulatedItem,
): number | null {
  const maxStack = moving.def.maxStack;
  if (maxStack <= 1) return null;
  for (let i = 0; i < destSlots.length; i++) {
    const t = destSlots[i];
    if (t == null) continue;
    if (t.instance.defId !== moving.instance.defId) continue;
    const room = maxStack - t.instance.quantity;
    if (room > 0) return i;
  }
  return null;
}

/**
 * Target index for quick-transfer (e.g. right-click) into `destSlots`:
 * first empty slot, else first slot that can stack-merge with `moving`, else `0` (swap).
 * Matches drag-drop onto a full bar without extra server reducers.
 */
export function destIndexForQuickTransfer(
  destSlots: ReadonlyArray<MammothPopulatedItem | null>,
  moving: MammothPopulatedItem,
): number {
  const empty = firstEmptySlotIndex(destSlots);
  if (empty != null) return empty;
  const merge = firstMergeSlotIndex(destSlots, moving);
  if (merge != null) return merge;
  return 0;
}

export type MammothPlayerCarrySlot =
  | { type: "hotbar"; index: number }
  | { type: "inventory"; index: number };

/**
 * Withdraw / pickup quick-transfer target: prefer hotbar (empty, then merge), then inventory.
 * Matches server `try_grant_stack_to_player` empty-slot order for stash pulls and world loot.
 */
export function destPlayerCarrySlotForQuickTransfer(
  hotbar: ReadonlyArray<MammothPopulatedItem | null>,
  inventory: ReadonlyArray<MammothPopulatedItem | null>,
  moving: MammothPopulatedItem,
): MammothPlayerCarrySlot {
  const hotbarEmpty = firstEmptySlotIndex(hotbar);
  if (hotbarEmpty != null) return { type: "hotbar", index: hotbarEmpty };
  const hotbarMerge = firstMergeSlotIndex(hotbar, moving);
  if (hotbarMerge != null) return { type: "hotbar", index: hotbarMerge };
  return { type: "inventory", index: destIndexForQuickTransfer(inventory, moving) };
}

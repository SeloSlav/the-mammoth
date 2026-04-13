import type { MammothPopulatedItem } from "./inventoryDragDropTypes";

/** Index of the first slot whose value is null or undefined, or null if none. */
export function firstEmptySlotIndex<T>(slots: ReadonlyArray<T | null | undefined>): number | null {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] == null) return i;
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
  for (let i = 0; i < destSlots.length; i++) {
    if (destSlots[i] == null) return i;
  }
  const maxStack = moving.def.maxStack;
  if (maxStack > 1) {
    for (let i = 0; i < destSlots.length; i++) {
      const t = destSlots[i];
      if (t == null) continue;
      if (t.instance.defId !== moving.instance.defId) continue;
      const room = maxStack - t.instance.quantity;
      if (room > 0) return i;
    }
  }
  return 0;
}

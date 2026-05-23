import type { MammothDragSourceSlotInfo } from "./inventoryDragDropTypes";

export type MammothHotLootContext = "player" | "stash";

export function mammothHotLootSlotKey(slotInfo: MammothDragSourceSlotInfo): string {
  return `${slotInfo.type}-${slotInfo.index}`;
}

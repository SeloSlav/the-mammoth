import type { InventoryItem } from "../module_bindings/types";
import type { MammothItemDef } from "./mammothItemCatalogTypes";

export type MammothSlotType = "inventory" | "hotbar" | "stash";

export type MammothDragSourceSlotInfo = {
  type: MammothSlotType;
  index: number;
};

export type MammothPopulatedItem = {
  instance: InventoryItem;
  def: MammothItemDef;
};

export type MammothDraggedItemInfo = {
  item: MammothPopulatedItem;
  sourceSlot: MammothDragSourceSlotInfo;
  /** Stack units carried while dragging (full stack for left-click, half for middle-click split). */
  dragQuantity: number;
};

/** Result of a drag-release from {@link MammothDraggableItem}. */
export type MammothDropResult =
  | { kind: "cancel" }
  | { kind: "world" }
  | { kind: "slot"; slot: MammothDragSourceSlotInfo };

import type { MammothDragSourceSlotInfo, MammothPopulatedItem } from "./inventoryDragDropTypes";

export type SlotGrids = {
  hotbar: Array<MammothPopulatedItem | null>;
  inventory: Array<MammothPopulatedItem | null>;
};

function cloneGrids(g: SlotGrids): SlotGrids {
  return {
    hotbar: [...g.hotbar],
    inventory: [...g.inventory],
  };
}

function getSlot(g: SlotGrids, slot: MammothDragSourceSlotInfo): MammothPopulatedItem | null {
  return slot.type === "hotbar" ? (g.hotbar[slot.index] ?? null) : (g.inventory[slot.index] ?? null);
}

function setSlot(g: SlotGrids, slot: MammothDragSourceSlotInfo, val: MammothPopulatedItem | null) {
  if (slot.type === "hotbar") g.hotbar[slot.index] = val;
  else g.inventory[slot.index] = val;
}

function sameInstance(a: MammothPopulatedItem, b: MammothPopulatedItem): boolean {
  const ia = a.instance.instanceId;
  const ib = b.instance.instanceId;
  return (typeof ia === "bigint" ? ia : BigInt(ia as number)) === (typeof ib === "bigint" ? ib : BigInt(ib as number));
}

/**
 * Client-side prediction matching `apps/server/src/inventory.rs` `move_between_player_slots`
 * (empty slot, merge stacks, or swap).
 */
export function predictSlotMove(
  grids: SlotGrids,
  source: MammothDragSourceSlotInfo,
  dest: MammothDragSourceSlotInfo,
): SlotGrids | null {
  const g = cloneGrids(grids);
  const moving = getSlot(g, source);
  if (!moving) return null;
  if (source.type === dest.type && source.index === dest.index) return null;

  const target = getSlot(g, dest);

  if (!target) {
    setSlot(g, dest, moving);
    setSlot(g, source, null);
    return g;
  }

  if (sameInstance(moving, target)) {
    setSlot(g, dest, moving);
    setSlot(g, source, null);
    return g;
  }

  const maxStack = moving.def.maxStack;
  if (moving.instance.defId === target.instance.defId && maxStack > 1) {
    const room = maxStack - target.instance.quantity;
    const xfer = Math.min(moving.instance.quantity, room);
    if (xfer > 0) {
      const newTargetQty = target.instance.quantity + xfer;
      const newSourceQty = moving.instance.quantity - xfer;
      const deleteSource = newSourceQty === 0;
      setSlot(g, dest, {
        ...target,
        instance: { ...target.instance, quantity: newTargetQty },
      });
      if (deleteSource) setSlot(g, source, null);
      else
        setSlot(g, source, {
          ...moving,
          instance: { ...moving.instance, quantity: newSourceQty },
        });
      return g;
    }
  }

  setSlot(g, dest, moving);
  setSlot(g, source, target);
  return g;
}

/** Full stack leaves the grid (matches current HUD world-drop: entire stack). */
export function predictWorldDrop(
  grids: SlotGrids,
  source: MammothDragSourceSlotInfo,
  quantityToDrop: number,
): SlotGrids | null {
  const g = cloneGrids(grids);
  const moving = getSlot(g, source);
  if (!moving || moving.instance.quantity !== quantityToDrop) return null;
  setSlot(g, source, null);
  return g;
}

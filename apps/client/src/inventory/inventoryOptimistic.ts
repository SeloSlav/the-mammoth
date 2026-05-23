import type { InventoryItem } from "../module_bindings/types";
import type { MammothDragSourceSlotInfo, MammothPopulatedItem } from "./inventoryDragDropTypes";

export type SlotGrids = {
  hotbar: Array<MammothPopulatedItem | null>;
  inventory: Array<MammothPopulatedItem | null>;
  stash?: Array<MammothPopulatedItem | null>;
};

function cloneGrids(g: SlotGrids): SlotGrids {
  return {
    hotbar: [...g.hotbar],
    inventory: [...g.inventory],
    ...(g.stash ? { stash: [...g.stash] } : {}),
  };
}

function getSlot(g: SlotGrids, slot: MammothDragSourceSlotInfo): MammothPopulatedItem | null {
  if (slot.type === "hotbar") return g.hotbar[slot.index] ?? null;
  if (slot.type === "inventory") return g.inventory[slot.index] ?? null;
  return g.stash?.[slot.index] ?? null;
}

function setSlot(g: SlotGrids, slot: MammothDragSourceSlotInfo, val: MammothPopulatedItem | null) {
  if (slot.type === "hotbar") {
    g.hotbar[slot.index] = val;
  } else if (slot.type === "inventory") {
    g.inventory[slot.index] = val;
  } else if (g.stash) {
    g.stash[slot.index] = val;
  }
}

function sameInstance(a: MammothPopulatedItem, b: MammothPopulatedItem): boolean {
  const ia = a.instance.instanceId;
  const ib = b.instance.instanceId;
  return (typeof ia === "bigint" ? ia : BigInt(ia as number)) === (typeof ib === "bigint" ? ib : BigInt(ib as number));
}

function instanceIdKey(id: InventoryItem["instanceId"]): string {
  return typeof id === "bigint" ? id.toString() : BigInt(id as number).toString();
}

function slotPopulationMatch(a: MammothPopulatedItem | null, b: MammothPopulatedItem | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    instanceIdKey(a.instance.instanceId) === instanceIdKey(b.instance.instanceId) &&
    a.instance.quantity === b.instance.quantity
  );
}

function slotSemanticMatch(a: MammothPopulatedItem | null, b: MammothPopulatedItem | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.instance.defId === b.instance.defId && a.instance.quantity === b.instance.quantity;
}

/** Match slot contents by def + quantity (ignores instance id — used after stack splits). */
export function inventorySlotGridsSemanticallyMatch(a: SlotGrids, b: SlotGrids): boolean {
  if (a.hotbar.length !== b.hotbar.length || a.inventory.length !== b.inventory.length) return false;
  for (let i = 0; i < a.hotbar.length; i++) {
    if (!slotSemanticMatch(a.hotbar[i] ?? null, b.hotbar[i] ?? null)) return false;
  }
  for (let i = 0; i < a.inventory.length; i++) {
    if (!slotSemanticMatch(a.inventory[i] ?? null, b.inventory[i] ?? null)) return false;
  }
  if (a.stash || b.stash) {
    if (!a.stash || !b.stash || a.stash.length !== b.stash.length) return false;
    for (let i = 0; i < a.stash.length; i++) {
      if (!slotSemanticMatch(a.stash[i] ?? null, b.stash[i] ?? null)) return false;
    }
  }
  return true;
}

/** True when replicated grids match an optimistic snapshot (clears client overlay without flicker). */
export function inventorySlotGridsMatch(a: SlotGrids, b: SlotGrids): boolean {
  if (a.hotbar.length !== b.hotbar.length || a.inventory.length !== b.inventory.length) return false;
  for (let i = 0; i < a.hotbar.length; i++) {
    if (!slotPopulationMatch(a.hotbar[i] ?? null, b.hotbar[i] ?? null)) return false;
  }
  for (let i = 0; i < a.inventory.length; i++) {
    if (!slotPopulationMatch(a.inventory[i] ?? null, b.inventory[i] ?? null)) return false;
  }
  if (a.stash || b.stash) {
    if (!a.stash || !b.stash || a.stash.length !== b.stash.length) return false;
    for (let i = 0; i < a.stash.length; i++) {
      if (!slotPopulationMatch(a.stash[i] ?? null, b.stash[i] ?? null)) return false;
    }
  }
  return true;
}

/**
 * Client-side prediction matching server slot moves (empty slot, merge stacks, swap, or partial split).
 * `quantityToMove` defaults to the full source stack.
 */
export function predictSlotMove(
  grids: SlotGrids,
  source: MammothDragSourceSlotInfo,
  dest: MammothDragSourceSlotInfo,
  quantityToMove?: number,
): SlotGrids | null {
  const g = cloneGrids(grids);
  const moving = getSlot(g, source);
  if (!moving) return null;
  if (source.type === dest.type && source.index === dest.index) return null;

  const moveQty = quantityToMove ?? moving.instance.quantity;
  if (moveQty <= 0 || moveQty > moving.instance.quantity) return null;

  if (moveQty < moving.instance.quantity) {
    const target = getSlot(g, dest);
    if (target && !sameInstance(moving, target)) {
      if (target.instance.defId !== moving.instance.defId || moving.def.maxStack <= 1) return null;
      const room = moving.def.maxStack - target.instance.quantity;
      const xfer = Math.min(moveQty, room);
      if (xfer <= 0) return null;
      setSlot(g, dest, {
        ...target,
        instance: { ...target.instance, quantity: target.instance.quantity + xfer },
      });
      setSlot(g, source, {
        ...moving,
        instance: { ...moving.instance, quantity: moving.instance.quantity - xfer },
      });
      return g;
    }
    const splitStack: MammothPopulatedItem = {
      ...moving,
      instance: { ...moving.instance, quantity: moveQty },
    };
    setSlot(g, dest, splitStack);
    const remain = moving.instance.quantity - moveQty;
    setSlot(
      g,
      source,
      remain > 0 ? { ...moving, instance: { ...moving.instance, quantity: remain } } : null,
    );
    return g;
  }

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
    return null;
  }

  setSlot(g, dest, moving);
  setSlot(g, source, target);
  return g;
}

/** Stack leaves the grid (full stack or partial split-drop). */
export function predictWorldDrop(
  grids: SlotGrids,
  source: MammothDragSourceSlotInfo,
  quantityToDrop: number,
): SlotGrids | null {
  const g = cloneGrids(grids);
  const moving = getSlot(g, source);
  if (!moving || quantityToDrop <= 0 || quantityToDrop > moving.instance.quantity) return null;
  if (quantityToDrop === moving.instance.quantity) {
    setSlot(g, source, null);
    return g;
  }
  setSlot(g, source, {
    ...moving,
    instance: { ...moving.instance, quantity: moving.instance.quantity - quantityToDrop },
  });
  return g;
}

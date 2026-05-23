import { describe, expect, it } from "vitest";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import { inventorySlotGridsMatch, predictSlotMove, predictWorldDrop } from "./inventoryOptimistic";
import { MAMMOTH_INVENTORY_SLOTS } from "./useMammothInventory";

function item(instanceNum: number, defId: string, qty: number, max: number): MammothPopulatedItem {
  return {
    instance: {
      instanceId: BigInt(instanceNum),
      defId,
      quantity: qty,
      location: { tag: "Hotbar", value: {} as never },
    },
    def: {
      id: defId,
      displayName: defId,
      description: "",
      category: "weapon",
      maxStack: max,
      meleeCombat: null,
      construction: null,
      consumeOnUse: null,
      hotbarConsumeSound: null,
    waterContainer: null,
    balconyGrow: null,
    balconyGrowFertilizer: false,
    iconUrl: "",
    },
  };
}

describe("inventoryOptimistic", () => {
  it("moves into an empty slot", () => {
    const grids = {
      hotbar: [item(101, "knife", 1, 1), null, null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
    );
    expect(next?.hotbar[0]).toBeNull();
    expect(next?.hotbar[1]?.instance.defId).toBe("knife");
  });

  it("swaps two different items", () => {
    const grids = {
      hotbar: [item(201, "knife", 1, 1), item(202, "crowbar", 1, 1), null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
    );
    expect(next?.hotbar[0]?.instance.defId).toBe("crowbar");
    expect(next?.hotbar[1]?.instance.defId).toBe("knife");
  });

  it("moves between inventory and stash slots", () => {
    const grids = {
      hotbar: [null, null, null, null, null, null],
      inventory: [item(251, "bandage", 3, 10), ...Array.from({ length: 23 }, () => null)],
      stash: Array.from({ length: 24 }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "inventory", index: 0 },
      { type: "stash", index: 4 },
    );
    expect(next?.inventory[0]).toBeNull();
    expect(next?.stash?.[4]?.instance.defId).toBe("bandage");
  });

  it("predictWorldDrop clears source", () => {
    const grids = {
      hotbar: [item(301, "knife", 1, 1), null, null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictWorldDrop(grids, { type: "hotbar", index: 0 }, 1);
    expect(next?.hotbar[0]).toBeNull();
  });

  it("predictWorldDrop removes partial stack quantity", () => {
    const grids = {
      hotbar: [item(302, "bandage", 6, 10), null, null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictWorldDrop(grids, { type: "hotbar", index: 0 }, 3);
    expect(next?.hotbar[0]?.instance.quantity).toBe(3);
  });

  it("predictSlotMove splits half a stack into an empty slot", () => {
    const grids = {
      hotbar: [item(401, "bandage", 6, 10), null, null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
      3,
    );
    expect(next?.hotbar[0]?.instance.quantity).toBe(3);
    expect(next?.hotbar[1]?.instance.quantity).toBe(3);
  });

  it("predictSlotMove splits into a compatible stack", () => {
    const grids = {
      hotbar: [item(501, "bandage", 4, 10), item(502, "bandage", 2, 10), null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
      3,
    );
    expect(next?.hotbar[0]?.instance.quantity).toBe(1);
    expect(next?.hotbar[1]?.instance.quantity).toBe(5);
  });

  it("predictSlotMove merges a full stack into a compatible stack", () => {
    const grids = {
      hotbar: [item(601, "bandage", 4, 10), item(602, "bandage", 3, 10), null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
    );
    expect(next?.hotbar[0]).toBeNull();
    expect(next?.hotbar[1]?.instance.instanceId).toBe(602n);
    expect(next?.hotbar[1]?.instance.quantity).toBe(7);
  });

  it("predictSlotMove partially merges when the target only has partial room", () => {
    const grids = {
      hotbar: [item(701, "bandage", 5, 10), item(702, "bandage", 8, 10), null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    const next = predictSlotMove(
      grids,
      { type: "hotbar", index: 0 },
      { type: "hotbar", index: 1 },
    );
    expect(next?.hotbar[0]?.instance.quantity).toBe(3);
    expect(next?.hotbar[1]?.instance.quantity).toBe(10);
  });

  it("predictSlotMove cancels when dropping onto a full stack of the same item", () => {
    const grids = {
      hotbar: [item(801, "bandage", 4, 10), item(802, "bandage", 10, 10), null, null, null, null],
      inventory: Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null),
    };
    expect(
      predictSlotMove(grids, { type: "hotbar", index: 0 }, { type: "hotbar", index: 1 }),
    ).toBeNull();
  });
});

describe("inventorySlotGridsMatch", () => {
  const emptyInv = () => Array.from({ length: MAMMOTH_INVENTORY_SLOTS }, () => null);

  it("returns true for identical slot populations", () => {
    const a = {
      hotbar: [item(401, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const b = {
      hotbar: [item(401, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(true);
  });

  it("returns false when an instance id differs", () => {
    const a = {
      hotbar: [item(501, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const b = {
      hotbar: [item(502, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(false);
  });

  it("returns false when quantity differs", () => {
    const a = {
      hotbar: [item(601, "bandage", 3, 10), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const b = {
      hotbar: [item(601, "bandage", 2, 10), null, null, null, null, null],
      inventory: emptyInv(),
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(false);
  });

  it("returns true when predicted move matches replicated outcome", () => {
    const before = {
      hotbar: [item(701, "knife", 1, 1), null, null, null, null, null],
      inventory: emptyInv(),
    };
    const predicted = predictSlotMove(before, { type: "hotbar", index: 0 }, { type: "hotbar", index: 2 });
    expect(predicted).not.toBeNull();
    expect(inventorySlotGridsMatch(predicted!, predicted!)).toBe(true);
    expect(inventorySlotGridsMatch(predicted!, before)).toBe(false);
  });

  it("compares stash slot populations when present", () => {
    const a = {
      hotbar: [null, null, null, null, null, null],
      inventory: emptyInv(),
      stash: [item(801, "bandage", 3, 10), ...Array.from({ length: 23 }, () => null)],
    };
    const b = {
      hotbar: [null, null, null, null, null, null],
      inventory: emptyInv(),
      stash: [item(801, "bandage", 3, 10), ...Array.from({ length: 23 }, () => null)],
    };
    const c = {
      hotbar: [null, null, null, null, null, null],
      inventory: emptyInv(),
      stash: [item(801, "bandage", 2, 10), ...Array.from({ length: 23 }, () => null)],
    };
    expect(inventorySlotGridsMatch(a, b)).toBe(true);
    expect(inventorySlotGridsMatch(a, c)).toBe(false);
  });
});

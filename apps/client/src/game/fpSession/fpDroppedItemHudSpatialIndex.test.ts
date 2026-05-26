import { describe, expect, it } from "vitest";
import type { DroppedItem } from "../../module_bindings/types";
import { createDroppedItemHudSpatialIndex } from "./fpDroppedItemHudSpatialIndex.js";

function row(id: bigint, x: number, y: number, z: number): DroppedItem {
  return {
    id,
    defId: "test_item",
    quantity: 1,
    x,
    y,
    z,
    yaw: 0,
    createdAt: { __timestamp_micros_since_unix_epoch__: 0n },
    worldSpawnSlot: undefined,
  } as DroppedItem;
}

describe("createDroppedItemHudSpatialIndex", () => {
  it("returns nearest pickup within radius using cell locality", () => {
    const index = createDroppedItemHudSpatialIndex();
    index.rebuild([
      row(1n, 0, 0, 0),
      row(2n, 100, 0, 100),
      row(3n, 1.2, 0, 0.5),
    ]);
    const hit = index.findNearest(0, 0, 0, 3.5, 12);
    expect(hit.plain?.droppedItemId).toBe(1n);
    const far = index.findNearest(100, 0, 100, 3.5, 12);
    expect(far.plain?.droppedItemId).toBe(2n);
  });
});

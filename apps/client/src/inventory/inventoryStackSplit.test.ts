import { describe, expect, it } from "vitest";
import { mammothHalfStackDragQuantity } from "./inventoryStackSplit";

describe("mammothHalfStackDragQuantity", () => {
  it("returns floor half for stackable items", () => {
    expect(mammothHalfStackDragQuantity(10, 30)).toBe(5);
    expect(mammothHalfStackDragQuantity(3, 10)).toBe(1);
    expect(mammothHalfStackDragQuantity(2, 10)).toBe(1);
  });

  it("returns null for non-stackable or single-item stacks", () => {
    expect(mammothHalfStackDragQuantity(1, 10)).toBeNull();
    expect(mammothHalfStackDragQuantity(5, 1)).toBeNull();
  });
});

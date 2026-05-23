import { describe, expect, it } from "vitest";
import { mammothHotLootSlotKey } from "./mammothHotLootSlotKey";

describe("mammothHotLootSlotKey", () => {
  it("keys slots by type and index", () => {
    expect(mammothHotLootSlotKey({ type: "hotbar", index: 2 })).toBe("hotbar-2");
    expect(mammothHotLootSlotKey({ type: "stash", index: 14 })).toBe("stash-14");
  });
});

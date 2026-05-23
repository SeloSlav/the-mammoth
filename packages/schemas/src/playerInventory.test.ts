import { describe, expect, it } from "vitest";
import {
  isPlayerInventorySlotLocked,
  playerInventoryActiveSlotCount,
  playerInventoryHudSlotCount,
  PLAYER_INVENTORY_BASE_SLOTS,
  PLAYER_INVENTORY_MAX_SLOTS,
} from "./playerInventory.js";

describe("playerInventory slot helpers", () => {
  it("shows the full max grid in the HUD", () => {
    expect(playerInventoryHudSlotCount()).toBe(PLAYER_INVENTORY_MAX_SLOTS);
  });

  it("locks upgrade slots beyond the active backpack tier", () => {
    const active = playerInventoryActiveSlotCount();
    expect(active).toBe(PLAYER_INVENTORY_BASE_SLOTS);
    for (let i = 0; i < active; i++) {
      expect(isPlayerInventorySlotLocked(i)).toBe(false);
    }
    for (let i = active; i < PLAYER_INVENTORY_MAX_SLOTS; i++) {
      expect(isPlayerInventorySlotLocked(i)).toBe(true);
    }
    expect(isPlayerInventorySlotLocked(PLAYER_INVENTORY_MAX_SLOTS)).toBe(false);
  });
});

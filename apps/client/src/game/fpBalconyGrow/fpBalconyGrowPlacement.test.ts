import { describe, expect, it } from "vitest";
import {
  BALCONY_GROW_SLOT_ALREADY_PLANTED_MESSAGE,
  balconyGrowPlantPrimaryClickBlockedMessage,
} from "./fpBalconyGrowPlacement.js";

describe("balconyGrowPlantPrimaryClickBlockedMessage", () => {
  it("returns the occupied-slot message when placement targets a filled slot", () => {
    expect(
      balconyGrowPlantPrimaryClickBlockedMessage({
        unitKey: "u1",
        trayId: "tray-a",
        trayObject: {} as never,
        slotIndex: 0,
        seedDefId: "lovage-seeds",
        valid: false,
      }),
    ).toBe(BALCONY_GROW_SLOT_ALREADY_PLANTED_MESSAGE);
  });

  it("returns null for open slots and missing placement", () => {
    expect(balconyGrowPlantPrimaryClickBlockedMessage(null)).toBeNull();
    expect(
      balconyGrowPlantPrimaryClickBlockedMessage({
        unitKey: "u1",
        trayId: "tray-a",
        trayObject: {} as never,
        slotIndex: 1,
        seedDefId: "lovage-seeds",
        valid: true,
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { hotbarInstantConsumeSoundProfile } from "./fpConsumableUse";

describe("hotbarInstantConsumeSoundProfile", () => {
  it("uses the authored catalog sound per consumable", () => {
    expect(hotbarInstantConsumeSoundProfile("water-bottle")).toBe("drink");
    expect(hotbarInstantConsumeSoundProfile("apple")).toBe("eat");
    expect(hotbarInstantConsumeSoundProfile("rakija")).toBe("drink");
  });
});

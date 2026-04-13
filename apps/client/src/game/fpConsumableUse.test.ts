import { describe, expect, it } from "vitest";
import { hotbarInstantConsumeSoundProfile } from "./fpConsumableUse";

describe("hotbarInstantConsumeSoundProfile", () => {
  it("matches server hotbar_consume_sound_kind (hydration-led → drink)", () => {
    expect(hotbarInstantConsumeSoundProfile("water_bottle")).toBe("drink");
    expect(hotbarInstantConsumeSoundProfile("rakija")).toBe("drink");
  });

  it("uses eat when hunger dominates or ties hydration", () => {
    expect(hotbarInstantConsumeSoundProfile("apple")).toBe("eat");
  });
});

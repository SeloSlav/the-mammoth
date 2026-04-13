import { afterEach, describe, expect, it } from "vitest";
import {
  __resetHotbarInstantConsumeCooldownForTests,
  hotbarInstantConsumeCooldownProgress,
  tryBeginHotbarInstantConsumeCooldown,
} from "./fpHotbarInstantConsumeCooldown";

afterEach(() => {
  __resetHotbarInstantConsumeCooldownForTests();
});

describe("fpHotbarInstantConsumeCooldown", () => {
  it("allows the first consume attempt", () => {
    expect(tryBeginHotbarInstantConsumeCooldown(2)).toBe(true);
    expect(hotbarInstantConsumeCooldownProgress(2)).not.toBeNull();
  });

  it("blocks a second attempt before cooldown elapses", () => {
    expect(tryBeginHotbarInstantConsumeCooldown(0)).toBe(true);
    expect(tryBeginHotbarInstantConsumeCooldown(0)).toBe(false);
    expect(tryBeginHotbarInstantConsumeCooldown(3)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { hotbarDefIdSupportsMeleeAttack } from "./fpHotbarResolve";

describe("hotbarDefIdSupportsMeleeAttack", () => {
  it("accepts authored melee weapon def ids", () => {
    expect(hotbarDefIdSupportsMeleeAttack("crowbar")).toBe(true);
    expect(hotbarDefIdSupportsMeleeAttack("knife")).toBe(true);
    expect(hotbarDefIdSupportsMeleeAttack("screwdriver")).toBe(true);
  });

  it("rejects empty or non-weapon selections", () => {
    expect(hotbarDefIdSupportsMeleeAttack(undefined)).toBe(false);
    expect(hotbarDefIdSupportsMeleeAttack(null)).toBe(false);
    expect(hotbarDefIdSupportsMeleeAttack("water-bottle")).toBe(false);
  });
});

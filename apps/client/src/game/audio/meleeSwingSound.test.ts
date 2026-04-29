import { describe, expect, it } from "vitest";
import {
  MELEE_SWING_VARIATION_PROFILE_SHIFT,
  MELEE_SWING_VARIATION_STEM_MASK,
  meleeSwingProfileFromVariation,
  meleeSwingStemIndexFromVariation,
} from "./meleeSwingSound";

describe("melee swing variation layout", () => {
  it("matches server packing (profile << 2 | stem)", () => {
    const v = (7 << MELEE_SWING_VARIATION_PROFILE_SHIFT) | 1;
    expect(meleeSwingStemIndexFromVariation(v)).toBe(1);
    expect(meleeSwingProfileFromVariation(v)).toBe(7);
    expect(v & MELEE_SWING_VARIATION_STEM_MASK).toBe(1);
    expect((v >> MELEE_SWING_VARIATION_PROFILE_SHIFT) & 0x3f).toBe(7);
  });
});

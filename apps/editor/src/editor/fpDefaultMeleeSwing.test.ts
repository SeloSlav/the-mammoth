import { describe, expect, it } from "vitest";
import {
  cloneDefaultFpMeleeSwingKeyframes,
  DEFAULT_FP_MELEE_SWING_KEYFRAMES,
} from "@the-mammoth/engine";

describe("default FP melee swing", () => {
  it("cloneDefaultFpMeleeSwingKeyframes returns a deep copy", () => {
    const a = cloneDefaultFpMeleeSwingKeyframes();
    const b = cloneDefaultFpMeleeSwingKeyframes();
    expect(a.length).toBe(DEFAULT_FP_MELEE_SWING_KEYFRAMES.length);
    expect(a[1]!.translationM.z).toBe(DEFAULT_FP_MELEE_SWING_KEYFRAMES[1]!.translationM.z);
    a[1]!.translationM.z = 99;
    expect(b[1]!.translationM.z).not.toBe(99);
  });
});

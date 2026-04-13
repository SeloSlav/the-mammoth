import { describe, expect, it } from "vitest";
import {
  fpHotbarDigitKeySuppressedByDebounce,
  HOTBAR_DIGIT_DEBOUNCE_MS,
} from "./fpHotbarActivate";

describe("fpHotbarDigitKeySuppressedByDebounce", () => {
  const base = {
    keyCode: "Digit1",
    lastCode: "Digit1",
    lastSlot: 0,
    newSlot: 0,
  };

  it("never suppresses when the press will instant-consume", () => {
    expect(
      fpHotbarDigitKeySuppressedByDebounce({
        ...base,
        prevSel: 0,
        willConsume: true,
        lastAtMs: 0,
        nowMs: 50,
      }),
    ).toBe(false);
  });

  it("does not suppress same-slot re-press so unequip can fire on a tight double-tap", () => {
    expect(
      fpHotbarDigitKeySuppressedByDebounce({
        ...base,
        prevSel: 0,
        willConsume: false,
        lastAtMs: 0,
        nowMs: 50,
      }),
    ).toBe(false);
  });

  it("suppresses duplicate different-slot selection within the debounce window", () => {
    expect(
      fpHotbarDigitKeySuppressedByDebounce({
        ...base,
        prevSel: 2,
        willConsume: false,
        lastAtMs: 1000,
        nowMs: 1000 + HOTBAR_DIGIT_DEBOUNCE_MS - 1,
      }),
    ).toBe(true);
  });

  it("allows selection after debounce window elapsed", () => {
    expect(
      fpHotbarDigitKeySuppressedByDebounce({
        ...base,
        prevSel: 2,
        willConsume: false,
        lastAtMs: 1000,
        nowMs: 1000 + HOTBAR_DIGIT_DEBOUNCE_MS,
      }),
    ).toBe(false);
  });
});

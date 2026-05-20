import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGameplayErrorBar,
  GAMEPLAY_ERROR_BAR_DISPLAY_MS,
  getGameplayErrorBarMessage,
  showGameplayErrorBar,
} from "./gameplayErrorBar";

describe("gameplayErrorBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearGameplayErrorBar();
  });

  afterEach(() => {
    clearGameplayErrorBar();
    vi.useRealTimers();
  });

  it("shows trimmed text and auto-clears after the default duration", () => {
    showGameplayErrorBar("  Door locked  ");
    expect(getGameplayErrorBarMessage()).toBe("Door locked");
    vi.advanceTimersByTime(GAMEPLAY_ERROR_BAR_DISPLAY_MS - 1);
    expect(getGameplayErrorBarMessage()).toBe("Door locked");
    vi.advanceTimersByTime(1);
    expect(getGameplayErrorBarMessage()).toBeNull();
  });

  it("ignores empty messages", () => {
    showGameplayErrorBar("   ");
    expect(getGameplayErrorBarMessage()).toBeNull();
  });

  it("replaces the previous message and resets the timer", () => {
    showGameplayErrorBar("first");
    vi.advanceTimersByTime(2000);
    showGameplayErrorBar("second");
    vi.advanceTimersByTime(GAMEPLAY_ERROR_BAR_DISPLAY_MS - 1);
    expect(getGameplayErrorBarMessage()).toBe("second");
  });
});

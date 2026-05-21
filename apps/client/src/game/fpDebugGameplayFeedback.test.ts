import { describe, expect, it } from "vitest";
import {
  getFpDebugGameplayFeedbackFlags,
  isFpDebugGameplayFeedbackEnabled,
  resetFpDebugGameplayFeedbackFlags,
  setFpDebugGameplayFeedbackFlag,
} from "./fpDebugGameplayFeedback.js";

describe("fpDebugGameplayFeedback", () => {
  it("defaults starvation flashes to enabled", () => {
    resetFpDebugGameplayFeedbackFlags();
    expect(isFpDebugGameplayFeedbackEnabled("starvationDamageFlashes")).toBe(true);
  });

  it("toggles starvation flashes off for isolation", () => {
    resetFpDebugGameplayFeedbackFlags();
    setFpDebugGameplayFeedbackFlag("starvationDamageFlashes", false);
    expect(getFpDebugGameplayFeedbackFlags().starvationDamageFlashes).toBe(false);
  });
});

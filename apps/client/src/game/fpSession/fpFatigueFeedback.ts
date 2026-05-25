import type { GameTimeProgressSnapshot } from "@the-mammoth/game";
import { shouldShowFatigueWarning } from "@the-mammoth/game";

/** Session-only fatigue presentation intensity 0..1 for vignette / future audio hooks. */
let fatigueVignetteIntensity = 0;
let fatigueWarningShown = false;

const listeners = new Set<() => void>();

export function getFatigueVignetteIntensity(): number {
  return fatigueVignetteIntensity;
}

export function subscribeFatigueFeedback(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const l of listeners) l();
}

/**
 * Update under-the-hood fatigue feedback from replicated progress.
 * TODO: wire breathing audio, screen blink, hallucination flickers when assets exist.
 */
export function tickFpFatigueFeedback(snapshot: GameTimeProgressSnapshot | null): string | null {
  if (!snapshot) {
    fatigueVignetteIntensity = 0;
    fatigueWarningShown = false;
    notify();
    return null;
  }

  const warn = shouldShowFatigueWarning(snapshot);
  fatigueVignetteIntensity = warn ? 0.35 : snapshot.sleepPressure > 0.5 ? 0.12 : 0;
  notify();

  if (warn && !fatigueWarningShown) {
    fatigueWarningShown = true;
    return "You're fighting sleep. Find a bed — or you'll collapse at 03:30.";
  }
  if (!warn) {
    fatigueWarningShown = false;
  }
  return null;
}

export function resetFpFatigueFeedbackForTests(): void {
  fatigueVignetteIntensity = 0;
  fatigueWarningShown = false;
  notify();
}

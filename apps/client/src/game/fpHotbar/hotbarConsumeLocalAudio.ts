/**
 * FP session registers these after creating {@link LocalGameAudio}.
 * Inventory HUD and digit-key consume call {@link primeHotbarConsumeAudio} / {@link playHotbarConsumeLocalAfterServer}.
 */

let playImpl: ((profile: "eat" | "drink" | "smoke") => void) | null = null;
let primeImpl: (() => Promise<void>) | null = null;

export function registerHotbarConsumeLocalPlayback(fn: typeof playImpl): void {
  playImpl = fn;
}

export function registerHotbarConsumePrimeAudio(fn: () => Promise<void>): void {
  primeImpl = fn;
}

/** No-op until {@link registerHotbarConsumePrimeAudio} runs (FP session mount). */
export function primeHotbarConsumeAudio(): Promise<void> {
  return primeImpl?.() ?? Promise.resolve();
}

export function playHotbarConsumeLocalAfterServer(profile: "eat" | "drink" | "smoke"): void {
  playImpl?.(profile);
}

export function unregisterHotbarConsumeLocalAudio(): void {
  playImpl = null;
  primeImpl = null;
}

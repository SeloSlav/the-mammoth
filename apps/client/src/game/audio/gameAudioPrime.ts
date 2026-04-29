/** FP session registers this so HUD (always-on hotbar clicks) can unlock Web Audio without a canvas click. */

let primeImpl: (() => Promise<void>) | null = null;

export function registerGameAudioPrime(fn: (() => Promise<void>) | null): void {
  primeImpl = fn;
}

export function requestGameAudioPrime(): Promise<void> {
  return primeImpl?.() ?? Promise.resolve();
}

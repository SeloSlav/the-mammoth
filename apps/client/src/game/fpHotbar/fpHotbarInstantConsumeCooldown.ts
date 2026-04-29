/**
 * Client-side hotbar instant-use (consumable) cooldown — mirrors server
 * `HOTBAR_INSTANT_CONSUME_COOLDOWN_MICROS` (broth-style 1s gate).
 */
export const HOTBAR_INSTANT_CONSUME_COOLDOWN_MS = 1000;

const scheduleFrame =
  typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (cb: FrameRequestCallback): number =>
        globalThis.setTimeout(() => cb(performance.now()), 16) as unknown as number;

const cancelFrame =
  typeof globalThis.cancelAnimationFrame === "function"
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : (id: number): void => {
        globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
      };

let activeSlot: number | null = null;
/** Wall time when the current cooldown ends (`performance.now()`). */
let cooldownEndsAtMs = 0;
/** Start time for the active slot’s overlay animation. */
let startedAtMs = 0;
let version = 0;
const listeners = new Set<() => void>();

let rafId = 0;

function notify(): void {
  version += 1;
  for (const l of listeners) l();
}

function endRaf(): void {
  if (rafId !== 0) {
    cancelFrame(rafId);
    rafId = 0;
  }
}

function scheduleRaf(): void {
  if (rafId !== 0) return;
  rafId = scheduleFrame(function tick() {
    rafId = 0;
    notify();
    const now = performance.now();
    if (activeSlot !== null && now < cooldownEndsAtMs) {
      rafId = scheduleFrame(tick);
    } else {
      activeSlot = null;
      notify();
    }
  });
}

/** Monotonic counter for `useSyncExternalStore` while a cooldown animates. */
export function getHotbarInstantConsumeCooldownVersion(): number {
  return version;
}

export function subscribeHotbarInstantConsumeCooldown(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * If not on cooldown, starts a new cooldown for this slot and returns true.
 * Otherwise returns false (do not send another consume reducer).
 */
export function tryBeginHotbarInstantConsumeCooldown(slot: number): boolean {
  const now = performance.now();
  if (now < cooldownEndsAtMs) {
    return false;
  }
  activeSlot = slot;
  startedAtMs = now;
  cooldownEndsAtMs = now + HOTBAR_INSTANT_CONSUME_COOLDOWN_MS;
  endRaf();
  notify();
  scheduleRaf();
  return true;
}

/** Elapsed fraction 0..1 for the slot that triggered the current cooldown; null if idle or other slot. */
export function hotbarInstantConsumeCooldownProgress(slot: number): number | null {
  if (activeSlot !== slot) return null;
  const now = performance.now();
  const elapsed = now - startedAtMs;
  if (now >= cooldownEndsAtMs) return null;
  return Math.min(1, Math.max(0, elapsed / HOTBAR_INSTANT_CONSUME_COOLDOWN_MS));
}

/** Test helper — resets gate and listeners’ observed version baseline. */
export function __resetHotbarInstantConsumeCooldownForTests(): void {
  endRaf();
  activeSlot = null;
  startedAtMs = 0;
  cooldownEndsAtMs = 0;
  version = 0;
  for (const l of listeners) l();
}

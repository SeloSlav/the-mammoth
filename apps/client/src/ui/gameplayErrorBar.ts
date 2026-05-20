/**
 * Top-of-screen red gameplay error bar (white text).
 * Domain code calls {@link showGameplayErrorBar}; {@link MammothGameplayErrorBarHud} renders it.
 */

const listeners = new Set<() => void>();
let message: string | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Default visible duration before auto-dismiss. */
export const GAMEPLAY_ERROR_BAR_DISPLAY_MS = 4200;

export type ShowGameplayErrorBarOptions = {
  durationMs?: number;
};

export function getGameplayErrorBarMessage(): string | null {
  return message;
}

export function subscribeGameplayErrorBar(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function showGameplayErrorBar(
  text: string,
  opts: ShowGameplayErrorBarOptions = {},
): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  message = trimmed;
  if (hideTimer !== null) clearTimeout(hideTimer);
  const durationMs = opts.durationMs ?? GAMEPLAY_ERROR_BAR_DISPLAY_MS;
  hideTimer = setTimeout(() => {
    hideTimer = null;
    message = null;
    for (const l of listeners) l();
  }, durationMs);
  for (const l of listeners) l();
}

export function clearGameplayErrorBar(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (message === null) return;
  message = null;
  for (const l of listeners) l();
}

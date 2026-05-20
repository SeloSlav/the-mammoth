/** Short-lived red HUD bar for inventory / stash feedback (rejections, failed moves). */

const listeners = new Set<() => void>();
let message: string | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const MAMMOTH_INVENTORY_ERROR_BAR_MS = 4200;

export function getMammothInventoryErrorBarMessage(): string | null {
  return message;
}

export function subscribeMammothInventoryErrorBar(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function showMammothInventoryErrorBar(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  message = trimmed;
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    message = null;
    for (const l of listeners) l();
  }, MAMMOTH_INVENTORY_ERROR_BAR_MS);
  for (const l of listeners) l();
}

export function clearMammothInventoryErrorBar(): void {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (message === null) return;
  message = null;
  for (const l of listeners) l();
}

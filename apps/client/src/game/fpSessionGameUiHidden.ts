/** FP session: hide React HUD chrome (e.g. Alt+Z) for clean screenshots; toggled from `mountFpSession`. */

const listeners = new Set<() => void>();

let hidden = false;

export function getFpSessionGameUiHidden(): boolean {
  return hidden;
}

export function setFpSessionGameUiHidden(next: boolean): void {
  if (hidden === next) return;
  hidden = next;
  for (const l of listeners) l();
}

export function toggleFpSessionGameUiHidden(): void {
  setFpSessionGameUiHidden(!hidden);
}

export function subscribeFpSessionGameUiHidden(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function resetFpSessionGameUiHidden(): void {
  if (!hidden) return;
  hidden = false;
  for (const l of listeners) l();
}

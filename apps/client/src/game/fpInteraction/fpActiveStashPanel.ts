/** Footlocker stash side panel — opened explicitly (E), not from proximity / look-at prompts alone. */

const listeners = new Set<() => void>();

let unitKey: string | null = null;

export function getFpActiveStashPanelUnitKey(): string | null {
  return unitKey;
}

export function setFpActiveStashPanelUnitKey(next: string | null): void {
  if (unitKey === next) return;
  unitKey = next;
  for (const l of listeners) l();
}

export function subscribeFpActiveStashPanelUnitKey(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

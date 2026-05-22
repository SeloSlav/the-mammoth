import type { BalconyGrowInspectTarget } from "./fpBalconyGrowInspectTypes.js";

const listeners = new Set<() => void>();
let target: BalconyGrowInspectTarget | null = null;

export function getBalconyGrowInspectTarget(): BalconyGrowInspectTarget | null {
  return target;
}

export function setBalconyGrowInspectTarget(next: BalconyGrowInspectTarget | null): void {
  if (
    target?.unitKey === next?.unitKey &&
    target?.trayId === next?.trayId &&
    target?.slotIndex === next?.slotIndex
  ) {
    return;
  }
  target = next;
  for (const l of listeners) l();
}

export function subscribeBalconyGrowInspectTarget(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useBalconyGrowInspectTarget(): BalconyGrowInspectTarget | null {
  return target;
}

/** Live plant inspect wins over grow-tray stash E when a plant slot is aimed. */
export function balconyGrowInspectBlocksGrowTrayStash(): boolean {
  return target !== null;
}

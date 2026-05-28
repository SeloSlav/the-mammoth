/** Shared hotbar selection for FP gameplay (mountFpSession) + React HUD. */

const listeners = new Set<() => void>();

/** `null` = explicit unarmed; `0..5` = hotbar slot index. */
let selectedSlot: number | null = null;

export function getFpHotbarSelectedSlot(): number | null {
  return selectedSlot;
}

export function setFpHotbarSelectedSlot(slot: number | null): void {
  if (slot !== null && (slot < 0 || slot > 5)) return;
  if (slot === selectedSlot) return;
  selectedSlot = slot;
  for (const l of listeners) l();
}

export function subscribeFpHotbarSelection(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

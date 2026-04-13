/** FP world pickup hint — written from `mountFpSession` tick, read by React HUD. */

export type FpPickupPromptState = {
  /** Stable key for React / equality (bigint string). */
  droppedItemIdStr: string;
  displayName: string;
} | null;

const listeners = new Set<() => void>();

let state: FpPickupPromptState = null;

export function getFpPickupPrompt(): FpPickupPromptState {
  return state;
}

function same(a: FpPickupPromptState, b: FpPickupPromptState): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.droppedItemIdStr === b.droppedItemIdStr && a.displayName === b.displayName;
}

export function setFpPickupPrompt(next: FpPickupPromptState): void {
  if (same(state, next)) return;
  state = next;
  for (const l of listeners) l();
}

export function subscribeFpPickupPrompt(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

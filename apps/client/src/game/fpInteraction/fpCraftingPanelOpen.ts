/** Shared signal: full-screen crafting panel (B) is open. */

const listeners = new Set<() => void>();

let open = false;

export function getFpCraftingPanelOpen(): boolean {
  return open;
}

export function setFpCraftingPanelOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export function subscribeFpCraftingPanelOpen(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

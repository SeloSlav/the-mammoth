/**
 * Shared signal: is the player inventory grid panel currently mounted/visible.
 *
 * Reactified by {@link MammothInventoryHud} (the owner) and consumed by sibling overlays
 * (backdrop, close-hint footer) so they can render in lockstep without prop drilling
 * across `HudShell`. The stash panel uses {@link fpActiveStashPanel} for the same reason.
 */

const listeners = new Set<() => void>();

let open = false;

export function getFpInventoryDockOpen(): boolean {
  return open;
}

export function setFpInventoryDockOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export function subscribeFpInventoryDockOpen(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

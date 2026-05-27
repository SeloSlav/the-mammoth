/**
 * Tab inventory, B crafting, and M debug are full-screen style overlays — only one should be open.
 */

export type FpGameHudExclusiveKind = "inventory" | "crafting" | "debug";

const listeners = new Set<(keeping: FpGameHudExclusiveKind) => void>();

export function subscribeFpGameHudExclusiveCloseOthers(cb: (keeping: FpGameHudExclusiveKind) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Invoke immediately before switching `keeping` **on**. Other HUDs subscribe and dismiss themselves. */
export function notifyFpGameHudExclusiveOpen(keeping: FpGameHudExclusiveKind): void {
  for (const l of [...listeners]) l(keeping);
}

/** One-shot inventory open/close from the FP engine (e.g. apartment stash E). React HUD subscribes. */

const openListeners = new Set<() => void>();
const closeListeners = new Set<() => void>();

export function requestMammothInventoryOpenFromFp(): void {
  for (const l of openListeners) l();
}

export function onMammothInventoryOpenRequestFromFp(cb: () => void): () => void {
  openListeners.add(cb);
  return () => {
    openListeners.delete(cb);
  };
}

export function requestMammothInventoryCloseFromFp(): void {
  for (const l of closeListeners) l();
}

export function onMammothInventoryCloseRequestFromFp(cb: () => void): () => void {
  closeListeners.add(cb);
  return () => {
    closeListeners.delete(cb);
  };
}

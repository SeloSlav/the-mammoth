/** One-shot "open inventory" from the FP engine (e.g. footlocker E). React HUD subscribes. */

const listeners = new Set<() => void>();

export function requestMammothInventoryOpenFromFp(): void {
  for (const l of listeners) l();
}

export function onMammothInventoryOpenRequestFromFp(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

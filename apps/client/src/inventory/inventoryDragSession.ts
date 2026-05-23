import type { MammothDraggedItemInfo } from "./inventoryDragDropTypes";

let activeDrag: MammothDraggedItemInfo | null = null;
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getInventoryDragSession(): MammothDraggedItemInfo | null {
  return activeDrag;
}

export function getInventoryDragSessionVersion(): number {
  return version;
}

export function subscribeInventoryDragSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginInventoryDrag(info: MammothDraggedItemInfo): void {
  activeDrag = info;
  version++;
  notify();
}

export function endInventoryDrag(): MammothDraggedItemInfo | null {
  const prev = activeDrag;
  activeDrag = null;
  version++;
  notify();
  return prev;
}

/** Apartment storage side panel (wardrobe / footlocker) — opened explicitly (E). */

const listeners = new Set<() => void>();

import type { ApartmentStashKind } from "../fpApartment/fpApartmentStashKey.js";
import { requestMammothInventoryCloseFromFp } from "./fpInventoryOpenRequest.js";

export type FpActiveStashPanelState = {
  stashKey: string;
  stashLabel: string;
  stashKind: ApartmentStashKind;
};

let state: FpActiveStashPanelState | null = null;

export function getFpActiveStashPanel(): FpActiveStashPanelState | null {
  return state;
}

export function closeFpActiveStashPanel(): void {
  setFpActiveStashPanel(null);
}

/** Dismiss stash side panel and player inventory (Tab / Esc / E while stash is open). */
export function closeApartmentStashAndInventory(): void {
  closeFpActiveStashPanel();
  requestMammothInventoryCloseFromFp();
}

export function setFpActiveStashPanel(next: FpActiveStashPanelState | null): void {
  if (
    state?.stashKey === next?.stashKey &&
    state?.stashLabel === next?.stashLabel &&
    state?.stashKind === next?.stashKind
  ) {
    return;
  }
  state = next;
  for (const l of listeners) l();
}

export function subscribeFpActiveStashPanel(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

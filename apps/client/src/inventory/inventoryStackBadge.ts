import type { MammothItemDef } from "./mammothItemCatalogTypes";

/** Broth-style: only show a numeric stack on the icon when the stack is actually > 1. */
export function mammothShowStackQuantityOnSlotIcon(def: MammothItemDef, quantity: number): boolean {
  return def.maxStack > 1 && quantity > 1;
}

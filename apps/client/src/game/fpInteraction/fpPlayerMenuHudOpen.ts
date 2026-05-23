import { getFpCraftingPanelOpen, subscribeFpCraftingPanelOpen } from "./fpCraftingPanelOpen";
import { getFpInventoryDockOpen, subscribeFpInventoryDockOpen } from "./fpInventoryDockOpen";

/** Inventory (Tab) or crafting (B) — world HUD overlays should yield to these panels. */
export function getFpPlayerMenuHudOpen(): boolean {
  return getFpInventoryDockOpen() || getFpCraftingPanelOpen();
}

export function subscribeFpPlayerMenuHudOpen(cb: () => void): () => void {
  const bump = () => cb();
  const unsubInv = subscribeFpInventoryDockOpen(bump);
  const unsubCraft = subscribeFpCraftingPanelOpen(bump);
  return () => {
    unsubInv();
    unsubCraft();
  };
}

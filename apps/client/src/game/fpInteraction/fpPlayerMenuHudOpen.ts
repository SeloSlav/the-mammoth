import { getFpCraftingPanelOpen, subscribeFpCraftingPanelOpen } from "./fpCraftingPanelOpen";
import { getFpInventoryDockOpen, subscribeFpInventoryDockOpen } from "./fpInventoryDockOpen";
import { getFpMissionsPanelOpen, subscribeFpMissionsPanel } from "../missions/fpMissionsPanelState";

/** Inventory (Tab), crafting (B), or missions (J) — world HUD overlays should yield to these panels. */
export function getFpPlayerMenuHudOpen(): boolean {
  return getFpInventoryDockOpen() || getFpCraftingPanelOpen() || getFpMissionsPanelOpen();
}

export function subscribeFpPlayerMenuHudOpen(cb: () => void): () => void {
  const bump = () => cb();
  const unsubInv = subscribeFpInventoryDockOpen(bump);
  const unsubCraft = subscribeFpCraftingPanelOpen(bump);
  const unsubMissions = subscribeFpMissionsPanel(bump);
  return () => {
    unsubInv();
    unsubCraft();
    unsubMissions();
  };
}

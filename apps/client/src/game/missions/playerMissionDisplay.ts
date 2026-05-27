import {
  buildFirstExtractionMissionPanel,
  FIRST_EXTRACTION_ITEM_DEF_ID,
  MISSION_STATUS,
  type MissionPanelEntry,
} from "@the-mammoth/schemas";
import type { PlayerMissionProgress } from "../../module_bindings/types";
import { getMammothItemDef } from "../../inventory/mammothItemCatalog";

export function buildPlayerMissionPanelEntry(
  row: PlayerMissionProgress | null,
): MissionPanelEntry | null {
  if (!row || !row.activeMissionId) {
    return null;
  }
  const itemName =
    getMammothItemDef(FIRST_EXTRACTION_ITEM_DEF_ID)?.displayName ?? "Fuse wire pack";
  return buildFirstExtractionMissionPanel(
    {
      activeMissionId: row.activeMissionId,
      status: row.status,
      itemCollected: row.itemCollected,
      itemDeposited: row.itemDeposited,
    },
    itemName,
  );
}

export function hasActivePlayerMission(row: PlayerMissionProgress | null): boolean {
  const panel = buildPlayerMissionPanelEntry(row);
  if (!panel) return false;
  return panel.status !== MISSION_STATUS.COMPLETE;
}

export { missionStatusLabel } from "@the-mammoth/schemas";

import { isFirstExtractionMissionInProgress } from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import { readLocalPlayerMissionProgress } from "../missions/mountPlayerMissionSync.js";
import { isFpWorldNpcsEnabled } from "./fpSessionPerfDebug.js";

/** Live megablock `world_npc` presenters — dev flag or active first-extraction work order. */
export function isFpMegablockNpcsEnabled(conn: DbConnection | null): boolean {
  if (isFpWorldNpcsEnabled()) return true;
  if (!conn) return false;
  return isFirstExtractionMissionInProgress(readLocalPlayerMissionProgress(conn));
}

import type { DbConnection } from "../../module_bindings";
import { isFpWorldNpcsEnabled } from "./fpSessionPerfDebug.js";

/** Live megablock `world_npc` presenters — dev flag or any connected session. */
export function isFpMegablockNpcsEnabled(conn: DbConnection | null): boolean {
  if (isFpWorldNpcsEnabled()) return true;
  return conn !== null;
}

import type { DbConnection } from "../../module_bindings";
import type { PlayerMissionProgress } from "../../module_bindings/types";

export function readLocalPlayerMissionProgress(
  conn: DbConnection,
): PlayerMissionProgress | null {
  const local = conn.identity;
  if (!local) return null;
  for (const row of conn.db.player_mission_progress.iter()) {
    if (row.identity.isEqual(local)) return row;
  }
  return null;
}

export function subscribePlayerMissionProgress(
  conn: DbConnection,
  onChange: () => void,
): () => void {
  const bump = () => onChange();
  conn.db.player_mission_progress.onInsert(bump);
  conn.db.player_mission_progress.onUpdate(bump);
  conn.db.player_mission_progress.onDelete(bump);
  return () => {
    conn.db.player_mission_progress.removeOnInsert(bump);
    conn.db.player_mission_progress.removeOnUpdate(bump);
    conn.db.player_mission_progress.removeOnDelete(bump);
  };
}

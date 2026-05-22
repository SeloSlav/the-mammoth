import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DbConnection } from "../module_bindings";
import {
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_MONO,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSession/fpSessionGameUiHidden";

type Props = {
  conn: DbConnection | null;
};

export function MammothWorldDayHud({ conn }: Props) {
  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );
  const [ver, setVer] = useState(0);

  useEffect(() => {
    if (!conn) return;
    const bump = () => setVer((v) => v + 1);
    conn.db.player_world_progress.onInsert(bump);
    conn.db.player_world_progress.onUpdate(bump);
    conn.db.player_world_progress.onDelete(bump);
    return () => {
      conn.db.player_world_progress.removeOnInsert(bump);
      conn.db.player_world_progress.removeOnUpdate(bump);
      conn.db.player_world_progress.removeOnDelete(bump);
    };
  }, [conn]);

  const nights = useMemo(() => {
    void ver;
    const id = conn?.identity;
    if (!id) return 0;
    return conn.db.player_world_progress.identity.find(id)?.sleepsCount ?? 0;
  }, [conn, ver]);

  if (!conn || gameUiHidden) return null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 10px",
        borderRadius: 8,
        border: `1px solid ${THEME_CARD_BORDER}`,
        background: THEME_CARD_BG,
        color: THEME_TEXT_PRIMARY,
        fontFamily: UI_FONT_SANS,
        fontSize: 11,
        lineHeight: 1.35,
        minWidth: 118,
      }}
      title="You stopped counting calendar days long ago — only nights survived in the block."
    >
      <div style={{ color: THEME_TEXT_FAINT, fontSize: 10, letterSpacing: "0.04em" }}>NIGHTS</div>
      <div style={{ fontFamily: UI_FONT_MONO, fontSize: 15, fontWeight: 700 }}>{nights}</div>
      <div style={{ color: THEME_TEXT_MUTED, fontSize: 10, marginTop: 2 }}>slept / skipped</div>
    </div>
  );
}

import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import type { DbConnection } from "../module_bindings";
import type { HudToastEvent } from "../module_bindings/types";
import { HUD_TOAST_KIND_NOTICE } from "../game/crafting/fpCraftRecipes";
import type { FpActiveStashPanelState } from "../game/fpInteraction/fpActiveStashPanel";
import {
  getMammothInventoryErrorBarMessage,
  showMammothInventoryErrorBar,
  subscribeMammothInventoryErrorBar,
} from "./mammothInventoryErrorBar";

type Props = {
  conn: DbConnection | null;
  activeStash: FpActiveStashPanelState | null;
};

const barStyle: CSSProperties = {
  position: "fixed",
  left: "50%",
  top: "max(12px, env(safe-area-inset-top, 0px))",
  transform: "translateX(-50%)",
  zIndex: 130,
  pointerEvents: "none",
  maxWidth: "min(92vw, 520px)",
  padding: "12px 20px",
  borderRadius: 8,
  background: "linear-gradient(180deg, #c62828 0%, #9b1c1c 100%)",
  color: "#ffffff",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
  textAlign: "center",
  fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
  boxShadow: "0 6px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.12) inset",
};

/** Red bar, white text — inventory / stash rejections and failed moves. */
export function MammothInventoryErrorBarHud({ conn, activeStash }: Props) {
  useEffect(() => {
    if (!conn?.identity || !activeStash) return;
    const id = conn.identity;
    const onInsert = (_ctx: unknown, row: HudToastEvent) => {
      if (!row.recipient.isEqual(id)) return;
      const k = typeof row.toastKind === "number" ? row.toastKind : Number(row.toastKind);
      if (k !== HUD_TOAST_KIND_NOTICE) return;
      const msg = row.defId?.trim();
      if (msg) showMammothInventoryErrorBar(msg);
    };
    conn.db.hud_toast_event.onInsert(onInsert as never);
    return () => conn.db.hud_toast_event.removeOnInsert(onInsert as never);
  }, [conn, activeStash]);

  const text = useSyncExternalStore(
    subscribeMammothInventoryErrorBar,
    getMammothInventoryErrorBarMessage,
    () => null,
  );
  if (!text) return null;
  return (
    <div role="alert" data-testid="mammoth-inventory-error-bar" style={barStyle}>
      {text}
    </div>
  );
}

import { useEffect } from "react";
import type { DbConnection } from "../module_bindings";
import type { HudToastEvent } from "../module_bindings/types";
import { HUD_TOAST_KIND_NOTICE } from "../game/crafting/fpCraftRecipes";
import type { FpActiveStashPanelState } from "../game/fpInteraction/fpActiveStashPanel";
import { showGameplayErrorBar } from "../ui/gameplayErrorBar";

/**
 * Maps server stash failure notices (`HudToastEvent` notice kind) into the gameplay error bar
 * while a stash panel is open. Other gameplay systems can call {@link showGameplayErrorBar} directly.
 */
export function useStashServerNoticeGameplayErrorBridge(
  conn: DbConnection | null,
  activeStash: FpActiveStashPanelState | null,
): void {
  useEffect(() => {
    if (!conn?.identity || !activeStash) return;
    const id = conn.identity;
    const onInsert = (_ctx: unknown, row: HudToastEvent) => {
      if (!row.recipient.isEqual(id)) return;
      const k = typeof row.toastKind === "number" ? row.toastKind : Number(row.toastKind);
      if (k !== HUD_TOAST_KIND_NOTICE) return;
      const msg = row.defId?.trim();
      if (msg) showGameplayErrorBar(msg);
    };
    conn.db.hud_toast_event.onInsert(onInsert as never);
    return () => conn.db.hud_toast_event.removeOnInsert(onInsert as never);
  }, [conn, activeStash]);
}

import { useCallback, useEffect, useState } from "react";
import type { DbConnection } from "../module_bindings";
import type { HudToastEvent } from "../module_bindings/types";
import {
  HUD_TOAST_KIND_CRAFT_COMPLETE,
  HUD_TOAST_KIND_ITEM_RECEIVED,
  HUD_TOAST_KIND_NOTICE,
} from "../game/crafting/fpCraftRecipes";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import {
  THEME_CARD_BG_STRONG,
  THEME_CARD_BORDER_STRONG,
  THEME_PANEL_SHADOW,
  THEME_TEXT_PRIMARY,
  THEME_SUCCESS_BORDER,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import {
  BOTTOM_RIGHT_FP_HUD_INSET,
  PLAYER_VITALS_HUD_LAYOUT_HEIGHT_PX,
} from "./PlayerVitalsHud";

type ToastLine = {
  key: string;
  text: string;
  tint: "default" | "success";
};

const TOAST_MS = 5200;
const MAX_TOASTS = 6;
/** Gap between vitals (below) and the bottom of the toast stack. */
const TOAST_ABOVE_VITALS_GAP_PX = 10;

export function MammothToastHud({ conn }: { conn: DbConnection }) {
  const [toasts, setToasts] = useState<ToastLine[]>([]);

  const dismissAfter = useCallback((key: string, ms: number) => {
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== key));
    }, ms);
  }, []);

  const pushToast = useCallback(
    (line: Omit<ToastLine, "key">) => {
      const key = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => {
        const next = [...prev, { ...line, key }];
        if (next.length > MAX_TOASTS) next.splice(0, next.length - MAX_TOASTS);
        return next;
      });
      dismissAfter(key, TOAST_MS);
    },
    [dismissAfter],
  );

  useEffect(() => {
    const self = conn.identity;
    if (!self) return;

    const fmtDef = (defId: string, qty: number): string => {
      const dn = getMammothItemDef(defId)?.displayName ?? defId;
      return qty <= 1 ? dn : `${dn} ×${qty}`;
    };

    const onInsert = (_ctx: unknown, row: HudToastEvent) => {
      try {
        if (!row.recipient.isEqual(self)) return;
      } catch {
        return;
      }
      const defId = String(row.defId ?? "");
      const qty = typeof row.quantity === "bigint" ? Number(row.quantity) : Number(row.quantity ?? 0);

      const k = typeof row.toastKind === "number" ? row.toastKind : Number(row.toastKind);
      if (k === HUD_TOAST_KIND_ITEM_RECEIVED) {
        pushToast({
          text: `Picked up ${fmtDef(defId, qty)}`,
          tint: "default",
        });
      } else if (k === HUD_TOAST_KIND_CRAFT_COMPLETE) {
        pushToast({
          text: `Crafted ${fmtDef(defId, qty)}`,
          tint: "success",
        });
      } else if (k === HUD_TOAST_KIND_NOTICE) {
        const text = defId.trim();
        if (text.length > 0) {
          pushToast({ text, tint: "default" });
        }
      }
    };

    conn.db.hud_toast_event.onInsert(onInsert as never);
    return () => conn.db.hud_toast_event.removeOnInsert(onInsert as never);
  }, [conn, pushToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: "max(16px, calc(env(safe-area-inset-right, 0px) + 10px))",
        bottom: `calc(${BOTTOM_RIGHT_FP_HUD_INSET} + ${PLAYER_VITALS_HUD_LAYOUT_HEIGHT_PX}px + ${TOAST_ABOVE_VITALS_GAP_PX}px)`,
        zIndex: 120,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-end",
        maxWidth: 340,
        pointerEvents: "none",
        fontFamily: UI_FONT_SANS,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          style={{
            padding: "11px 14px",
            borderRadius: 8,
            color: THEME_TEXT_PRIMARY,
            background: THEME_CARD_BG_STRONG,
            border:
              t.tint === "success"
                ? `1px solid ${THEME_SUCCESS_BORDER}`
                : `1px solid ${THEME_CARD_BORDER_STRONG}`,
            boxShadow: THEME_PANEL_SHADOW,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

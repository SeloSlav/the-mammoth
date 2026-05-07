import { useEffect, useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";
import type { CraftQueueItem as CraftQueueRow } from "../module_bindings/types";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import {
  THEME_ACCENT,
  THEME_CARD_BG_STRONG,
  THEME_CARD_BORDER_STRONG,
  THEME_PANEL_SHADOW,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import { formatCraftQueueCountdown } from "./craftQueueCountdownFormat";
import {
  BOTTOM_RIGHT_FP_HUD_INSET,
  CRAFT_QUEUE_STRIP_BLOCK_HEIGHT_PX,
  CRAFT_QUEUE_STRIP_TO_TOAST_GAP_PX,
  FP_HUD_VITALS_TO_STACK_GAP_PX,
  PLAYER_VITALS_HUD_LAYOUT_HEIGHT_PX,
} from "./PlayerVitalsHud";

/** Visible countdown / queue line for the player’s most recently queued craft job (above vitals). */
export function MammothCraftQueueStrip({
  conn,
  onReserveAboveVitalsExtraPx,
}: {
  conn: DbConnection;
  /** When the strip is hidden, reports `0`; when visible, reports block height + gap so toasts stack above. */
  onReserveAboveVitalsExtraPx?: (px: number) => void;
}) {
  const [tick, setTick] = useState(0);
  const self = conn.identity;

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    conn.db.craft_queue_item.onInsert(bump);
    conn.db.craft_queue_item.onUpdate(bump);
    conn.db.craft_queue_item.onDelete(bump);
    return () => {
      conn.db.craft_queue_item.removeOnInsert(bump);
      conn.db.craft_queue_item.removeOnUpdate(bump);
      conn.db.craft_queue_item.removeOnDelete(bump);
    };
  }, [conn]);

  const queueRows = useMemo(() => {
    if (!self) return [];
    const rows: CraftQueueRow[] = [];
    for (const r of conn.db.craft_queue_item) {
      const row = r as CraftQueueRow;
      try {
        if (row.owner.isEqual(self)) rows.push(row);
      } catch {
        /* ignore */
      }
    }
    rows.sort((a, b) => {
      const oa = typeof a.orderIndex === "bigint" ? Number(a.orderIndex) : Number(a.orderIndex);
      const ob = typeof b.orderIndex === "bigint" ? Number(b.orderIndex) : Number(b.orderIndex);
      return oa - ob;
    });
    return rows;
  }, [conn, self, tick]);

  const latest = queueRows.length > 0 ? queueRows[queueRows.length - 1]! : null;

  useEffect(() => {
    if (!latest) {
      onReserveAboveVitalsExtraPx?.(0);
      return;
    }
    onReserveAboveVitalsExtraPx?.(CRAFT_QUEUE_STRIP_BLOCK_HEIGHT_PX + CRAFT_QUEUE_STRIP_TO_TOAST_GAP_PX);
  }, [latest, onReserveAboveVitalsExtraPx]);

  useEffect(() => {
    if (!latest) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [latest]);

  if (!latest) return null;

  const outputId =
    typeof latest.outputDefId === "string" ? latest.outputDefId : String(latest.outputDefId);
  const label = getMammothItemDef(outputId)?.displayName ?? outputId;
  const sm = typeof latest.startMicros === "bigint" ? latest.startMicros : BigInt(latest.startMicros);
  const fm = typeof latest.finishMicros === "bigint" ? latest.finishMicros : BigInt(latest.finishMicros);
  const waiting = Number(sm) === 0;
  const myOrder =
    typeof latest.orderIndex === "bigint" ? Number(latest.orderIndex) : Number(latest.orderIndex);
  const ahead = waiting
    ? queueRows.filter((r) => {
        const o = typeof r.orderIndex === "bigint" ? Number(r.orderIndex) : Number(r.orderIndex);
        return o < myOrder;
      }).length
    : 0;

  const nowUs = Date.now() * 1000;
  let statusLine: string;
  if (waiting) {
    statusLine = ahead > 0 ? `Queued · ${ahead} ahead` : "Queued · up next";
  } else {
    const remainingSec = (Number(fm) - nowUs) / 1e6;
    if (remainingSec <= 0) {
      statusLine = "Finishing…";
    } else {
      statusLine = `Crafting · ${formatCraftQueueCountdown(remainingSec)} left`;
    }
  }

  const right = "max(16px, calc(env(safe-area-inset-right, 0px) + 10px))";

  return (
    <div
      style={{
        position: "fixed",
        right,
        bottom: `calc(${BOTTOM_RIGHT_FP_HUD_INSET} + ${PLAYER_VITALS_HUD_LAYOUT_HEIGHT_PX}px + ${FP_HUD_VITALS_TO_STACK_GAP_PX}px)`,
        zIndex: 119,
        minWidth: 220,
        maxWidth: 340,
        padding: "10px 13px",
        borderRadius: 8,
        background: THEME_CARD_BG_STRONG,
        border: `1px solid ${THEME_CARD_BORDER_STRONG}`,
        boxShadow: THEME_PANEL_SHADOW,
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        fontFamily: UI_FONT_SANS,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: THEME_TEXT_FAINT,
          marginBottom: 4,
          fontWeight: 650,
        }}
      >
        Build queue
      </div>
      <div style={{ fontSize: 13, fontWeight: 650, color: THEME_TEXT_PRIMARY, lineHeight: 1.35 }}>{label}</div>
      <div style={{ fontSize: 12, color: waiting ? THEME_TEXT_MUTED : THEME_ACCENT, marginTop: 2 }}>{statusLine}</div>
    </div>
  );
}

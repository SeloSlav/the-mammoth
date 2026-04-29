import { useEffect, useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";

type Props = { conn: DbConnection };

const MAX_ROWS = 8;

/** Bottom-left global transcript (system claims + `/`-style chat future). */
export function MammothChatHud({ conn }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((v) => v + 1);
    conn.db.chat_message.onInsert(bump);
    return () => {
      conn.db.chat_message.removeOnInsert(bump);
    };
  }, [conn]);

  const rows = useMemo(() => {
    void tick;
    const out: { id: bigint; body: string }[] = [];
    for (const r of conn.db.chat_message) {
      const id = typeof r.id === "bigint" ? r.id : BigInt(r.id as number);
      out.push({ id, body: r.body });
    }
    out.sort((a, b) => Number(a.id - b.id));
    return out.slice(Math.max(0, out.length - MAX_ROWS));
  }, [conn, tick]);

  if (rows.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 120,
        zIndex: 55,
        maxWidth: "min(92vw, 420px)",
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.38,
        color: "#cdd7eb",
        background: "rgba(0,0,0,0.42)",
        border: "1px solid rgba(255,255,255,0.1)",
        pointerEvents: "none",
        fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
      }}
      data-testid="mammoth-chat-hud"
    >
      {rows.map((r) => (
        <div key={String(r.id)}>{r.body}</div>
      ))}
    </div>
  );
}

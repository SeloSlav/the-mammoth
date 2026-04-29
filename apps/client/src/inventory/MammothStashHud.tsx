import { useEffect, useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";
import type { InventoryItem } from "../module_bindings/types";
import { getMammothItemDef } from "./mammothItemCatalog";

type Props = {
  conn: DbConnection;
  unitKey: string;
};

/**
 * Withdraw-only panel for replicated stash rows (deposit via E + selected hotbar in FP session).
 */
export function MammothStashHud({ conn, unitKey }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    conn.db.inventory_item.onInsert(bump);
    conn.db.inventory_item.onUpdate(bump);
    conn.db.inventory_item.onDelete(bump);
    return () => {
      conn.db.inventory_item.removeOnInsert(bump);
      conn.db.inventory_item.removeOnUpdate(bump);
      conn.db.inventory_item.removeOnDelete(bump);
    };
  }, [conn]);

  const rows = useMemo(() => {
    void tick;
    const list: InventoryItem[] = [];
    for (const row of conn.db.inventory_item) {
      const loc = row.location;
      if (loc.tag !== "Stash") continue;
      const v = loc.value;
      if (v.unitKey !== unitKey) continue;
      list.push(row as InventoryItem);
    }
    list.sort((a, b) => Number(a.instanceId - b.instanceId));
    return list;
  }, [conn, unitKey, tick]);

  const pull = async (instanceId: bigint) => {
    await conn.reducers.stashPullItem({ itemInstanceId: instanceId, unitKey });
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 18,
        top: "50%",
        transform: "translateY(-50%)",
        width: "min(360px, 88vw)",
        maxHeight: "46vh",
        overflowY: "auto",
        padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(8,10,18,0.92)",
        border: "1px solid rgba(255,210,140,0.25)",
        color: "#dfe6f5",
        fontSize: 13,
        zIndex: 90,
      }}
      data-testid="mammoth-stash-panel"
    >
      <strong style={{ color: "#f2d39a" }}>Footlocker</strong>
      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
        Stored items (anyone physically here can loot). Tap to withdraw to first free inventory slot.
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 ? (
          <span style={{ opacity: 0.65 }}>(empty)</span>
        ) : (
          rows.map((r) => {
            const d = getMammothItemDef(r.defId);
            const lab = d?.displayName ?? r.defId;
            const raw = r.instanceId;
            const id = typeof raw === "bigint" ? raw : BigInt(raw as number);
            return (
              <button
                key={String(id)}
                type="button"
                onClick={() => void pull(id)}
                style={{
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e8eef8",
                  fontSize: 13,
                }}
              >
                {lab}
                {r.quantity > 1 ? ` × ${r.quantity}` : ""}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

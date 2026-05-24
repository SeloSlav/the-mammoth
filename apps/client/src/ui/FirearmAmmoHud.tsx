import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DbConnection } from "../module_bindings";
import {
  getLocalFirearmChamberView,
} from "../game/fpHotbar/fpFirearmChamber";
import {
  firearmAmmoDefIdForWeapon,
  hotbarDefIdSupportsRangedAttack,
} from "../game/fpHotbar/fpHotbarResolve";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import { BOTTOM_FP_HUD_INSET } from "./PlayerVitalsHud";

const NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  pointerEvents: "none",
};

type Props = { conn: DbConnection };

function resolveActiveRangedWeaponDefId(conn: DbConnection): string | null {
  const owner = conn.identity;
  if (!owner) return null;
  const active = conn.db.player_active_hotbar.identity.find(owner);
  if (!active) return null;
  const slot =
    typeof active.slotIndex === "number" ? active.slotIndex : Number(active.slotIndex);
  if (slot === 255) return null;
  for (const row of conn.db.inventory_item) {
    const loc = row.location;
    if (loc.tag !== "Hotbar") continue;
    const v = loc.value;
    if (!v.ownerId.isEqual(owner)) continue;
    if (v.slotIndex !== slot) continue;
    const defId = String(row.defId ?? "");
    if (hotbarDefIdSupportsRangedAttack(defId)) return defId;
    return null;
  }
  return null;
}

export function FirearmAmmoHud({ conn }: Props) {
  const [ver, setVer] = useState(0);

  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    conn.db.player_firearm_chamber.onInsert(bump);
    conn.db.player_firearm_chamber.onUpdate(bump);
    conn.db.player_firearm_chamber.onDelete(bump);
    conn.db.inventory_item.onInsert(bump);
    conn.db.inventory_item.onUpdate(bump);
    conn.db.inventory_item.onDelete(bump);
    conn.db.player_active_hotbar.onInsert(bump);
    conn.db.player_active_hotbar.onUpdate(bump);
    conn.db.player_active_hotbar.onDelete(bump);
    return () => {
      conn.db.player_firearm_chamber.removeOnInsert(bump);
      conn.db.player_firearm_chamber.removeOnUpdate(bump);
      conn.db.player_firearm_chamber.removeOnDelete(bump);
      conn.db.inventory_item.removeOnInsert(bump);
      conn.db.inventory_item.removeOnUpdate(bump);
      conn.db.inventory_item.removeOnDelete(bump);
      conn.db.player_active_hotbar.removeOnInsert(bump);
      conn.db.player_active_hotbar.removeOnUpdate(bump);
      conn.db.player_active_hotbar.removeOnDelete(bump);
    };
  }, [conn]);

  useEffect(() => {
    const id = window.setInterval(() => setVer((v) => v + 1), 120);
    return () => window.clearInterval(id);
  }, []);

  const display = useMemo(() => {
    void ver;
    const owner = conn.identity;
    if (!owner) return null;
    const weaponDefId = resolveActiveRangedWeaponDefId(conn);
    if (!weaponDefId) return null;
    const view = getLocalFirearmChamberView(conn, owner, weaponDefId);
    const ammoDef = firearmAmmoDefIdForWeapon(weaponDefId);
    const ammoLabel = ammoDef
      ? (getMammothItemDef(ammoDef)?.displayName ?? ammoDef)
      : "Ammo";
    return { weaponDefId, view, ammoLabel };
  }, [conn, ver]);

  if (!display) return null;

  const { view, ammoLabel } = display;
  const right = "max(16px, calc(env(safe-area-inset-right, 0px) + 10px))";
  const reloading = view.isReloading;

  return (
    <div
      style={{
        position: "fixed",
        bottom: BOTTOM_FP_HUD_INSET,
        right,
        zIndex: 118,
        minWidth: 148,
        padding: "10px 14px",
        borderRadius: 10,
        background: "linear-gradient(145deg, rgba(18,22,34,0.94), rgba(10,12,20,0.97))",
        border: "1px solid rgba(255,180,90,0.42)",
        boxShadow:
          "0 0 18px rgba(255,140,60,0.18), inset 0 0 16px rgba(200,100,40,0.05), 0 8px 28px rgba(0,0,0,0.5)",
        ...NO_SELECT,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "rgba(255,200,140,0.78)",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        Ammo
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: reloading ? "rgba(255,200,120,0.72)" : "#ffe8cc",
          textShadow: "0 0 10px rgba(255,160,80,0.35)",
          lineHeight: 1.1,
        }}
      >
        {view.chamberCount} / {view.capacity}{" "}
        <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,220,180,0.88)" }}>
          ({view.reserveCount})
        </span>
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 10,
          color: "rgba(200,180,160,0.62)",
          letterSpacing: "0.02em",
        }}
      >
        {reloading ? "Reloading…" : `${ammoLabel} · R to reload`}
      </div>
    </div>
  );
}

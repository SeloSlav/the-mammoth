/** Balcony grow-op inspect overlay — read-only tray/slot stats from subscribed rows + catalog. */

import { useMemo, useSyncExternalStore } from "react";
import {
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowSpeedModifier,
} from "@the-mammoth/schemas";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import type { DbConnection } from "../module_bindings";
import {
  getBalconyGrowInspectTarget,
  subscribeBalconyGrowInspectTarget,
} from "../game/fpBalconyGrow/fpBalconyGrowInspectState.js";
import { readBalconyGrowOpUnitState } from "../inventory/balconyGrowOpState.js";

const PHASE_LABELS: Record<number, string> = {
  0: "Empty",
  1: "Growing",
  2: "Ready to harvest",
  3: "Wilted",
};

function formatEta(matureAtMicros: number): string {
  const now = Date.now() * 1000;
  const remain = Math.max(0, matureAtMicros - now);
  const mins = Math.ceil(remain / 60_000_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function BalconyGrowInspectHud(props: { conn: DbConnection | null }) {
  const target = useSyncExternalStore(
    subscribeBalconyGrowInspectTarget,
    getBalconyGrowInspectTarget,
    getBalconyGrowInspectTarget,
  );

  const growState = useMemo(() => {
    if (!props.conn || !target) {
      return { plant: null, tray: null, lightsOn: true, fertilizerPresent: false };
    }
    const state = readBalconyGrowOpUnitState(props.conn, target.unitKey);
    const plant =
      state.plants.find(
        (p) => p.trayId === target.trayId && p.slotIndex === target.slotIndex,
      ) ?? null;
    const tray = state.trays.find((t) => t.trayId === target.trayId) ?? null;
    const lightsOn = state.light?.lightsOn !== 0;
    const stashKey = `${target.unitKey}#grow_tray:${target.trayId}`;
    let fertilizerPresent = false;
    for (const row of props.conn.db.inventory_item) {
      if (row.location.tag !== "Stash") continue;
      if (row.location.value.unitKey !== stashKey) continue;
      if (row.defId === "balcony-grow-substrate") fertilizerPresent = true;
    }
    return { plant, tray, lightsOn, fertilizerPresent };
  }, [props.conn, target]);

  const { plant, tray, lightsOn, fertilizerPresent } = growState;
  const cropDef = plant ? getMammothItemDef(plant.cropDefId) : undefined;

  if (!target || !plant || !tray || !cropDef) return null;

  const modifier = balconyGrowSpeedModifier({
    lightsOn,
    fertilizerPresent,
    waterLiters: tray.waterLiters,
  });

  return (
    <div
      className="mammoth-grow-inspect"
      style={{
        position: "fixed",
        right: 16,
        top: "38%",
        width: 280,
        padding: "12px 14px",
        background: "rgba(8, 12, 10, 0.88)",
        border: "1px solid rgba(120, 180, 120, 0.35)",
        borderRadius: 8,
        color: "#e8f0e8",
        fontSize: 13,
        lineHeight: 1.45,
        pointerEvents: "none",
        zIndex: 40,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{cropDef.displayName}</div>
      <div style={{ opacity: 0.75, marginBottom: 8 }}>{cropDef.description.slice(0, 90)}…</div>
      <div>Phase: {PHASE_LABELS[plant.phase] ?? "Unknown"}</div>
      {plant.phase === 1 ? (
        <div>ETA: {formatEta(Number(plant.matureAtMicros))}</div>
      ) : null}
      <div style={{ marginTop: 8 }}>
        Modifiers: {modifier.toFixed(2)}×
        {lightsOn ? " · Light +15%" : ""}
        {fertilizerPresent ? " · Fertilizer +20%" : ""}
        {tray.waterLiters > 0 ? ` · Water ${Math.round(tray.waterLiters * 100) / 100}L` : ""}
      </div>
      <div style={{ marginTop: 6 }}>
        Tray water: {tray.waterLiters.toFixed(1)} / {BALCONY_GROW_TRAY_MAX_WATER_L} L
      </div>
      <div style={{ marginTop: 4, opacity: 0.85 }}>
        {fertilizerPresent ? "Substrate in tray slot" : "No fertilizer in tray"}
        {" · "}
        {tray.waterLiters > 0 ? "Soil moist" : "Soil dry"}
      </div>
    </div>
  );
}

/** Balcony grow-op inspect overlay — anchored above the aimed plant slot in screen space. */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowSpeedModifier,
  balconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { getMammothItemDef } from "../inventory/mammothItemCatalog";
import type { DbConnection } from "../module_bindings";
import {
  getBalconyGrowInspectTarget,
  subscribeBalconyGrowInspectTarget,
} from "../game/fpBalconyGrow/fpBalconyGrowInspectState";
import {
  getBalconyGrowInspectScreenAnchor,
  subscribeBalconyGrowInspectScreenAnchor,
} from "../game/fpBalconyGrow/fpBalconyGrowInspectPresentation";
import {
  readBalconyGrowOpUnitState,
  subscribeBalconyGrowOpTables,
} from "../inventory/balconyGrowOpState.js";
import type { BalconyGrowInspectTarget } from "../game/fpBalconyGrow/fpBalconyGrowInspectTypes";

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

function formatPlantedAt(plantedAtMicros: number): string {
  const d = new Date(plantedAtMicros / 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function waterStatusLabel(liters: number): string {
  if (liters <= 0.05) return "dry";
  if (liters < 0.5) return "low";
  if (liters >= BALCONY_GROW_TRAY_MAX_WATER_L - 0.05) return "full";
  return "ok";
}

function growProgress01(plantedAtMicros: number, matureAtMicros: number): number {
  const now = Date.now() * 1000;
  if (matureAtMicros <= plantedAtMicros) return 1;
  return Math.min(1, Math.max(0, (now - plantedAtMicros) / (matureAtMicros - plantedAtMicros)));
}

export function BalconyGrowInspectHud(props: { conn: DbConnection | null }) {
  const target = useSyncExternalStore<BalconyGrowInspectTarget | null>(
    subscribeBalconyGrowInspectTarget,
    getBalconyGrowInspectTarget,
    getBalconyGrowInspectTarget,
  );
  const screenAnchor = useSyncExternalStore(
    subscribeBalconyGrowInspectScreenAnchor,
    getBalconyGrowInspectScreenAnchor,
    getBalconyGrowInspectScreenAnchor,
  );
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    if (!props.conn) return;
    const bump = () => setLiveTick((t) => t + 1);
    const unsubDb = subscribeBalconyGrowOpTables(props.conn, bump);
    let raf = 0;
    const loop = () => {
      if (getBalconyGrowInspectTarget()) bump();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      unsubDb();
      cancelAnimationFrame(raf);
    };
  }, [props.conn]);

  void liveTick;

  if (!props.conn || !target || !screenAnchor?.visible) return null;

  const state = readBalconyGrowOpUnitState(props.conn, target.unitKey);
  const plant =
    state.plants.find(
      (p) =>
        p.trayId === target.trayId && Number(p.slotIndex) === Number(target.slotIndex),
    ) ?? null;
  const tray = state.trays.find((t) => t.trayId === target.trayId) ?? null;
  const lightsOn = state.light?.lightsOn !== 0;
  const stashKey = balconyGrowTrayStashKey(target.unitKey, target.trayId);
  let fertilizerPresent = false;
  for (const row of props.conn.db.inventory_item) {
    if (row.location.tag !== "Stash") continue;
    if (row.location.value.unitKey !== stashKey) continue;
    if (row.defId === "balcony-grow-substrate") fertilizerPresent = true;
  }

  const cropDef = plant ? getMammothItemDef(plant.cropDefId) : undefined;
  const cropLabel = cropDef?.displayName ?? plant?.cropDefId ?? "Plant";
  if (!plant) return null;

  const trayWaterLiters = tray?.waterLiters ?? 0;
  const modifier = balconyGrowSpeedModifier({
    lightsOn,
    fertilizerPresent,
    waterLiters: trayWaterLiters,
  });
  const progress =
    plant.phase === 1
      ? growProgress01(Number(plant.plantedAtMicros), Number(plant.matureAtMicros))
      : plant.phase === 2
        ? 1
        : 0;

  return (
    <div
      className="mammoth-grow-inspect"
      style={{
        position: "fixed",
        left: screenAnchor.x,
        top: screenAnchor.y,
        transform: "translate(-50%, calc(-100% - 10px))",
        width: 220,
        padding: "10px 12px",
        background: "rgba(8, 14, 11, 0.92)",
        border: "1px solid rgba(120, 190, 130, 0.45)",
        borderRadius: 8,
        color: "#e8f0e8",
        fontSize: 12,
        lineHeight: 1.4,
        pointerEvents: "none",
        zIndex: 125,
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 2, fontSize: 13 }}>{cropLabel}</div>
      <div style={{ opacity: 0.82, marginBottom: 6 }}>
        {PHASE_LABELS[plant.phase] ?? "Unknown"}
        {plant.phase === 1 ? ` · ~${formatEta(Number(plant.matureAtMicros))} left` : ""}
      </div>
      <div style={{ opacity: 0.75, marginBottom: 6, fontSize: 11 }}>
        Planted {formatPlantedAt(Number(plant.plantedAtMicros))}
      </div>
      {plant.phase === 1 ? (
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,0.1)",
            marginBottom: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #3d8b4a, #7ecf8a)",
            }}
          />
        </div>
      ) : null}
      <div style={{ opacity: 0.9 }}>
        Growth {modifier.toFixed(2)}×
        {lightsOn ? " · grow light on" : " · no grow light"}
        {fertilizerPresent ? " · fertilized" : " · no fertilizer"}
      </div>
      <div style={{ marginTop: 4, opacity: 0.82 }}>
        Water {trayWaterLiters.toFixed(1)}/{BALCONY_GROW_TRAY_MAX_WATER_L} L ({waterStatusLabel(trayWaterLiters)})
      </div>
    </div>
  );
}

/** Balcony grow-op inspect overlay — anchored above the aimed plant slot in screen space. */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowDaysRemaining,
  balconyGrowProgressFromDays,
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

function formatDayProgress(daysGrown: number, targetDays: number): string {
  if (targetDays <= 0) return "—";
  const remain = balconyGrowDaysRemaining(daysGrown, targetDays);
  if (remain <= 0) return "ready tonight";
  return remain === 1 ? "1 night left" : `${remain} nights left`;
}

function waterStatusLabel(liters: number): string {
  if (liters <= 0.05) return "dry";
  if (liters < 0.5) return "low";
  if (liters >= BALCONY_GROW_TRAY_MAX_WATER_L - 0.05) return "full";
  return "ok";
}

function waterStatusLabel(liters: number): string {
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
    return unsubDb;
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
  const daysGrown = Number(plant.daysGrown);
  const targetDays = Number(plant.targetDays);
  const progress =
    plant.phase === 1
      ? balconyGrowProgressFromDays(daysGrown, targetDays)
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
        {plant.phase === 1 && targetDays > 0
          ? ` · day ${daysGrown}/${targetDays} · ${formatDayProgress(daysGrown, targetDays)}`
          : ""}
      </div>
      {plant.phase === 1 && targetDays > 0 ? (
        <div style={{ opacity: 0.75, marginBottom: 6, fontSize: 11 }}>
          Grows when you sleep — faster with fertilizer at plant time
        </div>
      ) : null}
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

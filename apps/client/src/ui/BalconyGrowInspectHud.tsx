/** Balcony grow-op inspect overlay — anchored above the aimed plant slot in screen space. */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getFpPlayerMenuHudOpen,
  subscribeFpPlayerMenuHudOpen,
} from "../game/fpInteraction/fpPlayerMenuHudOpen";
import {
  BALCONY_GROW_TRAY_MAX_WATER_L,
  balconyGrowDaysRemaining,
  balconyGrowPlantReadyByDays,
  balconyGrowProgressFromDays,
} from "@the-mammoth/schemas";
import {
  getMammothItemDef,
  mammothBalconyGrowHarvestDisplayName,
} from "../inventory/mammothItemCatalog";
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

type Props = {
  conn: DbConnection | null;
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

function cropInspectLabel(cropDefId: string, phase: number, daysGrown: number, targetDays: number): string {
  const ready = balconyGrowPlantReadyByDays(phase, daysGrown, targetDays);
  if (ready) return mammothBalconyGrowHarvestDisplayName(cropDefId);
  return getMammothItemDef(cropDefId)?.displayName ?? cropDefId;
}

export function BalconyGrowInspectHud({ conn }: Props) {
  const playerMenuOpen = useSyncExternalStore(
    subscribeFpPlayerMenuHudOpen,
    getFpPlayerMenuHudOpen,
    getFpPlayerMenuHudOpen,
  );
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
    if (!conn) return;
    const bump = () => setLiveTick((t) => t + 1);
    const unsubDb = subscribeBalconyGrowOpTables(conn, bump);
    return unsubDb;
  }, [conn]);

  void liveTick;

  if (playerMenuOpen) return null;
  if (!conn || !target || !screenAnchor?.visible) return null;

  const state = readBalconyGrowOpUnitState(conn, target.unitKey);
  const plant =
    state.plants.find(
      (p) =>
        p.trayId === target.trayId && Number(p.slotIndex) === Number(target.slotIndex),
    ) ?? null;
  const tray = state.trays.find((t) => t.trayId === target.trayId) ?? null;
  const lightsOn = state.light?.lightsOn !== 0;
  const fertilizerPresent = state.traysWithSubstrate.has(target.trayId);

  if (!plant) return null;

  const daysGrown = Number(plant.daysGrown);
  const targetDays = Number(plant.targetDays);
  const fertilizedOvernight = Number(plant.substrateFedOvernight) !== 0;
  const cropLabel = cropInspectLabel(plant.cropDefId, Number(plant.phase), daysGrown, targetDays);
  const trayWaterLiters = tray?.waterLiters ?? 0;
  const readyToHarvest = balconyGrowPlantReadyByDays(
    Number(plant.phase),
    daysGrown,
    targetDays,
  );
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
        zIndex: 110,
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
          {lightsOn
            ? "Grows when you sleep — keep tray watered for better harvest"
            : "No grow light — won't advance when you sleep"}
          {fertilizedOvernight ? " · tray fed overnight" : ""}
        </div>
      ) : null}
      {readyToHarvest ? (
        <div style={{ opacity: 0.75, marginBottom: 6, fontSize: 11 }}>
          Well-watered trays can yield extra food and seeds
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
        {lightsOn ? "Grow light on" : "No grow light"}
        {fertilizedOvernight ? " · fed overnight" : ""}
        {fertilizerPresent ? " · compost ready" : ""}
      </div>
      <div style={{ marginTop: 4, opacity: 0.82 }}>
        Water {trayWaterLiters.toFixed(1)}/{BALCONY_GROW_TRAY_MAX_WATER_L} L ({waterStatusLabel(trayWaterLiters)})
      </div>
    </div>
  );
}

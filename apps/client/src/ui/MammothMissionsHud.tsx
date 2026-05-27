import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { DbConnection } from "../module_bindings";
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSession/fpSessionGameUiHidden";
import {
  readLocalPlayerMissionProgress,
  subscribePlayerMissionProgress,
} from "../game/missions/mountPlayerMissionSync";
import {
  getFpMissionsPanelOpen,
  setFpMissionsPanelOpen,
  subscribeFpMissionsPanel,
} from "../game/missions/fpMissionsPanelState";
import {
  buildPlayerMissionPanelEntry,
  hasActivePlayerMission,
  missionStatusLabel,
} from "../game/missions/playerMissionDisplay";
import { MISSION_STATUS } from "@the-mammoth/schemas";
import {
  THEME_ACCENT,
  THEME_CARD_BORDER,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
} from "@the-mammoth/ui-theme";
import { MAMMOTH_HUD_STACK_CARD_STYLE } from "./mammothHudPanelStyles";

type Props = {
  conn: DbConnection;
};

export function MammothMissionsHud({ conn }: Props) {
  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );
  const panelOpen = useSyncExternalStore(
    subscribeFpMissionsPanel,
    getFpMissionsPanelOpen,
    getFpMissionsPanelOpen,
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribePlayerMissionProgress(conn, () => setTick((t) => t + 1));
  }, [conn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameUiHidden || isTextInputFocused()) return;
      if (e.code !== "KeyJ" || e.repeat) return;
      e.preventDefault();
      setFpMissionsPanelOpen(!getFpMissionsPanelOpen());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [gameUiHidden]);

  const progressRow = useMemo(
    () => readLocalPlayerMissionProgress(conn),
    [conn, tick],
  );
  const mission = useMemo(
    () => buildPlayerMissionPanelEntry(progressRow),
    [progressRow],
  );
  const missionActive = hasActivePlayerMission(progressRow);

  useEffect(() => {
    if (missionActive && !getFpMissionsPanelOpen()) {
      setFpMissionsPanelOpen(true);
    }
  }, [missionActive]);

  if (gameUiHidden || !missionActive || !panelOpen || !mission) return null;

  return (
    <div
      data-mammoth-missions="open"
      style={{
        ...MAMMOTH_HUD_STACK_CARD_STYLE,
        minWidth: 118,
      }}
      title="Active work order — press J to hide"
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: THEME_TEXT_FAINT, fontSize: 10, letterSpacing: "0.04em" }}>
            WORK ORDER · J
          </div>
          <div style={{ fontSize: 12, fontWeight: 650, lineHeight: 1.3 }}>{mission.title}</div>
        </div>
        <div
          style={{
            fontSize: 9,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color:
              mission.status === MISSION_STATUS.COMPLETE ? THEME_ACCENT : THEME_TEXT_MUTED,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {missionStatusLabel(mission.status)}
        </div>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        {mission.steps.map((step) => (
          <li
            key={step.id}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
              fontSize: 11,
              lineHeight: 1.35,
              color: step.done ? THEME_TEXT_MUTED : THEME_TEXT_PRIMARY,
              textDecoration: step.done ? "line-through" : undefined,
              opacity: step.done ? 0.82 : 1,
            }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                width: 14,
                height: 14,
                marginTop: 1,
                borderRadius: 3,
                border: `1px solid ${step.done ? THEME_ACCENT : THEME_CARD_BORDER}`,
                background: step.done ? "rgba(107,140,174,0.35)" : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: THEME_ACCENT,
              }}
            >
              {step.done ? "✓" : ""}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

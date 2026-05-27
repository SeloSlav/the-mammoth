import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { DbConnection } from "../module_bindings";
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import {
  notifyFpGameHudExclusiveOpen,
  subscribeFpGameHudExclusiveCloseOthers,
} from "../game/fpInteraction/fpGameHudExclusive.js";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSession/fpSessionGameUiHidden";
import {
  readLocalPlayerMissionProgress,
  subscribePlayerMissionProgress,
} from "../game/missions/mountPlayerMissionSync";
import { setFpMissionsPanelOpen } from "../game/missions/fpMissionsPanelState";
import {
  buildPlayerMissionPanelEntry,
  hasActivePlayerMission,
  missionStatusLabel,
} from "../game/missions/playerMissionDisplay";
import { MISSION_STATUS } from "@the-mammoth/schemas";
import {
  THEME_ACCENT,
  THEME_BACKDROP_SCRIM,
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_DIVIDER,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

const MISSIONS_OVERLAY_Z_INDEX = 375;

type Props = {
  conn: DbConnection;
};

export function MammothMissionsHud({ conn }: Props) {
  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribePlayerMissionProgress(conn, () => setTick((t) => t + 1));
  }, [conn]);

  useEffect(() => {
    setFpMissionsPanelOpen(open);
    return () => setFpMissionsPanelOpen(false);
  }, [open]);

  useEffect(() => {
    return subscribeFpGameHudExclusiveCloseOthers((keeping) => {
      if (keeping === "missions") return;
      setOpen(false);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameUiHidden || isTextInputFocused()) return;
      if (e.code !== "KeyJ" || e.repeat) return;
      e.preventDefault();
      setOpen((o) => {
        const next = !o;
        if (next) notifyFpGameHudExclusiveOpen("missions");
        return next;
      });
      if (document.pointerLockElement) void document.exitPointerLock();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [gameUiHidden]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || isTextInputFocused()) return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open]);

  const progressRow = useMemo(
    () => readLocalPlayerMissionProgress(conn),
    [conn, tick],
  );
  const mission = useMemo(
    () => buildPlayerMissionPanelEntry(progressRow),
    [progressRow],
  );
  const showHudHint = hasActivePlayerMission(progressRow);

  if (gameUiHidden) return null;

  return createPortal(
    <>
      {showHudHint && !open ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 45,
            pointerEvents: "none",
            fontFamily: UI_FONT_SANS,
            fontSize: 12,
            color: THEME_TEXT_MUTED,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Missions · J
        </div>
      ) : null}
      {open ? (
        <div
          data-mammoth-missions="open"
          data-mammoth-no-hotbar-wheel="true"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: MISSIONS_OVERLAY_Z_INDEX,
            background: THEME_BACKDROP_SCRIM,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: UI_FONT_SANS,
            boxSizing: "border-box",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mammoth-missions-title"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 520px)",
              maxHeight: "min(88vh, 640px)",
              display: "flex",
              flexDirection: "column",
              padding: "18px 20px",
              borderRadius: 12,
              background: THEME_CARD_BG,
              border: `1px solid ${THEME_CARD_BORDER}`,
              color: THEME_TEXT_PRIMARY,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                paddingBottom: 12,
                marginBottom: 12,
                borderBottom: `1px solid ${THEME_DIVIDER}`,
              }}
            >
              <div id="mammoth-missions-title" style={{ fontSize: 18, fontWeight: 650 }}>
                Work orders
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: `1px solid ${THEME_CARD_BORDER}`,
                  background: "rgba(0,0,0,0.45)",
                  color: THEME_TEXT_PRIMARY,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Close · Esc
              </button>
            </div>

            {!mission ? (
              <div style={{ color: THEME_TEXT_FAINT, fontSize: 14, lineHeight: 1.5 }}>
                No active work orders. Check the maintenance net or building hubs for the next
                assignment.
              </div>
            ) : (
              <div style={{ overflowY: "auto", minHeight: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{mission.title}</div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color:
                        mission.status === MISSION_STATUS.COMPLETE
                          ? THEME_ACCENT
                          : THEME_TEXT_MUTED,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {missionStatusLabel(mission.status)}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: THEME_TEXT_MUTED, marginBottom: 16 }}>
                  {mission.issuer}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginBottom: 18,
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${THEME_CARD_BORDER}`,
                      background: "rgba(0,0,0,0.28)",
                    }}
                  >
                    <div style={{ color: THEME_TEXT_FAINT, marginBottom: 4 }}>Target deck</div>
                    <div>{mission.targetElevatorDeck}</div>
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${THEME_CARD_BORDER}`,
                      background: "rgba(0,0,0,0.28)",
                    }}
                  >
                    <div style={{ color: THEME_TEXT_FAINT, marginBottom: 4 }}>Objective</div>
                    <div>
                      {mission.objectiveItemLabel} · {mission.targetPublicLabel}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: THEME_TEXT_FAINT, marginBottom: 8 }}>
                  Progress
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  {mission.steps.map((step) => (
                    <li
                      key={step.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        fontSize: 14,
                        lineHeight: 1.45,
                        color: step.done ? THEME_TEXT_MUTED : THEME_TEXT_PRIMARY,
                        textDecoration: step.done ? "line-through" : undefined,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          width: 18,
                          height: 18,
                          marginTop: 2,
                          borderRadius: 4,
                          border: `1px solid ${step.done ? THEME_ACCENT : THEME_CARD_BORDER}`,
                          background: step.done ? "rgba(107,140,174,0.35)" : "transparent",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          color: THEME_ACCENT,
                        }}
                      >
                        {step.done ? "✓" : ""}
                      </span>
                      <span>{step.label}</span>
                    </li>
                  ))}
                </ul>

                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 12,
                    borderTop: `1px solid ${THEME_DIVIDER}`,
                    display: "flex",
                    gap: 16,
                    fontSize: 12,
                    color: THEME_TEXT_MUTED,
                  }}
                >
                  <span>Collected: {mission.itemCollected ? "yes" : "no"}</span>
                  <span>Deposited: {mission.itemDeposited ? "yes" : "no"}</span>
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: `1px solid ${THEME_DIVIDER}`,
                fontSize: 11,
                color: THEME_TEXT_FAINT,
                letterSpacing: "0.04em",
              }}
            >
              Press J to toggle · one active order at a time
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}

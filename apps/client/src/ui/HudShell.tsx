import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { DbConnection } from "../module_bindings";
import {
  closeFpActiveStashPanel,
  getFpActiveStashPanel,
  subscribeFpActiveStashPanel,
} from "../game/fpInteraction/fpActiveStashPanel";
import { isTextInputFocused } from "../game/isTextInputFocused";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSession/fpSessionGameUiHidden";
import { MammothInventoryHud } from "../inventory/MammothInventoryHud";
import { MammothStashHud } from "../inventory/MammothStashHud";
import { MammothElevatorHud } from "./MammothElevatorHud";
import { MammothFpReticule } from "./MammothFpReticule";
import { MammothCompassHud } from "./MammothCompassHud";
import { MammothFpsHud } from "./MammothFpsHud";
import { MammothCraftQueueStrip } from "./MammothCraftQueueStrip";
import { MammothCraftingHud } from "./MammothCraftingHud";
import { MammothDebugMenuHud } from "./MammothDebugMenuHud";
import { MammothPickupPromptHud } from "./MammothPickupPromptHud";
import { MammothToastHud } from "./MammothToastHud";
import { PlayerDeathOverlay } from "./PlayerDeathOverlay";
import { PlayerDamageFeedbackOverlay } from "./PlayerDamageFeedbackOverlay";
import { PlayerVitalsHud } from "./PlayerVitalsHud";

type HudProps = {
  onSignOut: () => void;
  conn: DbConnection | null;
};

/** React shell for HUD / inventory; engine loop stays outside React (see App.tsx). */
export function HudShell({ onSignOut, conn }: HudProps) {
  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );

  const activeStash = useSyncExternalStore(
    subscribeFpActiveStashPanel,
    getFpActiveStashPanel,
    () => null,
  );

  const [quitModalOpen, setQuitModalOpen] = useState(false);

  useEffect(() => {
    if (!quitModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuitModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quitModalOpen]);

  useEffect(() => {
    if (!activeStash) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || isTextInputFocused()) return;
      e.preventDefault();
      closeFpActiveStashPanel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeStash]);

  const confirmQuitToMainMenu = useCallback(() => {
    setQuitModalOpen(false);
    onSignOut();
  }, [onSignOut]);

  const [craftStripReserveAboveVitalsPx, setCraftStripReserveAboveVitalsPx] = useState(0);
  const onCraftStripReserve = useCallback((px: number) => {
    setCraftStripReserveAboveVitalsPx((prev) => (prev === px ? prev : px));
  }, []);

  const btnHud: CSSProperties = {
    fontSize: 13,
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(0,0,0,0.45)",
    color: "#e8e8ee",
    cursor: "pointer",
  };

  return (
    <>
      {conn ? <PlayerDeathOverlay conn={conn} /> : null}
      {conn ? <PlayerDamageFeedbackOverlay conn={conn} /> : null}
      <div style={gameUiHidden ? { display: "none" } : undefined}>
        <div
          style={{
            position: "fixed",
            left: 12,
            top: 12,
            zIndex: 50,
            pointerEvents: "auto",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <button
            type="button"
            style={btnHud}
            onClick={() => setQuitModalOpen(true)}
          >
            Quit to main menu
          </button>
        </div>

        {quitModalOpen ? (
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 210,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              background: "rgba(5, 8, 14, 0.86)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setQuitModalOpen(false)}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="quit-main-title"
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => e.preventDefault()}
              style={{
                width: "min(92vw, 400px)",
                padding: "22px 24px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "linear-gradient(180deg, rgba(28,16,20,0.96), rgba(12,10,14,0.98))",
                boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
                color: "#f3f5f8",
                textAlign: "center",
              }}
            >
              <div
                id="quit-main-title"
                style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}
              >
                Quit to main menu?
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.88, marginBottom: 20 }}>
                You will leave this session and return to the login screen.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setQuitModalOpen(false)}
                  style={{
                    ...btnHud,
                    minWidth: 100,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmQuitToMainMenu}
                  style={{
                    ...btnHud,
                    minWidth: 100,
                    borderColor: "rgba(230,72,80,0.45)",
                    background: "linear-gradient(180deg, rgba(210,60,68,0.92), rgba(148,28,34,0.96))",
                  }}
                >
                  Quit
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <MammothCompassHud />
        <MammothDebugMenuHud />
        {conn ? <MammothCraftingHud conn={conn} /> : null}
        {conn ? (
          <MammothToastHud conn={conn} reserveAboveVitalsExtraPx={craftStripReserveAboveVitalsPx} />
        ) : null}
        {conn ? <MammothInventoryHud conn={conn} activeStash={activeStash} /> : null}
        {conn ? <MammothCraftQueueStrip conn={conn} onReserveAboveVitalsExtraPx={onCraftStripReserve} /> : null}
        {conn ? <PlayerVitalsHud conn={conn} /> : null}
        <MammothFpsHud />
        <MammothPickupPromptHud />
        {conn && activeStash ? (
          <MammothStashHud
            conn={conn}
            stashKey={activeStash.stashKey}
            stashLabel={activeStash.stashLabel}
            stashKind={activeStash.stashKind}
          />
        ) : null}
        <MammothElevatorHud />
        <MammothFpReticule />
      </div>
    </>
  );
}

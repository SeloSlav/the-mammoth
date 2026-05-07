import { useSyncExternalStore } from "react";
import type { DbConnection } from "../module_bindings";
import {
  getFpActiveStashPanelUnitKey,
  subscribeFpActiveStashPanelUnitKey,
} from "../game/fpInteraction/fpActiveStashPanel";
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
import { MammothCraftingHud } from "./MammothCraftingHud";
import { MammothDebugMenuHud } from "./MammothDebugMenuHud";
import { MammothPickupPromptHud } from "./MammothPickupPromptHud";
import { MammothToastHud } from "./MammothToastHud";
import { PlayerDeathOverlay } from "./PlayerDeathOverlay";
import { PlayerDamageFeedbackOverlay } from "./PlayerDamageFeedbackOverlay";
import { PlayerVitalsHud } from "./PlayerVitalsHud";
import { MAMMOTH_LOGO_PUBLIC_PATH } from "@the-mammoth/ui-theme";

type HudProps = {
  displayName: string;
  onSignOut: () => void;
  conn: DbConnection | null;
};

/** React shell for HUD / inventory; engine loop stays outside React (see App.tsx). */
export function HudShell({ displayName, onSignOut, conn }: HudProps) {
  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );

  const stashUnitKey = useSyncExternalStore(
    subscribeFpActiveStashPanelUnitKey,
    getFpActiveStashPanelUnitKey,
    () => null,
  );

  return (
    <>
      {conn ? <PlayerDeathOverlay conn={conn} /> : null}
      {conn ? <PlayerDamageFeedbackOverlay conn={conn} /> : null}
      <div style={gameUiHidden ? { display: "none" } : undefined}>
        <div
          onDragStart={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: 12,
            top: 12,
            zIndex: 50,
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(0,0,0,0.45)",
            color: "#e8e8ee",
            fontSize: 13,
            pointerEvents: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 2,
            }}
          >
            <img
              src={MAMMOTH_LOGO_PUBLIC_PATH}
              alt=""
              decoding="async"
              style={{
                height: 28,
                width: "auto",
                maxWidth: 132,
                objectFit: "contain",
                display: "block",
                opacity: 0.96,
              }}
            />
            <span>
              <span style={{ opacity: 0.9 }}>—</span> <strong>{displayName}</strong>
            </span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.78, marginTop: 5, maxWidth: 280 }}>
            {
              "Solo flat crawl — WASD move · Shift sprint · C crouch · Space jump · Alt hold free-look · Alt+Z hide HUD · Tab inventory · B craft · M debug"
            }
          </div>
          <div style={{ marginTop: 8, pointerEvents: "auto" }}>
            <button
              type="button"
              onClick={onSignOut}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.35)",
                color: "#ccc",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        <MammothCompassHud />
        <MammothDebugMenuHud />
        {conn ? <MammothCraftingHud conn={conn} /> : null}
        {conn ? <MammothToastHud conn={conn} /> : null}
        {conn ? <MammothInventoryHud conn={conn} activeStashUnitKey={stashUnitKey} /> : null}
        {conn ? <PlayerVitalsHud conn={conn} /> : null}
        <MammothFpsHud />
        <MammothPickupPromptHud />
        {conn && stashUnitKey ? <MammothStashHud conn={conn} unitKey={stashUnitKey} /> : null}
        <MammothElevatorHud />
        <MammothFpReticule />
      </div>
    </>
  );
}

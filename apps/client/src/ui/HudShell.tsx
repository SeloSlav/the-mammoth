import { useSyncExternalStore } from "react";
import type { DbConnection } from "../module_bindings";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSessionGameUiHidden";
import { MammothInventoryHud } from "../inventory/MammothInventoryHud";
import { MammothElevatorHud } from "./MammothElevatorHud";
import { MammothFpReticule } from "./MammothFpReticule";
import { MammothFpsHud } from "./MammothFpsHud";
import { MammothPickupPromptHud } from "./MammothPickupPromptHud";
import { PlayerDeathOverlay } from "./PlayerDeathOverlay";
import { PlayerVitalsHud } from "./PlayerVitalsHud";

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

  return (
    <>
      {conn ? <PlayerDeathOverlay conn={conn} /> : null}
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
          The Mammoth — <strong>{displayName}</strong>
          <div style={{ fontSize: 11, opacity: 0.78, marginTop: 5, maxWidth: 280 }}>
            {
              "WASD move · Shift sprint · C crouch · Space jump · Alt hold free-look · Alt+Z hide HUD · click canvas to look · Tab inventory"
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
        {conn ? <MammothInventoryHud conn={conn} /> : null}
        {conn ? <PlayerVitalsHud conn={conn} /> : null}
        <MammothFpsHud />
        <MammothPickupPromptHud />
        <MammothElevatorHud />
        <MammothFpReticule />
      </div>
    </>
  );
}

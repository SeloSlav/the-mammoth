import type { DbConnection } from "../module_bindings";
import { MammothInventoryHud } from "../inventory/MammothInventoryHud";
import { MammothFpReticule } from "./MammothFpReticule";
import { PlayerVitalsHud } from "./PlayerVitalsHud";
import { PlayerDamageFeedbackOverlay } from "./PlayerDamageFeedbackOverlay";
import { PlayerDeathOverlay } from "./PlayerDeathOverlay";

type Props = {
  conn: DbConnection;
  onExit: () => void;
};

/** Trimmed HUD for editor + dev combat sim (hotbar, reticule, vitals, combat feedback). */
export function CombatSimMinimalHud({ conn, onExit }: Props) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 50,
          display: "flex",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onExit}
          style={{
            padding: "8px 14px",
            background: "rgba(20,24,36,0.88)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Exit combat sim
        </button>
      </div>
      <MammothFpReticule />
      <PlayerVitalsHud conn={conn} />
      <PlayerDamageFeedbackOverlay conn={conn} />
      <PlayerDeathOverlay conn={conn} />
      <MammothInventoryHud conn={conn} />
    </>
  );
}

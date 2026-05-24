import type { DbConnection } from "../module_bindings";
import { MammothInventoryHud } from "../inventory/MammothInventoryHud";
import { MammothFpReticule } from "./MammothFpReticule";
import { MammothPickupPromptHud } from "./MammothPickupPromptHud";
import { PlayerVitalsHud } from "./PlayerVitalsHud";
import { FirearmAmmoHud } from "./FirearmAmmoHud";
import { PlayerDamageFeedbackOverlay } from "./PlayerDamageFeedbackOverlay";
import { PlayerDeathOverlay } from "./PlayerDeathOverlay";
import { MammothDebugMenuHud } from "./MammothDebugMenuHud";

type Props = {
  conn: DbConnection;
  onExit: () => void;
};

/** Trimmed HUD for `?combatSim=1` (hotbar, reticule, vitals, combat feedback). */
export function CombatSimMinimalHud({ conn, onExit }: Props) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 50,
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
      <MammothDebugMenuHud />
      <MammothFpReticule />
      <PlayerVitalsHud conn={conn} />
      <FirearmAmmoHud conn={conn} />
      <PlayerDamageFeedbackOverlay conn={conn} />
      <PlayerDeathOverlay conn={conn} />
      {/*
       * Same bottom "Press E" bar as live FP (`HudShell`). Stacked above {@link PlayerDeathOverlay}
       * (400) so loot recovery works while dead in the arena.
       */}
      <div style={{ position: "fixed", inset: 0, zIndex: 450, pointerEvents: "none" }}>
        <MammothPickupPromptHud />
      </div>
      <MammothInventoryHud conn={conn} />
    </>
  );
}

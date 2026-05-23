import {
  editorChromeHelp,
  editorChromeLabel,
  editorChromeRowBtn,
  editorChromeSection,
} from "./editorChromeStyles.js";
import { EditorChromeSectionTitleIcon } from "./EditorChromeSectionTitleIcon.js";
import { EDITOR_CHROME_SECTION } from "./editorChromeSectionAnchors.js";
import { faCrosshairs } from "@fortawesome/free-solid-svg-icons";
import { useEditorStore } from "../state/editorStore.js";
import { useShallow } from "zustand/react/shallow";

const DEFAULT_BABUSHKA_SPAWN = {
  archetype: "babushka" as const,
  fx: 0.72,
  fz: 0.62,
  yawRad: Math.PI,
};

export function EditorChromeCombatSim() {
  const {
    npcCombatSpawns,
    combatSimPlayActive,
    addNpcCombatSpawn,
    removeNpcCombatSpawn,
    patchOwnedApartmentBuiltins,
    setCombatSimPlayActive,
  } = useEditorStore(
    useShallow((s) => ({
      npcCombatSpawns: s.ownedApartmentBuiltins.npcCombatSpawns,
      combatSimPlayActive: s.combatSimPlayActive,
      addNpcCombatSpawn: s.addNpcCombatSpawn,
      removeNpcCombatSpawn: s.removeNpcCombatSpawn,
      patchOwnedApartmentBuiltins: s.patchOwnedApartmentBuiltins,
      setCombatSimPlayActive: s.setCombatSimPlayActive,
    })),
  );

  return (
    <div
      id={EDITOR_CHROME_SECTION.combatSim}
      style={{ ...editorChromeSection, scrollMarginTop: 6 }}
    >
      <EditorChromeSectionTitleIcon icon={faCrosshairs}>Combat sim</EditorChromeSectionTitleIcon>
      <p style={{ ...editorChromeHelp, fontSize: 12, marginTop: 6 }}>
        Place NPC spawns in layout fractions (same as décor). Play mounts the same FP session and
        server reducers as the game client — save layout JSON so spawns persist to disk.
      </p>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {!combatSimPlayActive ? (
          <button type="button" style={editorChromeRowBtn} onClick={() => setCombatSimPlayActive(true)}>
            Play combat sim
          </button>
        ) : (
          <button type="button" style={editorChromeRowBtn} onClick={() => setCombatSimPlayActive(false)}>
            Stop (layout mode)
          </button>
        )}
        <button
          type="button"
          style={editorChromeRowBtn}
          disabled={combatSimPlayActive}
          onClick={() =>
            addNpcCombatSpawn({
              ...DEFAULT_BABUSHKA_SPAWN,
              id: `combat_spawn_babushka_${npcCombatSpawns.length}`,
            })
          }
        >
          Add babushka spawn
        </button>
      </div>
      <span style={{ ...editorChromeLabel, marginTop: 12 }}>
        NPC spawns ({npcCombatSpawns.length})
      </span>
      {npcCombatSpawns.length === 0 ? (
        <p style={{ ...editorChromeHelp, fontSize: 11, marginTop: 4 }}>
          No spawns — server uses a default babushka across the room from bed.
        </p>
      ) : (
        <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12 }}>
          {npcCombatSpawns.map((spawn) => (
            <li key={spawn.id} style={{ marginBottom: 6 }}>
              <strong>{spawn.archetype}</strong> fx={spawn.fx.toFixed(2)} fz={spawn.fz.toFixed(2)}{" "}
              yaw={(spawn.yawRad * (180 / Math.PI)).toFixed(0)}°
              <button
                type="button"
                style={{ ...editorChromeRowBtn, marginLeft: 8, padding: "2px 8px", fontSize: 11 }}
                disabled={combatSimPlayActive}
                onClick={() =>
                  patchOwnedApartmentBuiltins((doc) => ({
                    ...doc,
                    npcCombatSpawns: doc.npcCombatSpawns.map((s) =>
                      s.id === spawn.id ? { ...s, fx: Math.min(1, s.fx + 0.05) } : s,
                    ),
                  }))
                }
              >
                +X
              </button>
              <button
                type="button"
                style={{ ...editorChromeRowBtn, marginLeft: 4, padding: "2px 8px", fontSize: 11 }}
                disabled={combatSimPlayActive}
                onClick={() => removeNpcCombatSpawn(spawn.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

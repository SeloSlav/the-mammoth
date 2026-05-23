import { useEditorStore } from "../state/editorStore.js";

/** Center-screen entry when combat sim workspace is in layout (not play) mode. */
export function EditorCombatSimViewportPrompt() {
  const combatSimPlayActive = useEditorStore((s) => s.combatSimPlayActive);
  const setCombatSimPlayActive = useEditorStore((s) => s.setCombatSimPlayActive);

  if (combatSimPlayActive) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 48,
        transform: "translateX(-50%)",
        zIndex: 15,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "14px 20px",
        background: "rgba(12,14,22,0.88)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 10,
        color: "#e8ecf4",
        fontSize: 13,
        boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        pointerEvents: "auto",
      }}
    >
      <span style={{ opacity: 0.9 }}>Combat sim layout — place NPC spawns, then play</span>
      <button
        type="button"
        onClick={() => setCombatSimPlayActive(true)}
        style={{
          padding: "10px 22px",
          background: "#6a3a5a",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Play combat sim
      </button>
    </div>
  );
}

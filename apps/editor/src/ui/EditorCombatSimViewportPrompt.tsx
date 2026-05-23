const COMBAT_SIM_CLIENT_URL = "http://localhost:5173/?combatSim=1";

/** Center-screen hint when combat sim workspace is in layout (spawn authoring) mode. */
export function EditorCombatSimViewportPrompt() {
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
        maxWidth: 420,
        textAlign: "center",
      }}
    >
      <span style={{ opacity: 0.9 }}>
        Place NPC spawns in the sidebar, save layout JSON, then fight in the game client (same FP
        stack + server reducers).
      </span>
      <a
        href={COMBAT_SIM_CLIENT_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: "10px 22px",
          background: "#6a3a5a",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Open combat sim in game client
      </a>
    </div>
  );
}

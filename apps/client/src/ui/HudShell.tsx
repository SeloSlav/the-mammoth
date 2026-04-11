type HudProps = {
  displayName: string;
  onSignOut: () => void;
};

/** React shell for HUD / inventory; engine loop stays outside React (see App.tsx). */
export function HudShell({ displayName, onSignOut }: HudProps) {
  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        top: 12,
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.45)",
        color: "#e8e8ee",
        fontSize: 13,
        pointerEvents: "none",
      }}
    >
      The Mammoth — <strong>{displayName}</strong>
      <div style={{ fontSize: 11, opacity: 0.78, marginTop: 5, maxWidth: 280 }}>
        WASD move · Shift sprint · C crouch · Space jump · click canvas to look
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
  );
}

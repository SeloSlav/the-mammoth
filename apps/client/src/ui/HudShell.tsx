type HudProps = {
  displayName: string;
};

/** React shell for HUD / inventory; engine loop stays outside React (see App.tsx). */
export function HudShell({ displayName }: HudProps) {
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
    </div>
  );
}

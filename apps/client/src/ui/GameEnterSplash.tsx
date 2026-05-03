/**
 * Covers the WebGPU canvas while `mountFpSession` completes.
 * Deliberately bright + high z-index — the game canvas can sit in its own layer and read as “solid black”
 * while WebGPU clears / compiles even when this component is present behind it.
 */
export function GameEnterSplash() {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      data-mammoth-game-enter-splash="1"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        gap: 14,
        pointerEvents: "none",
        padding: 24,
        textAlign: "center",
        boxSizing: "border-box",
        background:
          "radial-gradient(circle at 50% 42%, rgba(120, 172, 238, 0.22), transparent 55%), linear-gradient(168deg, #1a2433 0%, #0e1219 55%, #151c28 100%)",
        color: "#e4eaf4",
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "1rem",
          fontWeight: 650,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#f2f6fc",
        }}
      >
        Raising the block…
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "0.88rem",
          lineHeight: 1.5,
          maxWidth: "min(420px, 90vw)",
          color: "rgba(228, 234, 244, 0.78)",
        }}
      >
        Assembling the megablock meshes and WebGPU session. This can take a moment on first load.
      </p>
    </div>
  );
}

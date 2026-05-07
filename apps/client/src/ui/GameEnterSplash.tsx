import { MAMMOTH_LOGO_PUBLIC_PATH } from "@the-mammoth/ui-theme";

/**
 * Covers the WebGPU canvas while `mountFpSession` completes.
 * Deliberately bright + high z-index — the game canvas can sit in its own layer and read as “solid black”
 * while WebGPU clears / compiles even when this component is present behind it.
 */
export function GameEnterSplash() {
  return (
    <>
      <style>{`
        @keyframes game-enter-splash-logo-flash {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.22;
          }
        }
        .game-enter-splash__logo {
          animation: game-enter-splash-logo-flash 1.05s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .game-enter-splash__logo {
            animation: none;
            opacity: 1;
          }
        }
      `}</style>
      <div
        aria-live="polite"
        aria-busy="true"
        data-mammoth-game-enter-splash="1"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          display: "grid",
          gridTemplateRows: "1fr auto 1fr",
          width: "100%",
          minHeight: "100vh",
          boxSizing: "border-box",
          padding: 24,
          pointerEvents: "none",
          textAlign: "center",
          background:
            "radial-gradient(circle at 50% 42%, rgba(120, 172, 238, 0.22), transparent 55%), linear-gradient(168deg, #1a2433 0%, #0e1219 55%, #151c28 100%)",
          color: "#e4eaf4",
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 20,
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
        </div>

        <img
          className="game-enter-splash__logo"
          src={MAMMOTH_LOGO_PUBLIC_PATH}
          width={440}
          alt="The Mammoth"
          decoding="async"
          fetchPriority="high"
          draggable={false}
          style={{
            display: "block",
            maxWidth: "min(440px, 88vw)",
            width: "100%",
            height: "auto",
            maxHeight: "min(220px, 38vh)",
            objectFit: "contain",
            justifySelf: "center",
            alignSelf: "center",
            userSelect: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 20,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.88rem",
              lineHeight: 1.5,
              maxWidth: "min(420px, 90vw)",
              color: "rgba(228, 234, 244, 0.78)",
            }}
          >
            Assembling the megablock meshes and WebGPU session. This can take a
            moment on first load.
          </p>
        </div>
      </div>
    </>
  );
}

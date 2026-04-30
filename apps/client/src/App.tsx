import { useEffect, useRef, useState } from "react";
import { mountFpSession } from "./game/mountFpSession";
import { HudShell } from "./ui/HudShell";
import LoginGate from "./ui/LoginGate";
import { useSpacetimeSession } from "./spacetime/SpacetimeProvider";
import {
  THEME_CARD_BG_STRONG,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

const REQUIRE_REGISTERED_APARTMENT_CLAIMS =
  import.meta.env.VITE_REQUIRE_REGISTERED_APARTMENT_CLAIMS === "true";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const session = useSpacetimeSession();
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [fpSessionReady, setFpSessionReady] = useState(false);

  useEffect(() => {
    if (session.phase !== "ready" || !session.displayName) {
      setFpSessionReady(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const conn = session.conn;
    if (!conn) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    setGpuError(null);
    setFpSessionReady(false);
    void mountFpSession(canvas, conn, {
      apartmentClaimsAllowed:
        !REQUIRE_REGISTERED_APARTMENT_CLAIMS || session.connectionKind === "oidc",
    })
      .then((d) => {
        if (cancelled) {
          d();
          return;
        }
        dispose = d;
        setFpSessionReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setGpuError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- omit `session.conn`: identity churn remounts the FP session while phase+name unchanged
  }, [session.phase, session.displayName]);

  if (session.phase !== "ready" || !session.displayName) {
    return <LoginGate session={session} />;
  }

  return (
    <>
      {gpuError ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#0f1118",
            color: "#e8ecf4",
            fontFamily: "system-ui, sans-serif",
            fontSize: 15,
            lineHeight: 1.5,
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <strong style={{ display: "block", marginBottom: 12 }}>WebGPU required</strong>
            {gpuError}
          </div>
        </div>
      ) : null}
      {!gpuError && !fpSessionReady ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 15,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: THEME_CARD_BG_STRONG,
            color: THEME_TEXT_PRIMARY,
            fontFamily: UI_FONT_SANS,
            pointerEvents: "none",
          }}
        >
          <div style={{ textAlign: "center", lineHeight: 1.45 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Entering The Mammoth</div>
            <div style={{ marginTop: 6, fontSize: 12, color: THEME_TEXT_MUTED }}>
              Warming up the building...
            </div>
          </div>
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        data-mammoth-fp-canvas="1"
        style={{ position: "fixed", inset: 0 }}
      />
      <HudShell
        displayName={session.displayName}
        onSignOut={session.signOut}
        conn={session.conn}
      />
    </>
  );
}

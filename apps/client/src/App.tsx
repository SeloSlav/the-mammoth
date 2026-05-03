import { useEffect, useRef, useState } from "react";
import { fpLoadingDbgMark } from "./game/fpSession/fpLoadingDebug.js";
import { mountFpSession } from "./game/mountFpSession";
import { HudShell } from "./ui/HudShell";
import LoginGate from "./ui/LoginGate";
import { useSpacetimeSession } from "./spacetime/SpacetimeProvider";

const REQUIRE_REGISTERED_APARTMENT_CLAIMS =
  import.meta.env.VITE_REQUIRE_REGISTERED_APARTMENT_CLAIMS === "true";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const session = useSpacetimeSession();
  const [gpuError, setGpuError] = useState<string | null>(null);

  useEffect(() => {
    if (session.phase !== "ready" || !session.displayName) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const conn = session.conn;
    if (!conn) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    setGpuError(null);

    fpLoadingDbgMark("react_app:canvas_mount_effect_run", {
      canvasW: canvas.clientWidth,
      canvasH: canvas.clientHeight,
    });
    queueMicrotask(() => {
      fpLoadingDbgMark("react_app:first_microtask_after_mount_effect");
    });
    requestAnimationFrame(() => {
      fpLoadingDbgMark("react_app:first_browser_raf_before_gpu_session_ready");
    });

    const mountStartedAt = performance.now();
    void mountFpSession(canvas, conn, {
      apartmentClaimsAllowed:
        !REQUIRE_REGISTERED_APARTMENT_CLAIMS || session.connectionKind === "oidc",
    })
      .then((d) => {
        if (cancelled) {
          d();
          return;
        }
        fpLoadingDbgMark("react_app:mount_fp_session_resolved", {
          waitMs: Math.round(performance.now() - mountStartedAt),
        });
        dispose = d;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        fpLoadingDbgMark("react_app:mount_fp_session_rejected", {
          waitMs: Math.round(performance.now() - mountStartedAt),
          message: e instanceof Error ? e.message : String(e),
        });
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

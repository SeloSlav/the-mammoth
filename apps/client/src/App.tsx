import { useEffect, useMemo, useRef, useState } from "react";
import { fpLoadingDbgMark } from "./game/fpSession/fpLoadingDebug.js";
import { mountFpSession } from "./game/mountFpSession";
import { mountCombatSimSession } from "./game/combatSim";
import { HudShell } from "./ui/HudShell";
import { CombatSimMinimalHud } from "./ui/CombatSimMinimalHud";
import LoginGate from "./ui/LoginGate";
import { useSpacetimeSession } from "./spacetime/SpacetimeProvider";
import { GameEnterSplash } from "./ui/GameEnterSplash";

const REQUIRE_REGISTERED_APARTMENT_CLAIMS =
  import.meta.env.VITE_REQUIRE_REGISTERED_APARTMENT_CLAIMS === "true";

function readCombatSimUrlFlag(): boolean {
  return new URLSearchParams(window.location.search).get("combatSim") === "1";
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const session = useSpacetimeSession();
  const combatSimMode = useMemo(() => readCombatSimUrlFlag(), []);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [fpSessionMounted, setFpSessionMounted] = useState(false);

  useEffect(() => {
    if (session.phase !== "ready" || !session.displayName) {
      setFpSessionMounted(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const conn = session.conn;
    if (!conn) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    setGpuError(null);
    setFpSessionMounted(false);

    fpLoadingDbgMark("react_app:canvas_mount_effect_run", {
      canvasW: canvas.clientWidth,
      canvasH: canvas.clientHeight,
      combatSimMode,
    });
    queueMicrotask(() => {
      fpLoadingDbgMark("react_app:first_microtask_after_mount_effect");
    });
    requestAnimationFrame(() => {
      fpLoadingDbgMark("react_app:first_browser_raf_before_gpu_session_ready");
    });

    const mountStartedAt = performance.now();
    const mountPromise = combatSimMode
      ? mountCombatSimSession(canvas, conn)
      : mountFpSession(canvas, conn, {
          apartmentClaimsAllowed:
            !REQUIRE_REGISTERED_APARTMENT_CLAIMS || session.connectionKind === "oidc",
        });

    void mountPromise
      .then((d) => {
        if (cancelled) {
          d();
          return;
        }
        fpLoadingDbgMark("react_app:mount_fp_session_resolved", {
          waitMs: Math.round(performance.now() - mountStartedAt),
          combatSimMode,
        });
        dispose = d;
        setFpSessionMounted(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFpSessionMounted(false);
        fpLoadingDbgMark("react_app:mount_fp_session_rejected", {
          waitMs: Math.round(performance.now() - mountStartedAt),
          message: e instanceof Error ? e.message : String(e),
        });
        setGpuError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      setFpSessionMounted(false);
      dispose?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- omit `session.conn`: identity churn remounts the FP session while phase+name unchanged
  }, [session.phase, session.displayName, combatSimMode]);

  if (session.phase !== "ready" || !session.displayName) {
    return <LoginGate session={session} />;
  }

  const exitCombatSim = () => {
    const conn = session.conn;
    if (conn) void conn.reducers.leaveCombatSim({});
    const url = new URL(window.location.href);
    url.searchParams.delete("combatSim");
    window.location.replace(url.toString());
  };

  return (
    <>
      {session.phase === "ready" &&
      session.displayName &&
      !gpuError &&
      !fpSessionMounted ? (
        <GameEnterSplash />
      ) : null}
      {gpuError ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 110,
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
        aria-hidden={!fpSessionMounted}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          opacity: gpuError ? 1 : fpSessionMounted ? 1 : 0,
          visibility: gpuError || fpSessionMounted ? "visible" : "hidden",
          pointerEvents: fpSessionMounted ? "auto" : "none",
        }}
      />
      {fpSessionMounted && session.conn ? (
        combatSimMode ? (
          <CombatSimMinimalHud conn={session.conn} onExit={exitCombatSim} />
        ) : (
          <HudShell onSignOut={session.signOut} conn={session.conn} />
        )
      ) : null}
    </>
  );
}

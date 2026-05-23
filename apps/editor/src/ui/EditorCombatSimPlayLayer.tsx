import { useEffect, useRef, useState } from "react";
import { mountCombatSimSession } from "@the-mammoth/client/game/combatSim";
import { DEFAULT_COMBAT_SIM_USERNAME } from "@the-mammoth/client/spacetime/useCombatSimSpacetimeConnection";
import { CombatSimMinimalHud } from "@the-mammoth/client/ui/CombatSimMinimalHud";
import { useEditorCombatSimSpacetimeSession } from "../spacetime/EditorCombatSimSpacetimeProvider.js";
import { useEditorStore } from "../state/editorStore.js";

const MOUNT_PHASE_LABEL: Record<string, string> = {
  sync_spawns: "Syncing NPC spawns…",
  enter_combat_sim: "Entering combat sim on server…",
  load_fp_session: "Loading world geometry (first load can take ~1 min)…",
  ready: "Starting…",
};

export function EditorCombatSimPlayLayer(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onExit: () => void;
}) {
  const session = useEditorCombatSimSpacetimeSession();
  const npcSpawns = useEditorStore((s) => s.ownedApartmentBuiltins.npcCombatSpawns);
  const [mounted, setMounted] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [mountPhase, setMountPhase] = useState<string>("connecting");
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (session.phase === "needs_name" && session.conn) {
      void session.submitUsername(DEFAULT_COMBAT_SIM_USERNAME);
    }
  }, [session.phase, session.conn, session.submitUsername]);

  useEffect(() => {
    if (session.phase !== "ready" || !session.conn) {
      setMounted(false);
      setMountPhase("connecting");
      return;
    }
    const canvas = props.canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setGpuError(null);
    setMountPhase("load_fp_session");
    void mountCombatSimSession(canvas, session.conn, {
      npcSpawns,
      onMountPhase: (phase) => {
        if (!cancelled) setMountPhase(phase);
      },
    })
      .then((dispose) => {
        if (cancelled) {
          dispose();
          return;
        }
        disposeRef.current = dispose;
        setMounted(true);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setGpuError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
      setMounted(false);
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [session.phase, session.conn, npcSpawns, props.canvasRef]);

  if (session.phase === "error") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(8,10,16,0.92)",
          color: "#fcc",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <strong>Combat sim connection failed</strong>
          <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{session.errorMsg}</p>
          <button type="button" onClick={session.reconnect} style={{ marginTop: 12 }}>
            Retry
          </button>
          <button type="button" onClick={props.onExit} style={{ marginTop: 12, marginLeft: 8 }}>
            Exit
          </button>
        </div>
      </div>
    );
  }

  if (gpuError) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f1118",
          color: "#e8ecf4",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <strong>WebGPU / session error</strong>
          <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{gpuError}</p>
          <button type="button" onClick={props.onExit} style={{ marginTop: 12 }}>
            Exit
          </button>
        </div>
      </div>
    );
  }

  if (session.phase !== "ready" || !mounted || !session.conn) {
    const label =
      session.phase === "idle" || session.phase === "connecting" || session.phase === "needs_name"
        ? "Connecting combat sim…"
        : (MOUNT_PHASE_LABEL[mountPhase] ?? "Starting combat sim…");
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 25,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: "rgba(8,10,16,0.72)",
          color: "#e8ecf4",
          fontSize: 14,
          pointerEvents: "auto",
        }}
      >
        <span style={{ maxWidth: 420, textAlign: "center" }}>{label}</span>
        <button
          type="button"
          onClick={props.onExit}
          style={{
            padding: "8px 16px",
            background: "rgba(20,24,36,0.9)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return <CombatSimMinimalHud conn={session.conn} onExit={props.onExit} />;
}

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_COMBAT_SIM_USERNAME,
  useCombatSimSpacetimeConnection,
} from "@the-mammoth/client/spacetime/useCombatSimSpacetimeConnection";
import { mountCombatSimSession } from "@the-mammoth/client/game/combatSim";
import { CombatSimMinimalHud } from "@the-mammoth/client/ui/CombatSimMinimalHud";
import { useEditorStore } from "../state/editorStore.js";

export function EditorCombatSimPlayLayer(props: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onExit: () => void;
}) {
  const session = useCombatSimSpacetimeConnection();
  const npcSpawns = useEditorStore((s) => s.ownedApartmentBuiltins.npcCombatSpawns);
  const [mounted, setMounted] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (session.phase === "needs_name" && session.conn) {
      void session.submitUsername(DEFAULT_COMBAT_SIM_USERNAME);
    }
  }, [session.phase, session.conn, session.submitUsername]);

  useEffect(() => {
    if (session.phase !== "ready" || !session.conn) {
      setMounted(false);
      return;
    }
    const canvas = props.canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    setGpuError(null);
    void mountCombatSimSession(canvas, session.conn, { npcSpawns })
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
          <p style={{ marginTop: 8 }}>{session.errorMsg}</p>
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
          <p style={{ marginTop: 8 }}>{gpuError}</p>
          <button type="button" onClick={props.onExit} style={{ marginTop: 12 }}>
            Exit
          </button>
        </div>
      </div>
    );
  }

  if (session.phase !== "ready" || !mounted || !session.conn) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 25,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(8,10,16,0.55)",
          color: "#e8ecf4",
          fontSize: 14,
          pointerEvents: "none",
        }}
      >
        Connecting combat sim…
      </div>
    );
  }

  return <CombatSimMinimalHud conn={session.conn} onExit={props.onExit} />;
}

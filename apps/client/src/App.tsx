import { useEffect, useRef } from "react";
import { mountFpSession } from "./game/mountFpSession";
import { HudShell } from "./ui/HudShell";
import { LoginGate } from "./ui/LoginGate";
import { useSpacetimeSession } from "./spacetime/SpacetimeProvider";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const session = useSpacetimeSession();

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
    void mountFpSession(canvas, conn).then((d) => {
      if (cancelled) {
        d();
        return;
      }
      dispose = d;
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
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0 }} />
      <HudShell
        displayName={session.displayName}
        onSignOut={session.signOut}
        conn={session.conn}
      />
    </>
  );
}

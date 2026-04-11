import { useEffect, useRef } from "react";
import { mountFpSession } from "./game/mountFpSession";
import { HudShell } from "./ui/HudShell";
import { LoginGate } from "./ui/LoginGate";
import { useSpacetimeConnection } from "./spacetime/useSpacetimeConnection";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const session = useSpacetimeConnection();

  useEffect(() => {
    if (session.phase !== "ready" || !session.conn || !session.displayName) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountFpSession(canvas, session.conn);
  }, [session.phase, session.conn, session.displayName]);

  if (session.phase !== "ready" || !session.displayName) {
    return <LoginGate session={session} />;
  }

  return (
    <>
      <canvas ref={canvasRef} style={{ position: "fixed", inset: 0 }} />
      <HudShell displayName={session.displayName} />
    </>
  );
}

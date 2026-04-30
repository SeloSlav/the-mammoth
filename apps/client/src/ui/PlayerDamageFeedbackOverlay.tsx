import { useEffect, useRef, useState } from "react";
import type { DbConnection } from "../module_bindings";
import type { PlayerVitals } from "../module_bindings/types";

type Props = {
  conn: DbConnection;
};

const HIT_FLASH_MS = 520;
const HEALTH_DROP_EPS = 0.05;

function readLocalHealth(conn: DbConnection): number | null {
  const id = conn.identity;
  if (!id) return null;
  const row = conn.db.player_vitals.identity.find(id) as PlayerVitals | undefined;
  return row?.health ?? null;
}

export function PlayerDamageFeedbackOverlay({ conn }: Props) {
  const [hitSeq, setHitSeq] = useState(0);
  const [severity, setSeverity] = useState(0);
  const lastHealthRef = useRef<number | null>(null);
  const clearRef = useRef<number | null>(null);

  useEffect(() => {
    lastHealthRef.current = readLocalHealth(conn);

    const onVitalsChanged = () => {
      const next = readLocalHealth(conn);
      const prev = lastHealthRef.current;
      lastHealthRef.current = next;
      if (next == null || prev == null || next >= prev - HEALTH_DROP_EPS) return;

      const drop = prev - next;
      setSeverity(Math.min(1, 0.34 + drop / 45));
      setHitSeq((v) => v + 1);
      if (clearRef.current !== null) window.clearTimeout(clearRef.current);
      clearRef.current = window.setTimeout(() => {
        setSeverity(0);
        clearRef.current = null;
      }, HIT_FLASH_MS);
    };

    conn.db.player_vitals.onInsert(onVitalsChanged);
    conn.db.player_vitals.onUpdate(onVitalsChanged);
    conn.db.player_vitals.onDelete(onVitalsChanged);
    return () => {
      conn.db.player_vitals.removeOnInsert(onVitalsChanged);
      conn.db.player_vitals.removeOnUpdate(onVitalsChanged);
      conn.db.player_vitals.removeOnDelete(onVitalsChanged);
      if (clearRef.current !== null) window.clearTimeout(clearRef.current);
    };
  }, [conn]);

  if (severity <= 0) return null;

  return (
    <div
      key={hitSeq}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        pointerEvents: "none",
        opacity: severity,
        mixBlendMode: "screen",
        animation: `mammothDamageFlash ${HIT_FLASH_MS}ms ease-out forwards`,
        background: [
          "radial-gradient(circle at 18% 22%, rgba(150, 0, 0, 0.42) 0 2px, transparent 3px 100%)",
          "radial-gradient(circle at 74% 31%, rgba(190, 14, 20, 0.34) 0 3px, transparent 4px 100%)",
          "radial-gradient(circle at 63% 72%, rgba(115, 0, 0, 0.38) 0 2px, transparent 3px 100%)",
          "radial-gradient(circle at center, transparent 38%, rgba(155, 0, 0, 0.36) 70%, rgba(120, 0, 0, 0.72) 100%)",
          "linear-gradient(rgba(185, 0, 0, 0.18), rgba(185, 0, 0, 0.18))",
        ].join(", "),
      }}
    >
      <style>{`
        @keyframes mammothDamageFlash {
          0% { opacity: ${severity}; filter: saturate(1.35); }
          38% { opacity: ${Math.max(0.18, severity * 0.62)}; }
          100% { opacity: 0; filter: saturate(1); }
        }
      `}</style>
    </div>
  );
}

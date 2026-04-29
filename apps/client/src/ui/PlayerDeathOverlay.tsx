import { useEffect, useMemo, useState } from "react";
import type { DbConnection } from "../module_bindings";
import type { PlayerVitals } from "../module_bindings/types";

type Props = {
  conn: DbConnection;
};

export function PlayerDeathOverlay({ conn }: Props) {
  const [ver, setVer] = useState(0);
  const [respawning, setRespawning] = useState(false);

  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    conn.db.player_vitals.onInsert(bump);
    conn.db.player_vitals.onUpdate(bump);
    conn.db.player_vitals.onDelete(bump);
    return () => {
      conn.db.player_vitals.removeOnInsert(bump);
      conn.db.player_vitals.removeOnUpdate(bump);
      conn.db.player_vitals.removeOnDelete(bump);
    };
  }, [conn]);

  const row = useMemo((): PlayerVitals | null => {
    void ver;
    const id = conn.identity;
    if (!id) return null;
    return (conn.db.player_vitals.identity.find(id) as PlayerVitals | undefined) ?? null;
  }, [conn, ver]);

  const dead = (row?.health ?? 1) <= 0;

  useEffect(() => {
    if (!dead) {
      setRespawning(false);
      return;
    }
    void document.exitPointerLock?.();
  }, [dead]);

  if (!dead) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(5, 8, 14, 0.86)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: "min(92vw, 440px)",
          padding: "26px 28px 24px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "linear-gradient(180deg, rgba(28,16,20,0.96), rgba(12,10,14,0.98))",
          boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
          color: "#f3f5f8",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(255,180,180,0.7)",
            marginBottom: 10,
          }}
        >
          You Died
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>Respawn Required</div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(226,232,240,0.82)", marginBottom: 20 }}>
          Your character is dead. Respawn to return to the ground floor.
        </div>
        <button
          type="button"
          disabled={respawning}
          onClick={() => {
            setRespawning(true);
            void conn.reducers.respawnPlayer({}).finally(() => {
              setRespawning(false);
            });
          }}
          style={{
            minWidth: 170,
            padding: "11px 18px",
            borderRadius: 9,
            border: "1px solid rgba(255,255,255,0.14)",
            background: respawning
              ? "rgba(110, 120, 140, 0.35)"
              : "linear-gradient(180deg, rgba(210,60,68,0.95), rgba(148,28,34,0.98))",
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            cursor: respawning ? "default" : "pointer",
          }}
        >
          {respawning ? "Respawning..." : "Respawn"}
        </button>
      </div>
    </div>
  );
}

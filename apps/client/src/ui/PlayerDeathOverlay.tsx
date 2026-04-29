import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DbConnection } from "../module_bindings";
import type { ApartmentUnit, PlayerVitals } from "../module_bindings/types";
import { UNIT_STATE_CLAIMED } from "../game/fpApartment/fpApartmentGameplay";

type Props = {
  conn: DbConnection;
};

function playerHasClaimedApartment(conn: DbConnection): boolean {
  const id = conn.identity;
  if (!id) return false;
  for (const row of conn.db.apartment_unit) {
    const u = row as ApartmentUnit;
    if (u.state === UNIT_STATE_CLAIMED && u.owner != null && u.owner.isEqual(id)) {
      return true;
    }
  }
  return false;
}

export function PlayerDeathOverlay({ conn }: Props) {
  const [ver, setVer] = useState(0);
  const [busyMode, setBusyMode] = useState<number | null>(null);

  useEffect(() => {
    const bump = () => setVer((v) => v + 1);
    conn.db.player_vitals.onInsert(bump);
    conn.db.player_vitals.onUpdate(bump);
    conn.db.player_vitals.onDelete(bump);
    conn.db.apartment_unit.onInsert(bump);
    conn.db.apartment_unit.onUpdate(bump);
    conn.db.apartment_unit.onDelete(bump);
    return () => {
      conn.db.player_vitals.removeOnInsert(bump);
      conn.db.player_vitals.removeOnUpdate(bump);
      conn.db.player_vitals.removeOnDelete(bump);
      conn.db.apartment_unit.removeOnInsert(bump);
      conn.db.apartment_unit.removeOnUpdate(bump);
      conn.db.apartment_unit.removeOnDelete(bump);
    };
  }, [conn]);

  const row = useMemo((): PlayerVitals | null => {
    void ver;
    const id = conn.identity;
    if (!id) return null;
    return (conn.db.player_vitals.identity.find(id) as PlayerVitals | undefined) ?? null;
  }, [conn, ver]);

  const hasClaimedApartment = useMemo(() => {
    void ver;
    return playerHasClaimedApartment(conn);
  }, [conn, ver]);

  const dead = (row?.health ?? 1) <= 0;

  useEffect(() => {
    if (!dead) {
      setBusyMode(null);
      return;
    }
    void document.exitPointerLock?.();
  }, [dead]);

  if (!dead) {
    return null;
  }

  const btnBase: CSSProperties = {
    minWidth: 148,
    padding: "11px 14px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    cursor: busyMode !== null ? "default" : "pointer",
  };

  const runRespawn = (mode: number) => {
    setBusyMode(mode);
    void conn.reducers.respawnPlayer({ mode }).finally(() => {
      setBusyMode(null);
    });
  };

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
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(226,232,240,0.82)", marginBottom: 22 }}>
          {hasClaimedApartment ? (
            <>
              You have a claimed apartment. Respawn at your bed — your residential doors lock (including if left open)
              — or respawn at a random stairwell landing like players without a unit.
            </>
          ) : (
            <>You will respawn at a random stairwell landing.</>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
          }}
        >
          {hasClaimedApartment ? (
            <>
              <button
                type="button"
                disabled={busyMode !== null}
                onClick={() => runRespawn(1)}
                style={{
                  ...btnBase,
                  background:
                    busyMode !== null
                      ? "rgba(110, 120, 140, 0.35)"
                      : "linear-gradient(180deg, rgba(210,60,68,0.95), rgba(148,28,34,0.98))",
                }}
              >
                {busyMode === 1 ? "Respawning..." : "Respawn in apartment"}
              </button>
              <button
                type="button"
                disabled={busyMode !== null}
                onClick={() => runRespawn(0)}
                style={{
                  ...btnBase,
                  background:
                    busyMode !== null
                      ? "rgba(110, 120, 140, 0.35)"
                      : "linear-gradient(180deg, rgba(52, 96, 140, 0.92), rgba(28, 52, 88, 0.96))",
                }}
              >
                {busyMode === 0 ? "Respawning..." : "Random stairwell"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busyMode !== null}
              onClick={() => runRespawn(0)}
              style={{
                ...btnBase,
                minWidth: 170,
                fontSize: 15,
                background:
                  busyMode !== null
                    ? "rgba(110, 120, 140, 0.35)"
                    : "linear-gradient(180deg, rgba(210,60,68,0.95), rgba(148,28,34,0.98))",
              }}
            >
              {busyMode === 0 ? "Respawning..." : "Random stairwell"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { DbConnection } from "../module_bindings";
import type { ApartmentUnit, PlayerVitals } from "../module_bindings/types";
import { UNIT_STATE_CLAIMED } from "../game/fpApartment/fpApartmentGameplay";
import { isFpCombatSimMode } from "../game/combatSim/fpCombatSimMode";

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
  const [busy, setBusy] = useState(false);

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
  const inCombatSim = isFpCombatSimMode();

  useEffect(() => {
    if (!dead) {
      setBusy(false);
      return;
    }
    void document.exitPointerLock?.();
  }, [dead]);

  if (!dead) {
    return null;
  }

  const runRespawn = () => {
    setBusy(true);
    // `mode` is ignored server-side; apartment-first routing is always used.
    void conn.reducers.respawnPlayer({ mode: 1 }).finally(() => {
      setBusy(false);
    });
  };

  const btnBase: CSSProperties = {
    minWidth: 170,
    padding: "11px 14px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 800,
    cursor: busy ? "default" : "pointer",
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
          {inCombatSim ? (
            <>
              Your gear spilled where you fell. Press E to pick it up, or respawn empty-handed at the arena
              center and run back for it.
            </>
          ) : hasClaimedApartment ? (
            <>
              Someone on your floor dragged you back inside. A night passes — you wake at your bed with basic
              survival supplies. Everything you were carrying spilled where you fell — go back for it. Balcony crops
              advance one day.
            </>
          ) : (
            <>
              Recovery without a leased unit completes in the building&apos;s ground-level foyer — a night passes and
              you wake with basic survival supplies. Your gear spilled where you died — return to collect it. Lease a
              residence to recover at your apartment bed instead.
            </>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            disabled={busy}
            onClick={runRespawn}
            style={{
              ...btnBase,
              background:
                busy ?
                  "rgba(110, 120, 140, 0.35)"
                : "linear-gradient(180deg, rgba(210,60,68,0.95), rgba(148,28,34,0.98))",
            }}
          >
            {busy ? "Respawning..." : "Respawn"}
          </button>
        </div>
      </div>
    </div>
  );
}

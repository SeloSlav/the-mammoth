import { useCallback, useEffect, useRef, useState } from "react";
import { DbConnection as DbConnectionClass } from "../module_bindings";
import type { DbConnection } from "../module_bindings";
import { spacetimeDatabase, spacetimeUri } from "@the-mammoth/spacetime-client";
import { runChunkedInitialSpacetimeSubscriptions } from "./chunkedInitialSpacetimeSubscriptions.js";
import { readOptionalString } from "./username.js";
import { writeGuestConnectionToken } from "./guestConnectionToken.js";
import { prepareFreshGuestSaveSlot } from "./guestSaveRegistry.js";

export type CombatSimSpacetimePhase = "connecting" | "needs_name" | "ready" | "error";

export type CombatSimSpacetimeSession = {
  phase: CombatSimSpacetimePhase;
  conn: DbConnection | null;
  displayName: string | null;
  errorMsg: string | null;
  submitUsername: (name: string) => Promise<void>;
  reconnect: () => void;
};

const DEFAULT_COMBAT_SIM_USERNAME = "CombatSim";

/**
 * Minimal guest SpacetimeDB session for editor combat sim (and dev harnesses).
 * Skips OIDC / save-slot UI — auto guest token + single username gate.
 */
export function useCombatSimSpacetimeConnection(): CombatSimSpacetimeSession {
  const [phase, setPhase] = useState<CombatSimSpacetimePhase>("connecting");
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connEpoch, setConnEpoch] = useState(0);
  const userReadyRef = useRef(false);

  const refreshRegistration = useCallback((cc: DbConnection, baselineDone: boolean) => {
    if (!baselineDone || !userReadyRef.current) return;
    const row = cc.identity
      ? [...cc.db.user.iter()].find((u) => u.identity.isEqual(cc.identity!))
      : undefined;
    const name = readOptionalString(row?.username);
    if (name) {
      setDisplayName(name);
      setPhase("ready");
    } else {
      setDisplayName(null);
      setPhase("needs_name");
    }
  }, []);

  useEffect(() => {
    let active = true;
    let connection: DbConnection | null = null;
    userReadyRef.current = false;
    setPhase("connecting");
    setConn(null);
    setErrorMsg(null);

    prepareFreshGuestSaveSlot();

    connection = DbConnectionClass.builder()
      .withUri(spacetimeUri())
      .withDatabaseName(spacetimeDatabase())
      .withToken(undefined)
      .onConnect((cc, _identity, wsToken) => {
        if (!active) return;
        if (typeof wsToken === "string" && wsToken.length > 0) {
          writeGuestConnectionToken(wsToken);
        }
        setConn(cc);
        setErrorMsg(null);
        let baselineHydrationComplete = false;
        const bump = () => {
          if (!active) return;
          refreshRegistration(cc, baselineHydrationComplete);
        };

        cc.db.user.onInsert((_ctx, row) => {
          if (cc.identity?.isEqual(row.identity)) {
            userReadyRef.current = true;
            bump();
          }
        });
        cc.db.user.onUpdate((_ctx, _old, row) => {
          if (cc.identity?.isEqual(row.identity)) bump();
        });

        void runChunkedInitialSpacetimeSubscriptions(cc, {
          isActive: () => active,
          onBatchApplied: (batchIndex, lastBatchIndex) => {
            if (!active) return;
            if (batchIndex === 0) userReadyRef.current = true;
            baselineHydrationComplete = batchIndex === lastBatchIndex;
            bump();
          },
          onAllBatchesCommitted: () => {
            if (!active) return;
            bump();
          },
        }).catch((err: unknown) => {
          if (!active) return;
          setPhase("error");
          setErrorMsg(err instanceof Error ? err.message : String(err));
        });
      })
      .onConnectError((_ctx, err) => {
        if (!active) return;
        setPhase("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setConn(null);
      })
      .build();

    return () => {
      active = false;
      connection?.disconnect();
      setConn(null);
    };
  }, [connEpoch, refreshRegistration]);

  const submitUsername = useCallback(
    async (name: string) => {
      if (!conn) return;
      const trimmed = name.trim();
      if (trimmed.length < 3) {
        setErrorMsg("Username must be at least 3 characters.");
        return;
      }
      setErrorMsg(null);
      await conn.reducers.setUsername({ name: trimmed });
      setDisplayName(trimmed);
      setPhase("ready");
    },
    [conn],
  );

  const reconnect = useCallback(() => {
    setConnEpoch((e) => e + 1);
  }, []);

  return {
    phase,
    conn,
    displayName,
    errorMsg,
    submitUsername,
    reconnect,
  };
}

export { DEFAULT_COMBAT_SIM_USERNAME };

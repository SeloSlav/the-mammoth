import { useCallback, useEffect, useRef, useState } from "react";
import { DbConnection as DbConnectionClass } from "../module_bindings";
import type { DbConnection } from "../module_bindings";
import { spacetimeDatabase, spacetimeUri } from "@the-mammoth/spacetime-client";
import { runChunkedInitialSpacetimeSubscriptions } from "./chunkedInitialSpacetimeSubscriptions.js";
import { readOptionalString } from "./username.js";
import { readGuestConnectionToken, writeGuestConnectionToken } from "./guestConnectionToken.js";
import { prepareFreshGuestSaveSlot } from "./guestSaveRegistry.js";
import { formatSpacetimeConnectError } from "./useSpacetimeConnection.js";

export type CombatSimSpacetimePhase = "idle" | "connecting" | "needs_name" | "ready" | "error";

export type CombatSimSpacetimeSession = {
  phase: CombatSimSpacetimePhase;
  conn: DbConnection | null;
  displayName: string | null;
  errorMsg: string | null;
  submitUsername: (name: string) => Promise<void>;
  reconnect: () => void;
};

const DEFAULT_COMBAT_SIM_USERNAME = "CombatSim";

export type UseCombatSimSpacetimeConnectionOptions = {
  /** When false, no socket is opened (editor layout mode). Default true. */
  enabled?: boolean;
};

/**
 * Minimal guest SpacetimeDB session for editor combat sim (and dev harnesses).
 * Skips OIDC / save-slot UI — reuses guest WS token when present.
 */
export function useCombatSimSpacetimeConnection(
  options: UseCombatSimSpacetimeConnectionOptions = {},
): CombatSimSpacetimeSession {
  const enabled = options.enabled !== false;
  const [phase, setPhase] = useState<CombatSimSpacetimePhase>(enabled ? "connecting" : "idle");
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connEpoch, setConnEpoch] = useState(0);
  const userReadyRef = useRef(false);
  const connectionRef = useRef<DbConnection | null>(null);

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
    if (!enabled) {
      userReadyRef.current = false;
      connectionRef.current?.disconnect();
      connectionRef.current = null;
      setConn(null);
      setDisplayName(null);
      setErrorMsg(null);
      setPhase("idle");
      return;
    }

    let active = true;
    userReadyRef.current = false;
    setPhase("connecting");
    setConn(null);
    setErrorMsg(null);

    const existingToken = readGuestConnectionToken();
    if (!existingToken) {
      prepareFreshGuestSaveSlot();
    }

    const tokenForBuilder = readGuestConnectionToken() ?? undefined;

    const connection = DbConnectionClass.builder()
      .withUri(spacetimeUri())
      .withDatabaseName(spacetimeDatabase())
      .withToken(tokenForBuilder)
      .onConnect((cc, _identity, wsToken) => {
        if (!active) return;
        if (typeof wsToken === "string" && wsToken.length > 0) {
          writeGuestConnectionToken(wsToken);
        }
        connectionRef.current = cc;
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
        setErrorMsg(formatSpacetimeConnectError(err));
        setConn(null);
        connectionRef.current = null;
      })
      .build();

    connectionRef.current = connection;

    return () => {
      active = false;
      connection.disconnect();
      if (connectionRef.current === connection) {
        connectionRef.current = null;
      }
      setConn(null);
    };
  }, [connEpoch, refreshRegistration, enabled]);

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

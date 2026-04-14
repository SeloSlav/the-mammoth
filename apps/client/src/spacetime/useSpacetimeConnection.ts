import { useCallback, useEffect, useState } from "react";
import { clearOidcAccessToken, readOidcAccessToken } from "../auth/env";
import {
  completeOidcCallbackFromCurrentUrl,
  startPasswordOidcRedirect,
  stripAuthCallbackFromUrl,
} from "../auth/pkceOidc";
import type { DbConnection } from "../module_bindings";
import { DbConnection as DbConnectionClass } from "../module_bindings";
import { readOptionalString } from "./username";
import { spacetimeDatabase, spacetimeUri } from "./env";

function isOidcCallbackPath(): boolean {
  const p = window.location.pathname;
  return p === "/auth/callback" || p.endsWith("/auth/callback");
}

/** SpacetimeDB passes the browser `WebSocket` `error` event here, not an `Error` — avoid `[object Event]`. */
function formatSpacetimeConnectError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof ErrorEvent !== "undefined" && err instanceof ErrorEvent && err.message) {
    return err.message;
  }
  if (typeof Event !== "undefined" && err instanceof Event) {
    return [
      "WebSocket error (the browser rarely exposes details).",
      "",
      "Most often: nothing is listening on the host/port above.",
      "1) Run `spacetime start` in a terminal and leave it running.",
      "2) Publish: `spacetime publish mammoth-local --project-path apps/server`",
      "3) Configure the node to accept JWTs from your auth issuer (see apps/client/.env.example).",
    ].join("\n");
  }
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return String(err);
}

export type SpacetimePhase =
  | "needs_auth"
  | "connecting"
  | "needs_name"
  | "ready"
  | "error";

export type SpacetimeSession = {
  phase: SpacetimePhase;
  conn: DbConnection | null;
  displayName: string | null;
  errorMsg: string | null;
  /** OpenAuth password flow (redirects away to `apps/auth`). */
  startPasswordSignIn: () => Promise<void>;
  /** Clear OIDC session and disconnect from SpacetimeDB. */
  signOut: () => void;
  submitUsername: (raw: string) => Promise<void>;
};

/**
 * SpacetimeDB over OIDC: obtain a JWT from `apps/auth` (PKCE), then `withToken(jwt)` so the
 * node maps a stable identity from `sub` — no anonymous browser profiles.
 */
export function useSpacetimeConnection(): SpacetimeSession {
  const [phase, setPhase] = useState<SpacetimePhase>(() => {
    if (typeof window !== "undefined" && isOidcCallbackPath()) {
      return "connecting";
    }
    return readOidcAccessToken() ? "connecting" : "needs_auth";
  });
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connEpoch, setConnEpoch] = useState(0);

  const refreshRegistration = useCallback((c: DbConnection) => {
    const id = c.identity;
    if (!id) return;
    const row = c.db.user.identity.find(id);
    if (!row) {
      return;
    }
    const uname = readOptionalString(row.username);
    if (uname) {
      setDisplayName(uname);
      setPhase("ready");
      setErrorMsg(null);
    } else {
      setPhase("needs_name");
    }
  }, []);

  useEffect(() => {
    let active = true;
    let connection: DbConnection | null = null;

    void (async () => {
      if (isOidcCallbackPath()) {
        setPhase("connecting");
        setErrorMsg(null);
        try {
          await completeOidcCallbackFromCurrentUrl();
          stripAuthCallbackFromUrl();
        } catch (e) {
          if (!active) return;
          setErrorMsg(e instanceof Error ? e.message : String(e));
          setPhase("needs_auth");
          stripAuthCallbackFromUrl();
          return;
        }
      }

      if (!active) return;

      const jwt = readOidcAccessToken();
      if (!jwt) {
        setConn(null);
        setPhase("needs_auth");
        return;
      }

      if (!active) return;

      connection = DbConnectionClass.builder()
        .withUri(spacetimeUri())
        .withDatabaseName(spacetimeDatabase())
        .withToken(jwt)
        .onConnect((cc) => {
          if (!active) return;
          setConn(cc);
          setErrorMsg(null);
          const bump = () => {
            if (!active) return;
            refreshRegistration(cc);
          };
          cc.subscriptionBuilder()
            .onApplied(() => {
              bump();
              queueMicrotask(() => {
                if (!active) return;
                bump();
              });
            })
            .subscribe([
              "SELECT * FROM user",
              "SELECT * FROM inventory_item",
              "SELECT * FROM player_vitals",
              "SELECT * FROM elevator_car",
              "SELECT * FROM elevator_landing_door",
            ]);
          cc.db.user.onInsert((_ctx, row) => {
            if (cc.identity?.isEqual(row.identity)) bump();
          });
          cc.db.user.onUpdate((_ctx, _old, row) => {
            if (cc.identity?.isEqual(row.identity)) bump();
          });
        })
        .onConnectError((_ctx, err) => {
          if (!active) return;
          setPhase("error");
          setErrorMsg(formatSpacetimeConnectError(err));
          setConn(null);
        })
        .build();
    })();

    return () => {
      active = false;
      connection?.disconnect();
      setConn(null);
    };
  }, [connEpoch, refreshRegistration]);

  const startPasswordSignIn = useCallback(async () => {
    setErrorMsg(null);
    await startPasswordOidcRedirect();
  }, []);

  const signOut = useCallback(() => {
    clearOidcAccessToken();
    setConn(null);
    setDisplayName(null);
    setErrorMsg(null);
    setPhase("needs_auth");
    setConnEpoch((e) => e + 1);
  }, []);

  const submitUsername = useCallback(
    async (raw: string) => {
      if (!conn) return;
      const trimmed = raw.trim();
      if (trimmed.length < 3) {
        setErrorMsg("Username must be at least 3 characters.");
        return;
      }
      setErrorMsg(null);
      await conn.reducers.setUsername({ name: trimmed });
    },
    [conn],
  );

  return {
    phase,
    conn,
    displayName,
    errorMsg,
    startPasswordSignIn,
    signOut,
    submitUsername,
  };
}

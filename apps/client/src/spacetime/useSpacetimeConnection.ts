import { useCallback, useEffect, useState } from "react";
import type { DbConnection } from "../module_bindings";
import { DbConnection as DbConnectionClass } from "../module_bindings";
import { readOptionalString } from "./username";
import { spacetimeDatabase, spacetimeUri } from "./env";

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
      "3) Confirm the node prints HTTP on port 3000 (or set VITE_SPACETIME_URI to match).",
    ].join("\n");
  }
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return String(err);
}

export type SpacetimePhase = "connecting" | "needs_name" | "ready" | "error";

export type SpacetimeSession = {
  phase: SpacetimePhase;
  conn: DbConnection | null;
  displayName: string | null;
  errorMsg: string | null;
  submitUsername: (raw: string) => Promise<void>;
};

/**
 * One long-lived SpaceTimeDB connection (login + in-world). Matches the selo-empire pattern:
 * subscriptions feed client caches; game loop reads replicated tables.
 */
export function useSpacetimeConnection(): SpacetimeSession {
  const [phase, setPhase] = useState<SpacetimePhase>("connecting");
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refreshRegistration = useCallback((c: DbConnection) => {
    const id = c.identity;
    if (!id) return;
    const row = c.db.user.identity.find(id);
    if (!row) {
      // Subscription snapshot may not have landed in the table cache yet; do not
      // assume "needs name" (that flashes the form for returning players on refresh).
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
    /** In dev, React Strict Mode mounts → unmounts → remounts once; ignore callbacks from the aborted attempt. */
    let active = true;
    const c = DbConnectionClass.builder()
      .withUri(spacetimeUri())
      .withDatabaseName(spacetimeDatabase())
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
          .subscribe(["SELECT * FROM user", "SELECT * FROM player_pose"]);
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

    return () => {
      active = false;
      c.disconnect();
      setConn(null);
    };
  }, [refreshRegistration]);

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
    submitUsername,
  };
}

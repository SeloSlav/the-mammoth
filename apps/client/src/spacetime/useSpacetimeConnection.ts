import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fpLoadingDbgMark,
} from "../game/fpSession/fpLoadingDebug.js";
import {
  abandonMegablockStaticWorldMeshCache,
  primeMegablockStaticWorldMeshBuild,
} from "../game/fpSession/fpSessionStaticWorldMeshCache.js";
import { clearOidcAccessToken, readOidcAccessToken } from "../auth/env";
import {
  completeOidcCallbackFromCurrentUrl,
  startPasswordOidcRedirect,
  stripAuthCallbackFromUrl,
} from "../auth/pkceOidc";
import type { DbConnection } from "../module_bindings";
import { DbConnection as DbConnectionClass } from "../module_bindings";
import { readOptionalString } from "./username";
import { spacetimeDatabase, spacetimeUri, readEnableAccountAuth } from "./env";
import { writeGuestLastKnownDisplayName } from "./guestLastKnownDisplayName";
import { readGuestConnectionToken, writeGuestConnectionToken } from "./guestConnectionToken";
import {
  deleteGuestSaveSlot as persistDeleteGuestSaveSlot,
  guestSaveSummariesSorted,
  prepareFreshGuestSaveSlot,
  readGuestSaveRegistry,
  selectGuestSaveSlot as persistSelectGuestSaveSlot,
  type GuestSaveSlotSummary,
} from "./guestSaveRegistry";
import { runChunkedInitialSpacetimeSubscriptions } from "./chunkedInitialSpacetimeSubscriptions.js";

function isOidcCallbackPath(): boolean {
  const p = window.location.pathname;
  return p === "/auth/callback" || p.endsWith("/auth/callback");
}

function readInitialConnectionKind(): ConnectionKind | null {
  if (typeof window === "undefined") return null;
  if (readOidcAccessToken()) return "oidc";
  /** Completing OpenAuth — ignore any stale guest WS token in storage. */
  if (isOidcCallbackPath()) return "oidc";
  if (readGuestConnectionToken()) return "guest";
  if (!readEnableAccountAuth()) return "guest";
  return null;
}

function readInitialPhase(): SpacetimePhase {
  if (typeof window === "undefined") return readEnableAccountAuth() ? "needs_auth" : "needs_name";
  if (isOidcCallbackPath()) return "connecting";
  if (readOidcAccessToken()) return "connecting";
  if (readGuestConnectionToken()) {
    /**
     * Server truth arrives over the wire — never hoist `phase` to `connecting` from localStorage alone
     * (stale hints). Returning named guests get a reconnect shell in LoginGate until `user` confirms
     * `username`.
     */
    return "needs_name";
  }
  return readEnableAccountAuth() ? "needs_auth" : "needs_name";
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
      "3) For Sign in: configure the node for your auth issuer JWKS (see apps/client/.env.example).",
      "4) For guest play: the local node must allow anonymous WebSocket connections (default in local dev).",
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
  | "guest_save_menu"
  | "connecting"
  | "needs_name"
  | "ready"
  | "error";

export type ConnectionKind = "oidc" | "guest";

export type ProfileSubmitArgs = { name: string; avatarBody: 0 | 1 };

export type SpacetimeSession = {
  phase: SpacetimePhase;
  conn: DbConnection | null;
  displayName: string | null;
  errorMsg: string | null;
  /** How we connected — guest uses anonymous WS token persisted in localStorage. */
  connectionKind: ConnectionKind | null;
  guestSaveSummaries: GuestSaveSlotSummary[];
  activeGuestSlotId: string | null;
  /**
   * First baseline batch (at least `user`) applied on the client — safe to call reducers that assume
   * the local cache has the identity row. UI can show the name form early but keep submit disabled
   * until this flips true.
   */
  spacetimeUserSnapshotReady: boolean;
  /** OpenAuth password flow (redirects away to `apps/auth`). */
  startPasswordSignIn: () => Promise<void>;
  /** Connect without OIDC — requires local node to accept anonymous connections. */
  startGuestPlay: () => void;
  /** Quit current session — guests return to local save picker (slots kept). */
  signOut: () => void;
  /** Auth-enabled builds: guest save screen → account vs guest lobby. */
  signOutToAuthGate: () => void;
  selectGuestSaveSlot: (slotId: string) => void;
  startNewGuestSave: () => void;
  deleteGuestSaveSlot: (slotId: string) => void;
  submitProfile: (args: ProfileSubmitArgs) => Promise<void>;
};

/**
 * SpacetimeDB: either OIDC JWT from OpenAuth or anonymous `withToken(undefined)` guest flow.
 * Guest identity is stable while the WebSocket token from `onConnect` is kept in localStorage.
 */
export function useSpacetimeConnection(): SpacetimeSession {
  const [phase, setPhase] = useState<SpacetimePhase>(readInitialPhase);
  const phaseRef = useRef(phase);
  const [conn, setConn] = useState<DbConnection | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [connEpoch, setConnEpoch] = useState(0);
  const [guestRegistryTick, setGuestRegistryTick] = useState(0);
  /**
   * Guests resume the same Spacetime identity after refresh when
   * {@link readGuestConnectionToken} has a value — keep in sync with initial connect effect.
   */
  const [connectionKind, setConnectionKind] = useState<ConnectionKind | null>(readInitialConnectionKind);
  const [spacetimeUserSnapshotReady, setSpacetimeUserSnapshotReady] = useState(false);

  const bumpGuestRegistryUi = useCallback(() => setGuestRegistryTick((t) => t + 1), []);

  const { guestSaveSummaries, activeGuestSlotId } = useMemo(() => {
    void guestRegistryTick;
    const reg = readGuestSaveRegistry();
    return {
      guestSaveSummaries: guestSaveSummariesSorted(reg),
      activeGuestSlotId: reg.activeSlotId,
    };
  }, [guestRegistryTick]);

  const refreshRegistration = useCallback(
    (c: DbConnection, baselineFullyHydrated: boolean, connectionKindSnap: ConnectionKind) => {
      const id = c.identity;
      if (!id) return;
      const row = c.db.user.identity.find(id);
      if (!row) {
        return;
      }
      const uname = readOptionalString(row.username);
      if (!uname) {
        if (connectionKindSnap === "guest") writeGuestLastKnownDisplayName(null);
        setDisplayName(null);
        /** Keep the name form visible while later table batches stream — not the empty "connecting" gate. */
        setPhase("needs_name");
        setErrorMsg(null);
        return;
      }
      if (connectionKindSnap === "guest") writeGuestLastKnownDisplayName(uname);
      if (!baselineFullyHydrated) {
        /** Identity row exists early; defer `ready`/canvas until inventory/pose rows are applied. */
        setDisplayName(uname);
        setPhase("connecting");
        setErrorMsg(null);
        return;
      }
      setDisplayName(uname);
      setPhase("ready");
      setErrorMsg(null);
    },
    [],
  );

  useEffect(() => {
    fpLoadingDbgMark("spacetime_gate", {
      phase,
      hasUsername: !!displayName,
      connectionKind,
    });
  }, [phase, displayName, connectionKind]);

  /**
   * Overlap megablock CPU with later baseline batches + React paint: `mountFpSession` usually waits
   * on this promise shortly after `ready`, so priming once we know identity + name cuts wall-clock lag.
   * Covers `connecting` (baseline still draining) **and** `ready` — some hydration paths skip `connecting`
   * in one commit, canceling an in-flight deferred prime if we keyed only `connecting`.
   * Idempotent; sign-out clears the shared cache promise.
   */
  useEffect(() => {
    if (
      !displayName ||
      (phase !== "connecting" && phase !== "ready")
    ) {
      return;
    }
    const t = window.setTimeout(() => {
      primeMegablockStaticWorldMeshBuild();
    }, 0);
    return () => window.clearTimeout(t);
  }, [phase, displayName]);

  /** Keeps {@link phaseRef} aligned without assigning refs during render (eslint react-hooks/refs). */
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /**
   * Spacetime WebSocket — keyed by identity/session epoch only.
   * Do **not** list `phase` here: `refreshRegistration` advances needs_name→connecting→ready while this socket
   * stays open; re-running the effect on every phase flip disconnects mid-flight (CLOSING/CLOSED `send`
   * errors + login/connect UI flicker). `guest_save_menu` uses {@link phaseRef} without reconnect churn.
   */
  useEffect(() => {
    let active = true;
    let connection: DbConnection | null = null;

    void (async () => {
      fpLoadingDbgMark("spacetime_connect_effect:entered");

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

      /** Ref read — `phase` is intentionally omitted from effect deps (hydration flips would churn WS). */
      if (phaseRef.current === "guest_save_menu") {
        fpLoadingDbgMark("spacetime_connect_effect:guest_save_menu_hold");
        setConn(null);
        return;
      }

      const jwt = readOidcAccessToken();
      if (jwt) {
        setConnectionKind("oidc");
      }

      const kind: ConnectionKind | null = jwt ? "oidc" : connectionKind;
      if (!kind) {
        setConn(null);
        setPhase("needs_auth");
        fpLoadingDbgMark("spacetime_connect_effect:no_connection_kind_waiting_auth_gate");
        return;
      }

      const guestPersisted = readGuestConnectionToken();
      const tokenForBuilder: string | undefined =
        kind === "oidc" ? jwt! : guestPersisted ?? undefined;

      if (!active) return;

      fpLoadingDbgMark("spacetime_ws:building_db_connection", { kind });

      connection = DbConnectionClass.builder()
        .withUri(spacetimeUri())
        .withDatabaseName(spacetimeDatabase())
        .withToken(tokenForBuilder)
        .onConnect((cc, _identity, wsToken) => {
          if (!active) return;
          fpLoadingDbgMark("spacetime_ws:on_connect", {
            hasWsTokenFromServer: typeof wsToken === "string" && wsToken.length > 0,
          });
          if (kind === "guest" && typeof wsToken === "string" && wsToken.length > 0) {
            writeGuestConnectionToken(wsToken);
            bumpGuestRegistryUi();
          }
          setConn(cc);
          setErrorMsg(null);
          setSpacetimeUserSnapshotReady(false);
          let baselineHydrationComplete = false;
          const bump = () => {
            if (!active) return;
            refreshRegistration(cc, baselineHydrationComplete, kind);
          };

          cc.db.user.onInsert((_ctx, row) => {
            if (cc.identity?.isEqual(row.identity)) {
              setSpacetimeUserSnapshotReady(true);
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
              if (batchIndex === 0) {
                setSpacetimeUserSnapshotReady(true);
              }
              baselineHydrationComplete = batchIndex === lastBatchIndex;
              bump();
            },
            onAllBatchesCommitted: () => {
              if (!active) return;
              fpLoadingDbgMark("spacetime_subscription:baseline_tables_applied");
              bump();
              queueMicrotask(() => {
                if (!active) return;
                bump();
              });
            },
          }).catch((err: unknown) => {
            if (!active) return;
            console.error("[spacetime] chunked baseline subscription failed", err);
            setPhase("error");
            setErrorMsg(err instanceof Error ? err.message : String(err));
          });
        })
        .onConnectError((_ctx, err) => {
          if (!active) return;
          fpLoadingDbgMark("spacetime_ws:on_connect_error", {
            summary: formatSpacetimeConnectError(err).slice(0, 220),
          });
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
      setSpacetimeUserSnapshotReady(false);
    };
  }, [connEpoch, connectionKind, refreshRegistration, bumpGuestRegistryUi]);

  const startPasswordSignIn = useCallback(async () => {
    setErrorMsg(null);
    await startPasswordOidcRedirect();
  }, []);

  const startGuestPlay = useCallback(() => {
    setErrorMsg(null);
    setDisplayName(null);
    setConnectionKind("guest");
    setSpacetimeUserSnapshotReady(false);
    /** Name form + backdrop render immediately; submit stays disabled until WebSocket + user batch. */
    setPhase("needs_name");
    setConnEpoch((e) => e + 1);
  }, []);

  const signOutToAuthGate = useCallback(() => {
    abandonMegablockStaticWorldMeshCache();
    clearOidcAccessToken();
    setConn(null);
    setDisplayName(null);
    setErrorMsg(null);
    setSpacetimeUserSnapshotReady(false);
    setConnectionKind(null);
    setPhase("needs_auth");
    setConnEpoch((e) => e + 1);
  }, []);

  const selectGuestSaveSlot = useCallback(
    (slotId: string) => {
      persistSelectGuestSaveSlot(slotId);
      bumpGuestRegistryUi();
      setDisplayName(null);
      setErrorMsg(null);
      setPhase("needs_name");
      setConnEpoch((e) => e + 1);
    },
    [bumpGuestRegistryUi],
  );

  const startNewGuestSave = useCallback(() => {
    prepareFreshGuestSaveSlot();
    bumpGuestRegistryUi();
    setDisplayName(null);
    setErrorMsg(null);
    setConnectionKind("guest");
    setPhase("needs_name");
    setConnEpoch((e) => e + 1);
  }, [bumpGuestRegistryUi]);

  const deleteGuestSaveSlot = useCallback(
    (slotId: string) => {
      persistDeleteGuestSaveSlot(slotId);
      bumpGuestRegistryUi();
    },
    [bumpGuestRegistryUi],
  );

  const signOut = useCallback(() => {
    abandonMegablockStaticWorldMeshCache();
    const hadOidcJwt = !!readOidcAccessToken();
    clearOidcAccessToken();
    setConn(null);
    setDisplayName(null);
    setErrorMsg(null);
    setSpacetimeUserSnapshotReady(false);
    if (hadOidcJwt) {
      setConnectionKind(null);
      setPhase("needs_auth");
    } else {
      setConnectionKind("guest");
      setPhase("guest_save_menu");
    }
    setConnEpoch((e) => e + 1);
  }, []);

  const submitProfile = useCallback(
    async (args: ProfileSubmitArgs) => {
      if (!conn || !spacetimeUserSnapshotReady) return;
      const trimmed = args.name.trim();
      if (trimmed.length < 3) {
        setErrorMsg("Username must be at least 3 characters.");
        return;
      }
      if (trimmed.length > 24) {
        setErrorMsg("Username must be at most 24 characters.");
        return;
      }
      if (!/^[\p{L}\p{N}_-]+$/u.test(trimmed)) {
        setErrorMsg("Username may only contain letters, numbers, underscores, and hyphens.");
        return;
      }
      if (args.avatarBody !== 0 && args.avatarBody !== 1) {
        setErrorMsg("Choose a valid body type.");
        return;
      }
      setErrorMsg(null);
      await conn.reducers.setUsername({ name: trimmed });
      await conn.reducers.setAvatarBody({ body: args.avatarBody });
    },
    [conn, spacetimeUserSnapshotReady],
  );

  return {
    phase,
    conn,
    displayName,
    errorMsg,
    connectionKind,
    guestSaveSummaries,
    activeGuestSlotId,
    spacetimeUserSnapshotReady,
    startPasswordSignIn,
    startGuestPlay,
    signOut,
    signOutToAuthGate,
    selectGuestSaveSlot,
    startNewGuestSave,
    deleteGuestSaveSlot,
    submitProfile,
  };
}

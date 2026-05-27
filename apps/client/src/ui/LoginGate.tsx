import { useState, type ReactNode } from "react";
import { MAMMOTH_LOGO_PUBLIC_PATH } from "@the-mammoth/ui-theme";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import { readGuestLastKnownDisplayName } from "../spacetime/guestLastKnownDisplayName";
import { readEnableAccountAuth } from "../spacetime/env";
import { MammothAuthBackdrop } from "./MammothAuthBackdrop";
import { GuestSaveMenu } from "./GuestSaveMenu";
import { ProfileGate } from "./ProfileGate";
import styles from "./LoginGate.module.css";
import { useMammothAuthMenuMusic } from "./useMammothAuthMenuMusic";

type Props = {
  session: SpacetimeSession;
};

/**
 * Lobby routing: optional OIDC (`VITE_ENABLE_ACCOUNT_AUTH`), then profile gate before gameplay.
 */
export function LoginGate({ session }: Props) {
  const {
    phase,
    connectionKind,
    errorMsg,
    startPasswordSignIn,
    startGuestPlay,
    signOut,
  } = session;
  const [busy, setBusy] = useState(false);

  /** ≥3 aligns with reducer validation; hint is UX-only until subscriptions confirm username. */
  const guestReconnectHint =
    connectionKind === "guest" ? readGuestLastKnownDisplayName() : null;
  const showGuestReconnectResume =
    phase === "needs_name" &&
    connectionKind === "guest" &&
    guestReconnectHint !== null &&
    guestReconnectHint.length >= 3;

  const accountAuth = readEnableAccountAuth();

  if (phase === "guest_save_menu") {
    return (
      <AuthScreen eyebrow="Saves">
        <GuestSaveMenu session={session} />
      </AuthScreen>
    );
  }

  if (phase === "needs_auth") {
    return (
      <AuthScreen eyebrow="Welcome">
        <p className={styles.subtitle}>
          <strong>The Mammoth</strong> — solo Balkan apartment sim: corridors, heat, your corner of the tower.
        </p>
        {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
        {accountAuth ? (
          <>
            <p className={styles.hint}>
              Sign in for the same progress on any browser. Guest saves stay on this device only.
            </p>
            <div className={styles.divider} />
            <div>
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await startPasswordSignIn();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Opening…" : "Sign in or create account"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  try {
                    startGuestPlay();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Continue as guest
              </button>
            </div>
            <p className={styles.microcopy}>Guests: data stays on this device until you sign out.</p>
          </>
        ) : (
          <p className={styles.hint}>Account sign-in is off — you&apos;ll continue as a guest.</p>
        )}
      </AuthScreen>
    );
  }

  if (showGuestReconnectResume) {
    return (
      <AuthScreen eyebrow="Resume">
        {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
        <p className={styles.statusCopy}>Reconnecting guest save…</p>
        <p className={styles.hint}>Hang tight while the connection catches up.</p>
        <button type="button" className={styles.secondaryButton} onClick={() => signOut()}>
          Pick another save
        </button>
      </AuthScreen>
    );
  }

  if (phase === "connecting" && !errorMsg) {
    return (
      <AuthScreen eyebrow="Connecting">
        <p className={styles.statusCopy}>Connecting…</p>
        {/* <p className={styles.hint}>This usually takes a few seconds.</p> */}
      </AuthScreen>
    );
  }

  if (phase === "error") {
    return (
      <AuthScreen eyebrow="Connection failed">
        <p className={styles.statusCopy}>Couldn&apos;t connect. Try again in a moment.</p>
        <p className={styles.hint}>{connectionErrorPlayerMessage(errorMsg)}</p>
        <button type="button" className={styles.button} onClick={() => signOut()}>
          Back
        </button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen eyebrow="Profile">
      <ProfileGate session={session} />
    </AuthScreen>
  );
}

function AuthScreen({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  useMammothAuthMenuMusic();
  return (
    <div className={styles.screen}>
      <MammothAuthBackdrop />
      <div className={styles.backdropScrim} aria-hidden="true" />
      <div className={styles.layout}>
        <main className={styles.panel} aria-labelledby="mammoth-auth-title">
          <p className={styles.kicker}>{eyebrow}</p>
          <div className={styles.brandLockup}>
            <img
              id="mammoth-auth-title"
              className={styles.logoFull}
              src={MAMMOTH_LOGO_PUBLIC_PATH}
              width={440}
              alt="The Mammoth"
              decoding="async"
              fetchPriority="high"
            />
          </div>
          {children}
        {/* <p className={styles.preloadNotice}>
          The building and game assets keep preloading in the background. If you want the smoothest
          entry, wait a moment for that preload to finish before continuing.
        </p> */}
        </main>
      </div>
    </div>
  );
}

/** Player-facing only — never echo server responses or infrastructure details. */
function connectionErrorPlayerMessage(raw: string | null): string {
  if (!raw?.trim()) {
    return "No details from the server.";
  }
  const lower = raw.toLowerCase();
  if (lower.includes("verify token") || lower.includes("unauthorized")) {
    return "Session invalid — sign out and sign in again.";
  }
  if (lower.includes("websocket")) {
    return "Network issue — check your connection and retry.";
  }
  return "Something went wrong during connect.";
}

export default LoginGate;

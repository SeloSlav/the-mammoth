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
      <AuthScreen eyebrow="Your saves">
        <GuestSaveMenu session={session} />
      </AuthScreen>
    );
  }

  if (phase === "needs_auth") {
    return (
      <AuthScreen eyebrow="Welcome to the block">
        <p className={styles.subtitle}>
          <strong>The Mammoth</strong> is a solo Balkan apartment complex simulator—long corridors,
          thin heat, and your own corner of the tower to settle into.
        </p>
        {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
        {accountAuth ? (
          <>
            <p className={styles.hint}>
              Sign in to keep your flat and stash tied to an account, or continue as a guest with a key
              stored in this browser.
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
                {busy ? "Opening the stairwell door..." : "Sign in or create an account"}
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
            <p className={styles.microcopy}>
              Accounts persist across browsers once signed in. Guests stay on this device until you sign
              out.
            </p>
          </>
        ) : (
          <p className={styles.hint}>
            Anonymous access is automatic when account auth is disabled — you should land on the profile
            screen shortly.
          </p>
        )}
      </AuthScreen>
    );
  }

  if (showGuestReconnectResume) {
    return (
      <AuthScreen eyebrow="You're on file">
        {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
        <p className={styles.statusCopy}>Reconnecting your saved guest slot…</p>
        <p className={styles.hint}>
          We&apos;ll bump you ahead as soon as the tower sync—not picking a fresh profile unless the desk
          says so.
        </p>
        <button type="button" className={styles.secondaryButton} onClick={() => signOut()}>
          Pick another save
        </button>
      </AuthScreen>
    );
  }

  if (phase === "connecting" && !errorMsg) {
    return (
      <AuthScreen eyebrow="Almost there">
        <p className={styles.statusCopy}>Connecting you to the building...</p>
        <p className={styles.hint}>The intercom crackles; give it a moment.</p>
      </AuthScreen>
    );
  }

  if (phase === "error") {
    return (
      <AuthScreen eyebrow="Couldn&apos;t get you in">
        <p className={styles.statusCopy}>
          We couldn&apos;t patch you through to the tower. Something at the front desk turned your key
          away.
        </p>
        <p className={styles.hint}>{connectionErrorPlayerMessage(errorMsg)}</p>
        <p className={styles.hint}>If it keeps happening, wait a minute and try again.</p>
        <button type="button" className={styles.button} onClick={() => signOut()}>
          Back to the lobby
        </button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen eyebrow="Your roster name">
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
        </main>
      </div>
    </div>
  );
}

/** Player-facing only — never echo server responses or infrastructure details. */
function connectionErrorPlayerMessage(raw: string | null): string {
  if (!raw?.trim()) {
    return "The line died before the porter said a word.";
  }
  const lower = raw.toLowerCase();
  if (lower.includes("verify token") || lower.includes("unauthorized")) {
    return "Your key did not match what security has on file. Going back and signing in again usually sorts it.";
  }
  if (lower.includes("websocket")) {
    return "We could not raise the building on the wire—check your connection, then try again.";
  }
  return "Check-in cut out before the lock could turn.";
}

export default LoginGate;

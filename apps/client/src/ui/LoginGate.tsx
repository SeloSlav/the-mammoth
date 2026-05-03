import { useState, type FormEvent, type ReactNode } from "react";
import { MAMMOTH_LOGO_PUBLIC_PATH } from "@the-mammoth/ui-theme";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import { readGuestLastKnownDisplayName } from "../spacetime/guestLastKnownDisplayName";
import { MammothAuthBackdrop } from "./MammothAuthBackdrop";
import styles from "./LoginGate.module.css";
import { useMammothAuthMenuMusic } from "./useMammothAuthMenuMusic";

type Props = {
  session: SpacetimeSession;
};

/**
 * Account gate: OpenAuth (`apps/auth`) first, then in-game display name.
 */
export function LoginGate({ session }: Props) {
  const {
    phase,
    conn,
    connectionKind,
    errorMsg,
    spacetimeUserSnapshotReady,
    submitUsername,
    startPasswordSignIn,
    startGuestPlay,
    signOut,
  } = session;
  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!conn || !spacetimeUserSnapshotReady) return;
    setBusy(true);
    try {
      await submitUsername(nameInput);
    } finally {
      setBusy(false);
    }
  };

  /** ≥3 aligns with reducer validation; hint is UX-only until subscriptions confirm username. */
  const guestReconnectHint =
    connectionKind === "guest" ? readGuestLastKnownDisplayName() : null;
  const showGuestReconnectResume =
    phase === "needs_name" &&
    connectionKind === "guest" &&
    guestReconnectHint !== null &&
    guestReconnectHint.length >= 3;

  if (phase === "needs_auth") {
    return (
      <AuthScreen eyebrow="Welcome to the block">
        <p className={styles.subtitle}>
          Come on up. <strong>The Mammoth</strong> is a multiplayer survival game set in a
          late-socialist Balkan commie block—long corridors, thin heat, and neighbors who may or may
          not be on your side. Sign in to keep your flat, stash, and name between visits, or step in
          as a guest with a key that stays in this browser until you sign out.
        </p>
        {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
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
            Sneak in as a guest
          </button>
        </div>
        <p className={styles.microcopy}>
          Accounts keep your progress across visits. Guests are tied to this browser—fine for a
          look around the tower.
        </p>
      </AuthScreen>
    );
  }

  if (showGuestReconnectResume) {
    return (
      <AuthScreen eyebrow="You're on file">
        {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
        <p className={styles.statusCopy}>Reconnecting your saved guest slot…</p>
        <p className={styles.hint}>
          We&apos;ll bump you ahead as soon as the tower sync—not picking a fresh name unless the desk
          says so.
        </p>
        <button type="button" className={styles.secondaryButton} onClick={() => signOut()}>
          Use a different key
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
          We couldn&apos;t patch you through to the tower. Something at the front desk turned your
          key away.
        </p>
        <p className={styles.hint}>{connectionErrorPlayerMessage(errorMsg)}</p>
        <p className={styles.hint}>
          If it keeps happening, wait a minute and try again—or head back and sign in fresh.
        </p>
        <button type="button" className={styles.button} onClick={() => signOut()}>
          Back to the lobby
        </button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen eyebrow="Who are you in the halls?">
      <p className={styles.subtitle}>
        Pick the name other players will see on the landing and in chat. Use 3–24 characters:
        letters, numbers, underscores, and hyphens.
      </p>
      <p className={styles.hint}>You can type anytime; stepping inside waits until reception finishes syncing.</p>
      {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
      {!conn ? (
        <p className={styles.hint}>Connecting to reception—almost there.</p>
      ) : !spacetimeUserSnapshotReady ? (
        <p className={styles.hint}>Your key synced; pulling your line from dispatch…</p>
      ) : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <input
          autoFocus
          value={nameInput}
          onChange={(ev) => setNameInput(ev.target.value)}
          placeholder="Your callsign on the block"
          className={styles.input}
          disabled={busy}
          maxLength={24}
          autoComplete="username"
        />
        <button
          type="submit"
          className={styles.button}
          disabled={busy || !conn || !spacetimeUserSnapshotReady}
        >
          {busy
            ? "Saving your name..."
            : !conn
              ? "Waiting for reception…"
              : !spacetimeUserSnapshotReady
                ? "Syncing roster…"
                : "Step inside"}
        </button>
      </form>
      <button type="button" className={styles.secondaryButton} onClick={() => signOut()}>
        Different account
      </button>
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

import { useState, type FormEvent } from "react";
import { requestGameFullscreenFromUserGesture } from "../browser/requestGameFullscreen";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import styles from "./LoginGate.module.css";

type Props = {
  session: SpacetimeSession;
};

/** Display name entry — avatar defaults to male (`avatar_body` 0) until gender UI returns. */
export function ProfileGate({ session }: Props) {
  const {
    conn,
    connectionKind,
    errorMsg,
    spacetimeUserSnapshotReady,
    submitProfile,
    signOut,
  } = session;

  const [nameInput, setNameInput] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!conn || !spacetimeUserSnapshotReady) return;
    /** Same user gesture as submit — must run before any `await` or fullscreen may be blocked. */
    requestGameFullscreenFromUserGesture();
    setBusy(true);
    try {
      await submitProfile({ name: nameInput, avatarBody: 0 });
    } finally {
      setBusy(false);
    }
  };

  const signOutLabel =
    connectionKind === "oidc"
      ? "Different account"
      : connectionKind === "guest"
        ? "Save slots"
        : "Back";

  return (
    <>
      <p className={styles.subtitle}>
        The desk logs this line exactly as typed — 3–24 characters (letters, numbers, underscores,
        hyphens).
      </p>
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
          placeholder="Your name on the roster"
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
            ? "Saving profile..."
            : !conn
              ? "Waiting for reception…"
              : !spacetimeUserSnapshotReady
                ? "Syncing roster…"
                : "Enter the building"}
        </button>
      </form>
      <button type="button" className={styles.secondaryButton} onClick={() => signOut()} disabled={busy}>
        {signOutLabel}
      </button>
    </>
  );
}

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import styles from "./LoginGate.module.css";
import type { ProfilePreviewAvatarBody } from "./profileCharacterPreviewMount";

type Props = {
  session: SpacetimeSession;
};

/** Display name + avatar body with draggable WebGPU GLB preview (guest-default builds land here first). */
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
  const [avatarBody, setAvatarBody] = useState<ProfilePreviewAvatarBody>(0);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;
    let innerRaf = 0;

    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        void import("./profileCharacterPreviewMount.js")
          .then((mod) => mod.mountProfileCharacterPreview(canvas, avatarBody))
          .then((d) => {
            if (!cancelled) dispose = d;
          })
          .catch((err: unknown) => {
            console.warn("[ProfileGate] WebGPU character preview unavailable", err);
          });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      dispose?.();
    };
  }, [avatarBody]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!conn || !spacetimeUserSnapshotReady) return;
    setBusy(true);
    try {
      await submitProfile({ name: nameInput, avatarBody });
    } finally {
      setBusy(false);
    }
  };

  const signOutLabel =
    connectionKind === "oidc"
      ? "Different account"
      : connectionKind === "guest"
        ? "New anonymous visit"
        : "Back";

  return (
    <>
      <p className={styles.subtitle}>
        Solo Balkan apartment complex simulator — choose how you appear in reflections and saves. Name:
        3–24 characters (letters, numbers, underscores, hyphens).
      </p>
      <p className={styles.hint}>
        Drag sideways on the preview to rotate. Reception stays disabled until your roster line syncs.
      </p>
      {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
      {!conn ? (
        <p className={styles.hint}>Connecting to reception—almost there.</p>
      ) : !spacetimeUserSnapshotReady ? (
        <p className={styles.hint}>Your key synced; pulling your line from dispatch…</p>
      ) : null}

      <canvas
        ref={canvasRef}
        className={styles.profilePreviewCanvas}
        aria-label="Character preview — drag horizontally to rotate"
      />

      <div className={styles.segmentRow} role="group" aria-label="Body type">
        <button
          type="button"
          className={avatarBody === 0 ? styles.segmentActive : styles.segmentInactive}
          disabled={busy}
          onClick={() => setAvatarBody(0)}
        >
          Male
        </button>
        <button
          type="button"
          className={avatarBody === 1 ? styles.segmentActive : styles.segmentInactive}
          disabled={busy}
          onClick={() => setAvatarBody(1)}
        >
          Female
        </button>
      </div>

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

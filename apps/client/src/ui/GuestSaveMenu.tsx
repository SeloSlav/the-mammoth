import type { SpacetimeSession } from "../spacetime/SpacetimeProvider";
import { readEnableAccountAuth } from "../spacetime/env";
import { MAX_GUEST_SAVE_SLOTS } from "../spacetime/guestSaveRegistry";
import styles from "./LoginGate.module.css";

type Props = {
  session: SpacetimeSession;
};

function formatLastPlayed(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export function GuestSaveMenu({ session }: Props) {
  const {
    guestSaveSummaries,
    activeGuestSlotId,
    selectGuestSaveSlot,
    startNewGuestSave,
    deleteGuestSaveSlot,
    errorMsg,
  } = session;

  const sorted = guestSaveSummaries;
  const authGate = readEnableAccountAuth();
  const canAddSave = sorted.length < MAX_GUEST_SAVE_SLOTS;

  return (
    <>
      <p className={styles.subtitle}>Guest saves live only in this browser. Pick a slot or create one.</p>
      {errorMsg ? <p className={styles.message}>{errorMsg}</p> : null}
      {sorted.length === 0 ? (
        <p className={styles.hint}>No saves yet. Use New save below.</p>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        {sorted.map((s) => {
          const active = s.id === activeGuestSlotId;
          const label = s.cachedDisplayName ?? "Unnamed — finish profile";
          return (
            <div
              key={s.id}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: `1px solid ${
                  active ? "color-mix(in srgb, var(--ui-accent) 65%, transparent)" : "var(--ui-card-border)"
                }`,
                background: active ? "color-mix(in srgb, var(--ui-accent) 14%, transparent)" : "transparent",
              }}
            >
              <div style={{ fontWeight: 750, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--ui-text-muted)", marginBottom: 10 }}>
                Last played {formatLastPlayed(s.updatedAtMs)}
                {active ? <span style={{ marginLeft: 8, opacity: 0.85 }}>(last loaded)</span> : null}
              </div>
              <button
                type="button"
                className={styles.button}
                style={{ minHeight: 42 }}
                onClick={() => selectGuestSaveSlot(s.id)}
              >
                Load
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                style={{ marginTop: 8 }}
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm(
                      "Remove this save from this browser? The server copy is not deleted.",
                    )
                  ) {
                    return;
                  }
                  deleteGuestSaveSlot(s.id);
                }}
              >
                Delete save
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.secondaryButton}
        disabled={!canAddSave}
        onClick={() => startNewGuestSave()}
      >
        {canAddSave ? "New save" : `Save slots full (${MAX_GUEST_SAVE_SLOTS}/${MAX_GUEST_SAVE_SLOTS})`}
      </button>
      {authGate ? (
        <button type="button" className={styles.secondaryButton} onClick={() => session.signOutToAuthGate()}>
          Back to sign-in
        </button>
      ) : null}
    </>
  );
}

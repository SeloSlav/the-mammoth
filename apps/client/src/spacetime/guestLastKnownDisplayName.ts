/**
 * Mirrors last known guest username from Spacetime `user.username` subscriptions.
 * Hint only: LoginGate may show reconnect copy while `needs_name`; never derive `phase` from this alone.
 *
 * Cleared when the subscribed `user` row has no username or on guest sign-out.
 */const STORAGE_KEY = "mammoth_stdb_guest_last_display_name";

export function readGuestLastKnownDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const t = raw?.trim() ?? "";
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}

export function writeGuestLastKnownDisplayName(name: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const t = name?.trim() ?? "";
    if (t.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore quota / privacy mode */
  }
}

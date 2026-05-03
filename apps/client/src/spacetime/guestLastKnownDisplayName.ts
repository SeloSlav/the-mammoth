/**
 * Mirrors last known guest username from subscriptions for localStorage-backed guest reconnect UX.
 * Used only for initial route UI: unnamed guests bootstrap as `needs_name` without a flash of full-screen connecting.
 *
 * Cleared when the signed-in `user` row has no username or on guest sign-out.
 */
const STORAGE_KEY = "mammoth_stdb_guest_last_display_name";

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

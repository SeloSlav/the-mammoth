/** Persists SpacetimeDB WebSocket token from anonymous `withToken(undefined)` connections. */
const STORAGE_KEY = "mammoth_stdb_guest_ws_token";

export function readGuestConnectionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeGuestConnectionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token === null || token === "") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* ignore quota / privacy mode */
  }
}

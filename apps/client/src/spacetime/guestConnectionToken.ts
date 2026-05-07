import {
  getActiveGuestWsToken,
  persistGuestWsTokenAfterConnect,
  readGuestSaveRegistry,
} from "./guestSaveRegistry";

/** Active guest save’s Spacetime anonymous WS token (if any). */
export function readGuestConnectionToken(): string | null {
  return getActiveGuestWsToken(readGuestSaveRegistry());
}

/**
 * Persists the token returned from Spacetime `onConnect` for the active guest save (or creates one).
 * Passing `null` is a no-op — clearing saves uses {@link guestSaveRegistry} APIs.
 */
export function writeGuestConnectionToken(token: string | null): void {
  if (token !== null && token !== "") {
    persistGuestWsTokenAfterConnect(token);
  }
}

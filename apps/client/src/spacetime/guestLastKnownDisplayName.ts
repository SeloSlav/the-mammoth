/**
 * Cached roster name on the **active** guest save slot (hint for reconnect UI).
 * Server-owned `user.username` still wins after subscriptions hydrate.
 */
import { readActiveGuestCachedDisplayName, updateActiveGuestCachedDisplayName } from "./guestSaveRegistry";

export function readGuestLastKnownDisplayName(): string | null {
  return readActiveGuestCachedDisplayName();
}

export function writeGuestLastKnownDisplayName(name: string | null): void {
  updateActiveGuestCachedDisplayName(name);
}

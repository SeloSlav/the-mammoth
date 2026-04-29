/**
 * Rollout / debug toggles for first-person collision.
 *
 * - Default: character controller (sweep + slide + merged blockers).
 * - Set `localStorage.setItem("mammothFpLegacyCollision", "1")` to force legacy axis depenetration
 *   for A/B comparison (client only).
 */
export function readFpUseCharacterController(): boolean {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return true;
    return globalThis.localStorage.getItem("mammothFpLegacyCollision") !== "1";
  } catch {
    return true;
  }
}

export function readFpCollisionDebugDraw(): boolean {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return false;
    return globalThis.localStorage.getItem("mammothFpCollisionDebug") === "1";
  } catch {
    return false;
  }
}

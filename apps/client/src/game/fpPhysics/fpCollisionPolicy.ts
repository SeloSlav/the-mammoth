/**
 * Rollout / debug toggles for first-person collision.
 *
 * - Default: character controller (sweep + slide + merged blockers).
 * - Set `localStorage.setItem("mammothFpLegacyCollision", "1")` to force legacy axis depenetration
 *   for A/B comparison (client only).
 *
 * Debug visualization (dev / manual QA only):
 * - `mammothFpCollisionDebug` = `"1"` — feet ring + horizontal velocity arrow at physics feet.
 * - `mammothFpPhysicsDebug` = `"1"` — adds wireframe AABBs (static + elevator + apartment doors
 *   near the player), approximate capsule sticks, and rig vs physics feet marker when offset is non-zero.
 * - `mammothFpRemotePlayerCollisionDebug` = `"1"` — lime wireframes for other players’ authoritative
 *   collision boxes (same AABB as movement blocking / server melee sampling radius×height). Turning this
 *   on alone still enables the debug overlay group (no need for feet ring / physics overlay).
 * - `mammothFpReconcileDebug` = `"1"` — `console.info` on every prediction reconcile that applies
 *   a non-trivial correction (client vs replayed/server pose).
 * - `mammothFpDoorAnimSkewWarn` = `"1"` — throttled `console.warn` when apartment-door
 *   `visualOpen01` (client collision) diverges from replicated `swing_open_01` (server).
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

/** Wireframe solids + capsule helpers (see module docstring). */
export function readFpPhysicsDebugOverlay(): boolean {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return false;
    return globalThis.localStorage.getItem("mammothFpPhysicsDebug") === "1";
  } catch {
    return false;
  }
}

export function readFpRemotePlayerCollisionDebugDraw(): boolean {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return false;
    return globalThis.localStorage.getItem("mammothFpRemotePlayerCollisionDebug") === "1";
  } catch {
    return false;
  }
}

export function readFpReconcileDebugLog(): boolean {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return false;
    return globalThis.localStorage.getItem("mammothFpReconcileDebug") === "1";
  } catch {
    return false;
  }
}

export function readFpDoorAnimSkewWarn(): boolean {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return false;
    return globalThis.localStorage.getItem("mammothFpDoorAnimSkewWarn") === "1";
  } catch {
    return false;
  }
}

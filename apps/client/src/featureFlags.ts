/**
 * Compile-time knobs for the client runtime.
 *
 * **World / rendering:** `packages/world/src/featureFlags.ts` (re-exported from `@the-mammoth/world`).
 *
 * **Server parity:** `apps/server/src/feature_flags.rs` — keep cross-boundary flags (e.g. claim timing) in sync.
 */

/** When `true`, apartment claim HUD/timing assumes ~1 s completion (mirror server). Never ship enabled. */
export const APARTMENT_CLAIM_FAST_FOR_TESTING = false;

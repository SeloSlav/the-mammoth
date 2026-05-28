/**
 * Compile-time knobs for the client runtime.
 *
 * **World / rendering:** `packages/world/src/featureFlags.ts` (re-exported from `@the-mammoth/world`).
 *
 * Stairwell graffiti decals (optional, FP-only): toggle `ENABLE_STAIRWELL_GRAFFITI_DECALS` in that file.
 * Runtime lighting flags in `packages/world/src/featureFlags.ts`:
 * - `ENABLE_RUNTIME_DYNAMIC_DECOR_LIGHTS` — TV/computer screen washes (on)
 * - `ENABLE_RUNTIME_APARTMENT_STATIC_FIXTURE_LIGHTS` — in-unit ceiling/chandelier/standing/grow-op (on)
 * - `ENABLE_RUNTIME_WINDOW_FILL_LIGHTS` — in-unit window fills (on)
 * - `ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS` — stairwell only (off)
 * - `ENABLE_RUNTIME_CORRIDOR_FIXTURE_PRACTICAL_LIGHTS` — always off; corridor fixtures are emissive-only
 * Corridor ceiling fixture meshes: `ENABLE_CORRIDOR_CEILING_LIGHTS` (off).
 * Stairwell ceiling fixture meshes: `ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS` (off).
 *
 * **Server parity:** `apps/server/src/feature_flags.rs` — keep cross-boundary flags (e.g. claim timing) in sync.
 * Unclaimed-apartment world loot (`ENABLE_UNCLAIMED_APARTMENT_WORLD_LOOT`) is server-only.
 */

/** When `true`, apartment claim HUD/timing assumes ~1 s completion (mirror server). Never ship enabled. */
export const APARTMENT_CLAIM_FAST_FOR_TESTING = false;

/** When `false`, no apartment claim HUD, hold pulses, or wardrobe aim — reducer remains on server only. */
export const APARTMENT_CLAIM_UI_ENABLED = false;

/**
 * Compile-time knobs for the client runtime.
 *
 * **World / rendering:** `packages/world/src/featureFlags.ts` (re-exported from `@the-mammoth/world`).
 *
 * Stairwell graffiti decals (optional, FP-only): toggle `ENABLE_STAIRWELL_GRAFFITI_DECALS` in that file.
 * Runtime lighting flags in `packages/world/src/featureFlags.ts`:
 * - `ENABLE_APARTMENT_BAKED_SHELL_LIGHTING` — programmatic shell lightmaps vs in-unit practical pools
 * - `ENABLE_RUNTIME_DYNAMIC_DECOR_LIGHTS` — TV/computer screen washes (on)
 * - `ENABLE_RUNTIME_WINDOW_FILL_LIGHTS` — in-unit window fills (on until baked)
 * - `ENABLE_RUNTIME_SHARED_STATIC_FIXTURE_PRACTICAL_LIGHTS` — corridor/stairwell (off)
 * Stairwell + corridor fixture meshes: `ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS`.
 *
 * **Server parity:** `apps/server/src/feature_flags.rs` — keep cross-boundary flags (e.g. claim timing) in sync.
 */

/** When `true`, apartment claim HUD/timing assumes ~1 s completion (mirror server). Never ship enabled. */
export const APARTMENT_CLAIM_FAST_FOR_TESTING = false;

/** When `false`, no apartment claim HUD, hold pulses, or wardrobe aim — reducer remains on server only. */
export const APARTMENT_CLAIM_UI_ENABLED = false;

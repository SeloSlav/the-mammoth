//! Compile-time knobs for gameplay experiments and local testing.
//!
//! **Client parity:** `apps/client/src/featureFlags.ts` mirrors any flag that affects
//! networked timing or HUD (e.g. apartment claim duration).

/// When `true`, `claim_apartment_pulse` completes after ~1 s instead of ~30 s.
/// **Never ship production with this enabled.**
pub const APARTMENT_CLAIM_FAST_FOR_TESTING: bool = true;

/// When `true`, `refresh_world_loot_spawns` places weapon/ammo/scrap in a subset of unclaimed apartments.
/// Corridor spine anchors are unaffected. Off while apartment interiors are still in flux.
pub const ENABLE_UNCLAIMED_APARTMENT_WORLD_LOOT: bool = false;

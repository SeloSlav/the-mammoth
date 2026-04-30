//! Public spawn / respawn routing — new joins and bedless respawns land on the **ground-floor lobby**
//! near the west elevator bank (shared space with world loot anchors), not random stairwells.

use spacetimedb::{Identity, ReducerContext};

use crate::elevator_layout::{support_feet_y_for_level, BUILDING_ORIGIN_Y};
use crate::pose::{player_pose, PlayerPose};

/// Central lobby walk area (see `WORLD_LOOT_*` anchors in `dropped_item.rs`, ground slab Y ≈ 0.20 m).
const GROUND_LOBBY_SPAWN_CENTER_XZ: (f32, f32) = (-1.35, -0.35);
const GROUND_LOBBY_SPAWN_JITTER_X: f32 = 4.8;
const GROUND_LOBBY_SPAWN_JITTER_Z: f32 = 6.0;

#[inline]
fn splitmix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

#[inline]
fn rand_next(seed: &mut u64) -> u64 {
    let x = splitmix64(*seed);
    *seed = x.wrapping_mul(6364136223846793005).wrapping_add(1);
    x
}

/// Random point on the ground-floor lobby (level 1 plate). Uses timestamp + pose seq as RNG seed.
pub(crate) fn random_public_spawn_pose(ctx: &ReducerContext, id: Identity) -> PlayerPose {
    let seq = ctx
        .db
        .player_pose()
        .identity()
        .find(&id)
        .map(|p| p.seq)
        .unwrap_or(0);

    let micros = ctx.timestamp.to_micros_since_unix_epoch().max(0) as u64;
    let mut seed = micros ^ seq.wrapping_mul(0xD6E8_FEB9_C471_D7F7);

    let (cx, cz) = GROUND_LOBBY_SPAWN_CENTER_XZ;
    let jitter_x =
        ((rand_next(&mut seed) & 0xFFFF) as f32 / 65535.0 - 0.5) * GROUND_LOBBY_SPAWN_JITTER_X;
    let jitter_z =
        ((rand_next(&mut seed) & 0xFFFF) as f32 / 65535.0 - 0.5) * GROUND_LOBBY_SPAWN_JITTER_Z;

    let feet_y = support_feet_y_for_level(1, BUILDING_ORIGIN_Y);

    // Match historical stairwell spawns: face toward +Z (hall spine).
    let yaw = std::f32::consts::PI;

    PlayerPose {
        identity: id,
        x: cx + jitter_x,
        y: feet_y,
        z: cz + jitter_z,
        yaw,
        seq,
        vel_x: 0.0,
        vel_y: 0.0,
        vel_z: 0.0,
        grounded: 1,
    }
}

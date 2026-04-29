//! Public spawn / respawn routing — random stairwell landings match east-hub shafts in
//! `content/building/floors/floor_mamutica_typical.json` (`stair_well_*_e` at px≈6.16).

use spacetimedb::{Identity, ReducerContext};

use crate::elevator_layout::{max_level, support_feet_y_for_level, BUILDING_ORIGIN_Y};
use crate::pose::{player_pose, PlayerPose};

/// Stair column centers (`shaftPlanKey` xz); paired `pz` cores repeat across Mamutica.
const STAIR_SHAFT_CENTER_XZ: &[(f32, f32)] = &[
    (6.16, -92.0),
    (6.16, -46.0),
    (6.16, 0.0),
    (6.16, 46.0),
    (6.16, 92.0),
];

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

/// Random landing on an east stair shaft (same columns every storey). Uses timestamp + pose seq as RNG seed.
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

    let n_shafts = STAIR_SHAFT_CENTER_XZ.len() as u64;
    let shaft_i = (rand_next(&mut seed) % n_shafts) as usize;
    let max_lv = max_level().max(1);
    let level = 1 + ((rand_next(&mut seed) % u64::from(max_lv)) as u32);

    let (cx, cz) = STAIR_SHAFT_CENTER_XZ[shaft_i];
    let jitter_x = ((rand_next(&mut seed) & 0xFFFF) as f32 / 65535.0 - 0.5) * 2.4;
    let jitter_z = ((rand_next(&mut seed) & 0xFFFF) as f32 / 65535.0 - 0.5) * 3.5;

    let feet_y = support_feet_y_for_level(level, BUILDING_ORIGIN_Y);

    // Face roughly toward the residential wing (−X) from the east stair core.
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

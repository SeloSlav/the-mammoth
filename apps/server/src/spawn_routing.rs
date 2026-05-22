//! Public spawn / respawn routing — new joins and bedless respawns land at a **random point on the
//! ground-floor walk mesh**, biased toward larger open slabs and avoiding elevator hoistway
//! footprints (XZ). Corridor world loot stays along wide spine slabs away from cab thresholds
//! (see `WORLD_LOOT_ANCHORS` in `dropped_item.rs`).

use std::sync::OnceLock;

use spacetimedb::{Identity, ReducerContext};

use crate::elevator_layout::{
    support_feet_y_for_level, BUILDING_ORIGIN_Y, MAMUTH_ELEVATOR_SPECS, SHAFT_SX, SHAFT_SZ,
};
use crate::generated_walk_surfaces;
use crate::pose::{player_pose, PlayerPose};
use crate::stair_runtime_overlay;

/// Fallback lobby pocket when walk filtering yields nothing (should be unreachable in production).
const GROUND_LOBBY_SPAWN_CENTER_XZ: (f32, f32) = (-1.35, -0.35);
const GROUND_LOBBY_SPAWN_JITTER_X: f32 = 4.8;
const GROUND_LOBBY_SPAWN_JITTER_Z: f32 = 6.0;

/// Hoistway half-extents in XZ plus padding — reject spawn points inside this footprint around each
/// ground-floor plate (matches west-bank lobby pockets).
const SHAFT_XZ_MARGIN: f32 = 0.65;
/// Horizontal inset from slab AABB edges when sampling (keeps feet off trims).
const SPAWN_SLAB_INSET: f32 = 0.45;
/// Keeps samples off stair proxies and tiny thresholds.
const MIN_SLAB_SPAN_XZ: f32 = 0.95;
const MIN_SLAB_AREA_XZ: f32 = 1.4;
/// Ground interior slab band (walk tops ≈ 0.08–0.20 m); floors above start ~3.15 m+.
const GROUND_WALK_TOP_MIN: f32 = 0.055;
const GROUND_WALK_TOP_MAX: f32 = 0.30;
const MAX_SLAB_THICKNESS: f32 = 0.55;
/// Matches `movement.rs` `SKIN` — feet sit this far above walk surface top.
const FEET_CLEARANCE_M: f32 = 0.034;

#[derive(Clone, Copy)]
struct GroundSpawnSlab {
    mn: [f32; 3],
    mx: [f32; 3],
    area_xz: f32,
}

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

#[inline]
fn xz_point_hits_elevator_shaft(x: f32, z: f32) -> bool {
    let hx = SHAFT_SX * 0.5 + SHAFT_XZ_MARGIN;
    let hz = SHAFT_SZ * 0.5 + SHAFT_XZ_MARGIN;
    for spec in MAMUTH_ELEVATOR_SPECS {
        let dx = (x - spec.plate_x).abs();
        let dz = (z - spec.plate_z).abs();
        if dx <= hx && dz <= hz {
            return true;
        }
    }
    false
}

fn is_ground_floor_walk_slab(mn: [f32; 3], mx: [f32; 3]) -> bool {
    if stair_runtime_overlay::suppress_static_walk_surface(mn, mx) {
        return false;
    }
    let top = mx[1];
    if top < GROUND_WALK_TOP_MIN || top > GROUND_WALK_TOP_MAX {
        return false;
    }
    let th = top - mn[1];
    if th <= 1e-4 || th > MAX_SLAB_THICKNESS {
        return false;
    }
    let dx = mx[0] - mn[0];
    let dz = mx[2] - mn[2];
    if dx < MIN_SLAB_SPAN_XZ || dz < MIN_SLAB_SPAN_XZ {
        return false;
    }
    dx * dz >= MIN_SLAB_AREA_XZ
}

fn ground_spawn_slabs() -> &'static [GroundSpawnSlab] {
    static CACHE: OnceLock<Vec<GroundSpawnSlab>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let mut v = Vec::new();
            for shard in generated_walk_surfaces::WALK_SURFACE_AABB_SHARDS {
                for &(mn, mx) in *shard {
                    if !is_ground_floor_walk_slab(mn, mx) {
                        continue;
                    }
                    let dx = mx[0] - mn[0];
                    let dz = mx[2] - mn[2];
                    v.push(GroundSpawnSlab {
                        mn,
                        mx,
                        area_xz: dx * dz,
                    });
                }
            }
            v
        })
        .as_slice()
}

fn sample_walk_spawn_xyz(slabs: &[GroundSpawnSlab], seed: &mut u64) -> Option<(f32, f32, f32)> {
    let total: f64 = slabs.iter().map(|s| s.area_xz as f64).sum();
    if !(total > 1e-6) {
        return None;
    }

    const SLAB_ATTEMPTS: usize = 14;
    const POINT_ATTEMPTS: usize = 18;

    for _ in 0..SLAB_ATTEMPTS {
        let roll = (rand_next(seed) as f64 / u64::MAX as f64) * total;
        let mut accum = 0.0;
        let mut chosen = slabs.last()?;
        for s in slabs {
            accum += s.area_xz as f64;
            if roll <= accum {
                chosen = s;
                break;
            }
        }

        let x0 = chosen.mn[0] + SPAWN_SLAB_INSET;
        let x1 = chosen.mx[0] - SPAWN_SLAB_INSET;
        let z0 = chosen.mn[2] + SPAWN_SLAB_INSET;
        let z1 = chosen.mx[2] - SPAWN_SLAB_INSET;
        if !(x1 > x0 && z1 > z0) {
            continue;
        }

        for _ in 0..POINT_ATTEMPTS {
            let u = (rand_next(seed) & 0xFFFF) as f32 / 65535.0;
            let v = (rand_next(seed) & 0xFFFF) as f32 / 65535.0;
            let x = x0 + u * (x1 - x0);
            let z = z0 + v * (z1 - z0);
            if xz_point_hits_elevator_shaft(x, z) {
                continue;
            }
            let feet_y = chosen.mx[1] + FEET_CLEARANCE_M;
            return Some((x, feet_y, z));
        }
    }
    None
}

fn fallback_lobby_spawn_xyz(seed: &mut u64) -> (f32, f32, f32) {
    let (cx, cz) = GROUND_LOBBY_SPAWN_CENTER_XZ;
    let jitter_x =
        ((rand_next(seed) & 0xFFFF) as f32 / 65535.0 - 0.5) * GROUND_LOBBY_SPAWN_JITTER_X;
    let jitter_z =
        ((rand_next(seed) & 0xFFFF) as f32 / 65535.0 - 0.5) * GROUND_LOBBY_SPAWN_JITTER_Z;
    let feet_y = support_feet_y_for_level(1, BUILDING_ORIGIN_Y);
    (cx + jitter_x, feet_y, cz + jitter_z)
}

/// Random point on an open ground-floor walk slab (level 1 plate mesh). Uses timestamp + pose seq as RNG seed.
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

    let slabs = ground_spawn_slabs();
    let (x, feet_y, z) = sample_walk_spawn_xyz(slabs, &mut seed)
        .unwrap_or_else(|| fallback_lobby_spawn_xyz(&mut seed));

    let yaw_fract = (rand_next(&mut seed) & 0xFFFFFF) as f32 / 16777215.0;
    let yaw = yaw_fract * std::f32::consts::TAU;

    PlayerPose {
        identity: id,
        x,
        y: feet_y,
        z,
        yaw,
        seq,
        vel_x: 0.0,
        vel_y: 0.0,
        vel_z: 0.0,
        grounded: 1,
        melee_presentation_seq: 0,
        firearm_presentation_seq: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::{ground_spawn_slabs, sample_walk_spawn_xyz, xz_point_hits_elevator_shaft};

    #[test]
    fn ground_spawn_slabs_non_empty() {
        assert!(
            !ground_spawn_slabs().is_empty(),
            "generated walk surfaces must include ground-floor slabs for public spawn"
        );
    }

    #[test]
    fn elevator_shaft_xy_samples_rejected() {
        assert!(xz_point_hits_elevator_shaft(-3.175, 0.0));
        assert!(xz_point_hits_elevator_shaft(-3.175, -92.0));
        assert!(!xz_point_hits_elevator_shaft(0.0, 15.0));
    }

    #[test]
    fn sampled_walk_spawns_avoid_shafts() {
        let slabs = ground_spawn_slabs();
        let mut seed = 0xC0FFEE_DEAD_BEEF_u64;
        for _ in 0..64 {
            let Some((x, _y, z)) = sample_walk_spawn_xyz(slabs, &mut seed) else {
                panic!("sample_walk_spawn_xyz returned None");
            };
            assert!(
                !xz_point_hits_elevator_shaft(x, z),
                "spawn ({x},{z}) landed inside hoistway footprint"
            );
        }
    }
}

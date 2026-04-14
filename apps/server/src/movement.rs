//! Intent-driven movement + fixed-rate server integration.
//! Constants mirror `packages/engine/src/fpLocomotion.ts` — keep in sync when tuning.
//!
//! Elevator cab floors are snapshotted at tick start and lerped across player integration substeps
//! so vertical motion is not quantized to one 20 Hz sample per tick (see `merge_elevator_walk_top_lerped`).
//! After integration, `elevator::snap_inside_cab_feet_to_floor` re-attaches riders inside the cab
//! volume so probe/walk gaps cannot drop them through a moving car.

use std::collections::HashMap;

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::accounts::user;
use crate::auth;
use crate::elevator::{self, elevator_car, ElevatorCar};
use crate::pose::{player_pose, PlayerPose};
use crate::world_sound;

// --- Bit layout (must match `apps/client/src/game/moveIntentCodec.ts`) ---
pub const BIT_FORWARD: u8 = 1 << 0;
pub const BIT_BACK: u8 = 1 << 1;
pub const BIT_LEFT: u8 = 1 << 2;
pub const BIT_RIGHT: u8 = 1 << 3;
pub const BIT_JUMP: u8 = 1 << 4;
pub const BIT_SPRINT: u8 = 1 << 5;
pub const BIT_CROUCH: u8 = 1 << 6;

// --- Physics (keep aligned with fpLocomotion.ts) ---
const FLOOR_Y: f32 = 0.35;
const SKIN: f32 = 0.034;
const GRAVITY: f32 = 18.0;
const JUMP_SPEED: f32 = 5.4;
// Indoor-ish profile — keep in sync with `packages/engine/src/fpLocomotion.ts`.
const WALK_SPEED: f32 = 1.65;
const SPRINT_SPEED: f32 = 3.35;
const CROUCH_SPEED: f32 = 1.05;
const GROUND_ACCEL: f32 = 19.0;
const AIR_ACCEL: f32 = 4.2;
const DRAG: f32 = 10.0;
const TICK_DT: f32 = 0.05; // 20 Hz; matches 50_000 µs schedule
/// Keep in sync with `FP_WALK_PROBE_DY` (`packages/engine/src/fpLocomotion.ts`).
const WALK_PROBE_DY: f32 = 1.05;
/// Keep in sync with `FP_WALK_STEP_UP_MARGIN` / `sampleWalkGroundTopY` in world.
const WALK_STEP_UP_MARGIN: f32 = 0.82;
/// Keep in sync with `FP_WALK_FOOT_RADIUS_XZ`.
const FOOT_RADIUS_XZ: f32 = 0.22;
/// Match client: `round(FP_LOCOMOTION_SUBSTEPS_PER_SECOND * dt)` per integration step.
const LOCOMOTION_SUBSTEPS_PER_SECOND: f32 = 200.0;
/// Keep in sync with `stepFpLocomotion` integration substeps (max bound).
const PHYS_SUBSTEPS_MAX: u32 = 50;
/// Ignore ground farther below the feet than this (m); avoids snapping to lobby slab in a shaft.
/// Keep in sync with `FP_WALK_MAX_SUPPORT_DROP_M`.
const MAX_SUPPORT_DROP_M: f32 = 3.1;
const SNAP_EPS: f32 = 0.006;

#[inline]
fn damp(current: f32, target: f32, lambda: f32, dt: f32) -> f32 {
    target + (current - target) * (-lambda * dt).exp()
}

#[inline]
fn clamp_len2(dx: f32, dz: f32, max_len: f32) -> (f32, f32) {
    let h = (dx * dx + dz * dz).sqrt();
    if h <= max_len || h < 1e-6 {
        return (dx, dz);
    }
    let s = max_len / h;
    (dx * s, dz * s)
}

/// Latest sampled input per client; the physics tick reads this (write: intents only).
#[spacetimedb::table(public, accessor = player_input)]
pub struct PlayerInput {
    #[primary_key]
    pub identity: Identity,
    pub intent_seq: u64,
    pub bits: u8,
    pub aim_yaw: f32,
}

/// Drives `physics_tick_step` at a fixed interval (server simulation tick).
#[spacetimedb::table(
    public,
    accessor = physics_tick,
    scheduled(physics_tick_step)
)]
pub struct PhysicsTick {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::reducer]
pub fn submit_move_intent(ctx: &ReducerContext, intent_seq: u64, bits: u8, aim_yaw: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_move_intent blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if let Some(prev) = ctx.db.player_input().identity().find(&id) {
        if intent_seq <= prev.intent_seq {
            return;
        }
        ctx.db.player_input().identity().update(PlayerInput {
            identity: id,
            intent_seq,
            bits,
            aim_yaw,
        });
    } else {
        let _ = ctx.db.player_input().insert(PlayerInput {
            identity: id,
            intent_seq,
            bits,
            aim_yaw,
        });
    }
}

#[spacetimedb::reducer]
pub fn physics_tick_step(ctx: &ReducerContext, _arg: PhysicsTick) {
    if ctx.sender() != ctx.identity() {
        return;
    }

    let prev_elevators: HashMap<String, ElevatorCar> = ctx
        .db
        .elevator_car()
        .iter()
        .map(|c| (c.shaft_key.clone(), c))
        .collect();
    elevator::tick_all_elevators(ctx, TICK_DT);

    for pose in ctx.db.player_pose().iter() {
        let id = pose.identity;
        let Some(u) = ctx.db.user().identity().find(&id) else {
            continue;
        };
        if !auth::has_completed_registration(&u) {
            continue;
        }

        let input = ctx
            .db
            .player_input()
            .identity()
            .find(&id)
            .unwrap_or(PlayerInput {
                identity: id,
                intent_seq: 0,
                bits: 0,
                aim_yaw: pose.yaw,
            });

        let grounded_before = pose.grounded;
        let mut p = pose;
        integrate_one(ctx, &input, &mut p, TICK_DT, &prev_elevators);
        elevator::snap_inside_cab_feet_to_floor(ctx, &mut p);
        elevator::clamp_player_to_elevators(ctx, &mut p);
        elevator::clamp_player_landing_hoistway_front_walls(ctx, &mut p);
        elevator::clamp_player_against_closed_cab_doors_from_outside(ctx, &mut p);
        elevator::clamp_player_exterior_landing_doors(ctx, &mut p);
        world_sound::sync_footsteps_for_tick(ctx, id, &input, grounded_before, &p, TICK_DT);
        ctx.db.player_pose().identity().update(p);
    }
}

/// Walk top sampling with elevator cab Y interpolated between tick-start and tick-end snapshots.
fn sample_walk_ground_top_y_lerped(
    ctx: &ReducerContext,
    x: f32,
    z: f32,
    probe_top_y: f32,
    prev_elevators: &HashMap<String, ElevatorCar>,
    alpha: f32,
) -> f32 {
    let mut best = f32::NAN;
    let fr = FOOT_RADIUS_XZ;
    let fx0 = x - fr;
    let fx1 = x + fr;
    let fz0 = z - fr;
    let fz1 = z + fr;
    for shard in crate::generated_walk_surfaces::WALK_SURFACE_AABB_SHARDS {
        for (mn, mx) in *shard {
            if fx1 < mn[0] || fx0 > mx[0] || fz1 < mn[2] || fz0 > mx[2] {
                continue;
            }
            let top = mx[1];
            if top <= probe_top_y + WALK_STEP_UP_MARGIN {
                best = if best.is_nan() {
                    top
                } else {
                    best.max(top)
                };
            }
        }
    }
    best = elevator::merge_elevator_walk_top_lerped(
        ctx,
        x,
        z,
        probe_top_y,
        WALK_STEP_UP_MARGIN,
        best,
        Some(prev_elevators),
        alpha,
    );
    if best.is_nan() {
        const FP_MARGIN: f32 = 2.0;
        let outside = x < crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MIN_X - FP_MARGIN
            || x > crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MAX_X + FP_MARGIN
            || z < crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MIN_Z - FP_MARGIN
            || z > crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MAX_Z + FP_MARGIN;
        let exterior_probe_max_y = FLOOR_Y + 8.0;
        if outside && probe_top_y <= exterior_probe_max_y {
            FLOOR_Y
        } else {
            f32::NAN
        }
    } else {
        best.max(FLOOR_Y)
    }
}

fn integrate_one(
    ctx: &ReducerContext,
    input: &PlayerInput,
    p: &mut PlayerPose,
    dt: f32,
    prev_elevators: &HashMap<String, ElevatorCar>,
) {
    let h = dt.clamp(0.0, 0.05);
    let bits = input.bits;
    let yaw = input.aim_yaw;

    let ix = (bits & BIT_RIGHT != 0) as i32 - (bits & BIT_LEFT != 0) as i32;
    let iy = (bits & BIT_FORWARD != 0) as i32 - (bits & BIT_BACK != 0) as i32;
    let mut in_x = ix as f32;
    let mut in_y = iy as f32;
    let in_len = (in_x * in_x + in_y * in_y).sqrt();
    if in_len > 1.0 {
        in_x /= in_len;
        in_y /= in_len;
    }

    let forward_x = -yaw.sin();
    let forward_z = -yaw.cos();
    let right_x = yaw.cos();
    let right_z = -yaw.sin();

    let wish_x = forward_x * in_y + right_x * in_x;
    let wish_z = forward_z * in_y + right_z * in_x;

    let crouch = bits & BIT_CROUCH != 0;
    let sprint = bits & BIT_SPRINT != 0;
    let speed = if crouch {
        CROUCH_SPEED
    } else if sprint {
        SPRINT_SPEED
    } else {
        WALK_SPEED
    };
    let accel = if p.grounded != 0 {
        GROUND_ACCEL
    } else {
        AIR_ACCEL
    };
    let target_vx = wish_x * speed;
    let target_vz = wish_z * speed;

    p.vel_x = damp(p.vel_x, target_vx, accel, h);
    p.vel_z = damp(p.vel_z, target_vz, accel, h);

    let moving = in_x * in_x + in_y * in_y > 1e-4;
    if !moving && p.grounded != 0 {
        p.vel_x = damp(p.vel_x, 0.0, DRAG, h);
        p.vel_z = damp(p.vel_z, 0.0, DRAG, h);
    }

    if p.grounded != 0 && (bits & BIT_JUMP != 0) {
        let boost = elevator::elevator_jump_vertical_boost_mps(ctx, prev_elevators, p, h);
        p.vel_y = JUMP_SPEED + boost;
        p.grounded = 0;
    }

    let n_sub = (LOCOMOTION_SUBSTEPS_PER_SECOND * h).round() as i32;
    let n_sub = n_sub.clamp(1, PHYS_SUBSTEPS_MAX as i32) as u32;
    let sh = h / n_sub as f32;
    for i in 0..n_sub {
        let alpha = (i + 1) as f32 / n_sub as f32;
        let x0 = p.x;
        let z0 = p.z;
        p.vel_y -= GRAVITY * sh;
        p.x += p.vel_x * sh;
        p.z += p.vel_z * sh;
        p.y += p.vel_y * sh;
        let probe_y = p.y + WALK_PROBE_DY;
        let w0 = sample_walk_ground_top_y_lerped(ctx, x0, z0, probe_y, prev_elevators, alpha);
        let w1 = sample_walk_ground_top_y_lerped(ctx, p.x, p.z, probe_y, prev_elevators, alpha);
        let mut walk_top = w0;
        if w1.is_finite() {
            walk_top = if w0.is_finite() { w0.max(w1) } else { w1 };
        }
        if walk_top.is_finite()
            && walk_top > p.y - MAX_SUPPORT_DROP_M
            && p.y <= walk_top + SKIN + SNAP_EPS
        {
            p.y = walk_top + SKIN;
            p.vel_y = 0.0;
            p.grounded = 1;
        } else if !walk_top.is_finite() || walk_top <= p.y - MAX_SUPPORT_DROP_M {
            p.grounded = 0;
        }
    }

    if p.y < FLOOR_Y + SKIN - 1e-4 {
        p.y = FLOOR_Y + SKIN;
        p.vel_y = p.vel_y.max(0.0);
        p.grounded = 1;
    }

    // Anti-grief: clamp insane horizontal velocity from bad clients / float blowup
    let (vx, vz) = clamp_len2(p.vel_x, p.vel_z, 24.0);
    p.vel_x = vx;
    p.vel_z = vz;

    p.yaw = yaw;
    p.seq = input.intent_seq;
}

/// Insert repeating physics schedule (call from `init`).
pub fn start_physics_schedule(ctx: &ReducerContext) {
    let interval: TimeDuration = TimeDuration::from_micros(50_000);
    let _ = ctx.db.physics_tick().insert(PhysicsTick {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

/// Default input row for a new connection (processed before first intent).
pub fn ensure_player_input_row(ctx: &ReducerContext, id: Identity, yaw0: f32) {
    if ctx.db.player_input().identity().find(&id).is_none() {
        let _ = ctx.db.player_input().insert(PlayerInput {
            identity: id,
            intent_seq: 0,
            bits: 0,
            aim_yaw: yaw0,
        });
    }
}

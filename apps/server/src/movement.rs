//! Intent-driven movement + fixed-rate server integration.
//! Constants mirror `packages/engine/src/fpLocomotion.ts` — keep in sync when tuning.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::accounts::user;
use crate::auth;
use crate::pose::{player_pose, PlayerPose};

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
const SKIN: f32 = 0.02;
const GRAVITY: f32 = 18.0;
const JUMP_SPEED: f32 = 5.4;
const WALK_SPEED: f32 = 2.9;
const SPRINT_SPEED: f32 = 5.0;
const CROUCH_SPEED: f32 = 1.35;
const GROUND_ACCEL: f32 = 19.0;
const AIR_ACCEL: f32 = 4.2;
const DRAG: f32 = 10.0;
const TICK_DT: f32 = 0.05; // 20 Hz; matches 50_000 µs schedule

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

        let mut p = pose;
        integrate_one(&input, &mut p, TICK_DT);
        ctx.db.player_pose().identity().update(p);
    }
}

fn integrate_one(input: &PlayerInput, p: &mut PlayerPose, dt: f32) {
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
        p.vel_y = JUMP_SPEED;
        p.grounded = 0;
    }

    p.vel_y -= GRAVITY * h;

    p.x += p.vel_x * h;
    p.z += p.vel_z * h;
    p.y += p.vel_y * h;

    if p.y <= FLOOR_Y + SKIN {
        p.y = FLOOR_Y + SKIN;
        p.vel_y = 0.0;
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

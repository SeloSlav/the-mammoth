//! **Solo Mammoth — client-authored locomotion.** The browser runs FP collision, elevators, and doors
//! locally. This module persists snapshots on [`PlayerPose`] for world gameplay (pickups, apartment
//! doors, spatial queries) and keeps [`PlayerInput`] fresh for melee / firearm yaw — **without**
//! server-side movement integration, static collision resolution, or player-vs-player push.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::auth;
use crate::elevator;
use crate::player_vitals;
use crate::pose::player_pose;

// --- Bit layout (must match `apps/client/src/game/moveIntentCodec.ts`) ---
pub const BIT_FORWARD: u8 = 1 << 0;
pub const BIT_BACK: u8 = 1 << 1;
pub const BIT_LEFT: u8 = 1 << 2;
pub const BIT_RIGHT: u8 = 1 << 3;
pub const BIT_JUMP: u8 = 1 << 4;
pub const BIT_SPRINT: u8 = 1 << 5;
pub const BIT_CROUCH: u8 = 1 << 6;
/// Space held — variable jump height while rising (`fpLocomotion.ts` `jumpHeld`).
pub const BIT_JUMP_HELD: u8 = 1 << 7;

/// Capsule / blocking heights — keep aligned with FP collision (`packages/engine`).
pub const PLAYER_HEIGHT_STAND_M: f32 = 1.78;
pub const PLAYER_HEIGHT_CROUCH_M: f32 = 1.2;

/// Elevators + door animations advance at the same cadence the old integrated movement tick used.
const TICK_DT: f32 = 0.05;

/// Loose anti-corruption clamp — client owns truth; we only reject NaN/inf and absurd outliers.
const POSITION_CLAMP_ABS_M: f32 = 50_000.0;
const VELOCITY_CLAMP_ABS_MPS: f32 = 200.0;

#[inline]
fn finite_pose(x: f32, y: f32, z: f32, yaw: f32, aim_yaw: f32, vx: f32, vy: f32, vz: f32) -> bool {
    x.is_finite()
        && y.is_finite()
        && z.is_finite()
        && yaw.is_finite()
        && aim_yaw.is_finite()
        && vx.is_finite()
        && vy.is_finite()
        && vz.is_finite()
}

#[inline]
fn clamp_axis(v: f32, lim: f32) -> f32 {
    v.clamp(-lim, lim)
}

/// Latest sampled input per client — melee / firearm read `aim_yaw`; locomotion snapshot updates this too.
#[spacetimedb::table(public, accessor = player_input)]
pub struct PlayerInput {
    #[primary_key]
    pub identity: Identity,
    pub intent_seq: u64,
    pub bits: u8,
    pub aim_yaw: f32,
}

/// Drives `physics_tick_step` at a fixed interval (world simulation only — no player integration).
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

/// Full locomotion snapshot from the trusted solo client — updates [`PlayerPose`] + [`PlayerInput`].
#[spacetimedb::reducer]
#[allow(clippy::too_many_arguments)]
pub fn submit_player_locomotion_snapshot(
    ctx: &ReducerContext,
    intent_seq: u64,
    bits: u8,
    aim_yaw: f32,
    x: f32,
    y: f32,
    z: f32,
    yaw: f32,
    vel_x: f32,
    vel_y: f32,
    vel_z: f32,
    grounded: u8,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_player_locomotion_snapshot blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if player_vitals::is_player_dead(ctx, id) {
        return;
    }

    if let Some(prev_in) = ctx.db.player_input().identity().find(&id) {
        if intent_seq <= prev_in.intent_seq {
            return;
        }
    }

    let Some(mut pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    if intent_seq <= pose.seq {
        return;
    }

    if !finite_pose(x, y, z, yaw, aim_yaw, vel_x, vel_y, vel_z) {
        log::warn!("submit_player_locomotion_snapshot: non-finite pose from {id}");
        return;
    }

    let g = if grounded == 0 { 0 } else { 1 };

    let melee_pres = pose.melee_presentation_seq;
    let firearm_pres = pose.firearm_presentation_seq;

    pose.x = clamp_axis(x, POSITION_CLAMP_ABS_M);
    pose.y = clamp_axis(y, POSITION_CLAMP_ABS_M);
    pose.z = clamp_axis(z, POSITION_CLAMP_ABS_M);
    pose.yaw = yaw;
    pose.seq = intent_seq;
    pose.vel_x = clamp_axis(vel_x, VELOCITY_CLAMP_ABS_MPS);
    pose.vel_y = clamp_axis(vel_y, VELOCITY_CLAMP_ABS_MPS);
    pose.vel_z = clamp_axis(vel_z, VELOCITY_CLAMP_ABS_MPS);
    pose.grounded = g;
    pose.melee_presentation_seq = melee_pres;
    pose.firearm_presentation_seq = firearm_pres;

    ctx.db.player_pose().identity().update(pose);

    if ctx.db.player_input().identity().find(&id).is_some() {
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

    elevator::tick_all_elevators(ctx, TICK_DT);
    crate::apartment_door::tick_apartment_doors(ctx, TICK_DT);
}

/// Insert repeating physics schedule (call from `init`).
pub fn start_physics_schedule(ctx: &ReducerContext) {
    let interval: TimeDuration = TimeDuration::from_micros(50_000);
    let _ = ctx.db.physics_tick().insert(PhysicsTick {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

/// Default input row for a new connection (processed before first snapshot).
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

pub fn reset_player_input_row(ctx: &ReducerContext, id: Identity, yaw: f32) {
    if ctx.db.player_input().identity().find(&id).is_some() {
        ctx.db.player_input().identity().update(PlayerInput {
            identity: id,
            intent_seq: 0,
            bits: 0,
            aim_yaw: yaw,
        });
    } else {
        let _ = ctx.db.player_input().insert(PlayerInput {
            identity: id,
            intent_seq: 0,
            bits: 0,
            aim_yaw: yaw,
        });
    }
}

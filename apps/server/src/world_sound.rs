//! Replicated one-shot sounds (footsteps, melee swings) for nearby players.
//! Cleanup + cadence mirror the vibe survival `sound_events` pattern at a smaller scope.

use spacetimedb::{
    Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp,
};

use crate::auth;
use crate::movement::PlayerInput;
use crate::pose::{player_pose, PlayerPose};

// --- Bit layout: keep in sync with `apps/server/src/movement.rs` / `moveIntentCodec.ts` ---
const BIT_FORWARD: u8 = 1 << 0;
const BIT_BACK: u8 = 1 << 1;
const BIT_LEFT: u8 = 1 << 2;
const BIT_RIGHT: u8 = 1 << 3;
const BIT_CROUCH: u8 = 1 << 6;

/// `world_sound_event.kind` — client maps to assets / mix.
pub const KIND_FOOTSTEP: u8 = 0;
pub const KIND_CROWBAR_SWING: u8 = 1;

// --- Keep in sync with `movement.rs` / `fpLocomotion.ts` ---
const SPRINT_SPEED: f32 = 3.35;
const BOB_SPEED_MAX: f32 = 6.5;
const V0_FOOT: f32 = 0.15;
const STRIDE_PHASE_PER_STEP: f32 = std::f32::consts::PI;

#[spacetimedb::table(public, accessor = world_sound_event)]
pub struct WorldSoundEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// See `KIND_*`.
    pub kind: u8,
    /// Footsteps: stem index mod 6. Crowbar: 0 = swing-1, 1 = swing-2 WAV.
    pub variation: u8,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub volume: f32,
    pub max_distance_m: f32,
    pub emitter: Identity,
    pub created_at: Timestamp,
}

#[spacetimedb::table(public, accessor = player_foot_cadence)]
pub struct PlayerFootCadence {
    #[primary_key]
    pub identity: Identity,
    pub stride_phase: f32,
    pub last_stride_cell: i32,
    pub foot_rr: u8,
}

#[spacetimedb::table(public, accessor = player_melee_cooldown)]
pub struct PlayerMeleeCooldown {
    #[primary_key]
    pub identity: Identity,
    pub last_swing_micros: i64,
}

#[spacetimedb::table(
    public,
    accessor = world_sound_event_cleanup,
    scheduled(cleanup_old_world_sound_events)
)]
pub struct WorldSoundEventCleanup {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::reducer]
pub fn cleanup_old_world_sound_events(ctx: &ReducerContext, _arg: WorldSoundEventCleanup) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    let cutoff = ctx.timestamp - TimeDuration::from_micros(8_000_000);
    let old: Vec<u64> = ctx
        .db
        .world_sound_event()
        .iter()
        .filter(|e| e.created_at < cutoff)
        .map(|e| e.id)
        .collect();
    for id in old {
        ctx.db.world_sound_event().id().delete(id);
    }
}

pub fn start_cleanup_schedule(ctx: &ReducerContext) {
    let interval: TimeDuration = TimeDuration::from_micros(3_000_000);
    let _ = ctx.db.world_sound_event_cleanup().insert(WorldSoundEventCleanup {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

fn emit_world_sound(
    ctx: &ReducerContext,
    kind: u8,
    variation: u8,
    x: f32,
    y: f32,
    z: f32,
    volume: f32,
    max_distance_m: f32,
    emitter: Identity,
) {
    let row = WorldSoundEvent {
        id: 0,
        kind,
        variation,
        x,
        y,
        z,
        volume,
        max_distance_m,
        emitter,
        created_at: ctx.timestamp,
    };
    let _ = ctx.db.world_sound_event().insert(row);
}

/// Per-connection rows used by footsteps + melee cooldown.
pub fn ensure_player_audio_rows(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_foot_cadence().identity().find(&id).is_none() {
        let _ = ctx.db.player_foot_cadence().insert(PlayerFootCadence {
            identity: id,
            stride_phase: 0.0,
            last_stride_cell: -9_999_999,
            foot_rr: 0,
        });
    }
    if ctx.db.player_melee_cooldown().identity().find(&id).is_none() {
        let _ = ctx.db.player_melee_cooldown().insert(PlayerMeleeCooldown {
            identity: id,
            last_swing_micros: 0,
        });
    }
}

#[inline]
fn wish_moving(bits: u8) -> bool {
    let ix = (bits & BIT_RIGHT != 0) as i32 - (bits & BIT_LEFT != 0) as i32;
    let iy = (bits & BIT_FORWARD != 0) as i32 - (bits & BIT_BACK != 0) as i32;
    let mut in_x = ix as f32;
    let mut in_y = iy as f32;
    let in_len = (in_x * in_x + in_y * in_y).sqrt();
    if in_len > 1.0 {
        in_x /= in_len;
        in_y /= in_len;
    }
    in_x * in_x + in_y * in_y > 1e-4
}

/// Called from the physics tick after pose integration.
pub fn sync_footsteps_for_tick(
    ctx: &ReducerContext,
    id: Identity,
    input: &PlayerInput,
    grounded_before: u8,
    p: &PlayerPose,
    dt: f32,
) {
    let Some(mut cad) = ctx.db.player_foot_cadence().identity().find(&id) else {
        return;
    };

    let crouch = input.bits & BIT_CROUCH != 0;
    let moving = wish_moving(input.bits);
    let hs = (p.vel_x * p.vel_x + p.vel_z * p.vel_z).sqrt();
    let grounded = p.grounded != 0;

    // Match client: advance head-bob phase in locomotion, then derive stride cell from phase.
    if grounded && !crouch && moving && hs > V0_FOOT {
        let walk_strength = (hs / SPRINT_SPEED).clamp(0.0, 1.0);
        cad.stride_phase += dt * (BOB_SPEED_MAX * walk_strength);
    }

    let stride_cell = ((2.0 * cad.stride_phase) / STRIDE_PHASE_PER_STEP).floor() as i32;

    let just_landed = grounded && grounded_before == 0 && !crouch;
    if just_landed {
        cad.last_stride_cell = stride_cell;
        ctx.db.player_foot_cadence().identity().update(cad);
        return;
    }

    let can_step = grounded && !crouch && moving && hs > V0_FOOT;
    if can_step && stride_cell > cad.last_stride_cell {
        let v = cad.foot_rr % 6;
        cad.foot_rr = cad.foot_rr.wrapping_add(1);
        emit_world_sound(
            ctx,
            KIND_FOOTSTEP,
            v,
            p.x,
            p.y,
            p.z,
            0.48,
            26.0,
            id,
        );
        cad.last_stride_cell = stride_cell;
    } else if !can_step {
        cad.last_stride_cell = stride_cell;
    }

    ctx.db.player_foot_cadence().identity().update(cad);
}

const MELEE_COOLDOWN_MICROS: i64 = 480_000;

#[spacetimedb::reducer]
pub fn submit_melee_swing(ctx: &ReducerContext) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_melee_swing blocked: {e}");
        return;
    }
    let id = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    if ctx.db.player_melee_cooldown().identity().find(&id).is_none() {
        let _ = ctx.db.player_melee_cooldown().insert(PlayerMeleeCooldown {
            identity: id,
            last_swing_micros: 0,
        });
    }
    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let Some(mut cd) = ctx.db.player_melee_cooldown().identity().find(&id) else {
        return;
    };
    if now_us - cd.last_swing_micros < MELEE_COOLDOWN_MICROS {
        return;
    }
    cd.last_swing_micros = now_us;
    ctx.db.player_melee_cooldown().identity().update(cd);

    let v = ((now_us >> 7) as u8) & 1;
    emit_world_sound(
        ctx,
        KIND_CROWBAR_SWING,
        v,
        pose.x,
        pose.y + 0.95,
        pose.z,
        0.62,
        20.0,
        id,
    );
}

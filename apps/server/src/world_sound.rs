//! Replicated one-shot sounds (footsteps, melee weapon swings, world item pickup, elevator / landing-door UI,
//! cab arrival chime) for nearby players.
//! Cleanup + cadence mirror the vibe survival `sound_events` pattern at a smaller scope.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};

use crate::movement::PlayerInput;
use crate::pose::PlayerPose;

// --- Bit layout: keep in sync with `apps/server/src/movement.rs` / `moveIntentCodec.ts` ---
const BIT_FORWARD: u8 = 1 << 0;
const BIT_BACK: u8 = 1 << 1;
const BIT_LEFT: u8 = 1 << 2;
const BIT_RIGHT: u8 = 1 << 3;
const BIT_CROUCH: u8 = 1 << 6;

/// `world_sound_event.kind` — client maps to assets / mix.
pub const KIND_FOOTSTEP: u8 = 0;
/// Melee weapon swing whoosh — default + optional per-profile stems on client (see `variation`).
pub const KIND_MELEE_WEAPON_SWING: u8 = 1;
/// Successful `pickup_dropped_item` — one-shot at the drop’s world position (`variation` unused).
pub const KIND_ITEM_PICKUP: u8 = 2;
/// Hotbar instant consume — solid-ish food (`variation` 0 → `consume-eat` stem on client).
pub const KIND_CONSUME_EAT: u8 = 3;
/// Hotbar instant consume — drink / hydration-first (`variation` 0 → `consume-drink` stem).
pub const KIND_CONSUME_DRINK: u8 = 4;
/// In-cab floor selector (`elevator_select_floor`); `variation` unused.
pub const KIND_ELEVATOR_FLOOR_BUTTON: u8 = 5;
/// Landing hail / call panel (`elevator_hail`); `variation` unused.
pub const KIND_ELEVATOR_LANDING_HAIL: u8 = 6;
/// Corridor swing door opening (`elevator_landing_exterior_door_*`, desired_open 0→1); `variation` unused.
pub const KIND_LANDING_EXTERIOR_DOOR_OPEN: u8 = 7;
/// Corridor swing door closing (desired_open 1→0); `variation` unused.
pub const KIND_LANDING_EXTERIOR_DOOR_CLOSE: u8 = 8;
/// Elevator car finished a travel leg — docked at `move_to_level` (`variation` unused).
pub const KIND_ELEVATOR_CAB_ARRIVAL: u8 = 9;
/// Melee hit landed on another player (`variation` unused).
pub const KIND_MELEE_FLESH_HIT: u8 = 10;
/// Door boarding / reinforcement (`variation` unused until assets land).
pub const KIND_DOOR_REINFORCE: u8 = 11;
/// Gunshot — client maps WAV by `variation`: [`FIREARM_VARIATION_*`].
pub const KIND_FIREARM_SHOT: u8 = 12;
/// `world_sound_event.variation` for [`KIND_FIREARM_SHOT`]: pistol discharge.
pub const FIREARM_VARIATION_PISTOL: u8 = 0;
/// `world_sound_event.variation` for [`KIND_FIREARM_SHOT`]: shotgun discharge.
pub const FIREARM_VARIATION_SHOTGUN: u8 = 1;

// --- Keep in sync with `movement.rs` / `fpLocomotion.ts` ---
const SPRINT_SPEED: f32 = 3.35;
const BOB_SPEED_MAX: f32 = 6.5;
const V0_FOOT: f32 = 0.15;
const STRIDE_PHASE_PER_STEP: f32 = std::f32::consts::PI;

/// Multiplier on **world Y** separation for proximity falloff (`sqrt(dx² + dz² + (axis_weight_y·dy)²)`).
/// `1.0` is spherical; `>1` makes vertical offsets (floors / height) attenuate faster than the same span on XZ.
pub const AXIS_WEIGHT_Y_FOOTSTEP: f32 = 1.68;
pub const AXIS_WEIGHT_Y_MELEE: f32 = 1.52;
pub const AXIS_WEIGHT_Y_ITEM_PICKUP_CONSUME: f32 = 1.48;
pub const AXIS_WEIGHT_Y_ELEVATOR_DOOR: f32 = 1.26;
pub const AXIS_WEIGHT_Y_GUNFIRE: f32 = 1.2;
pub const AXIS_WEIGHT_Y_REINFORCE: f32 = 1.34;

#[spacetimedb::table(public, accessor = world_sound_event)]
pub struct WorldSoundEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    /// See `KIND_*`.
    pub kind: u8,
    /// Footsteps: stem index mod 6. Melee swing: low bits = stem A/B; upper bits = sound profile
    /// (see [`melee_weapon_swing_variation`]). Item pickup / consume: see module docs.
    pub variation: u8,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub volume: f32,
    pub max_distance_m: f32,
    /// See module `AXIS_WEIGHT_Y_*`; replicated so clients match server intent without a second mapping table.
    pub axis_weight_y: f32,
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
    let _ = ctx
        .db
        .world_sound_event_cleanup()
        .insert(WorldSoundEventCleanup {
            scheduled_id: 0,
            scheduled_at: interval.into(),
        });
}

pub(crate) fn emit_world_sound(
    ctx: &ReducerContext,
    kind: u8,
    variation: u8,
    x: f32,
    y: f32,
    z: f32,
    volume: f32,
    max_distance_m: f32,
    axis_weight_y: f32,
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
        axis_weight_y: axis_weight_y.clamp(0.25, 8.0),
        emitter,
        created_at: ctx.timestamp,
    };
    let _ = ctx.db.world_sound_event().insert(row);
}

/// One-shot at the drop position so nearby players hear the pickup (`emitter` = picker).
pub fn emit_item_pickup_at(ctx: &ReducerContext, x: f32, y: f32, z: f32, emitter: Identity) {
    emit_world_sound(
        ctx,
        KIND_ITEM_PICKUP,
        0,
        x,
        y,
        z,
        0.58,
        18.0,
        AXIS_WEIGHT_Y_ITEM_PICKUP_CONSUME,
        emitter,
    );
}

/// One-shot at the consumer’s mouth height (`y` should already be biased, e.g. pose + 0.9).
pub fn emit_hotbar_consume_at(
    ctx: &ReducerContext,
    kind: u8,
    x: f32,
    y: f32,
    z: f32,
    emitter: Identity,
) {
    if kind != KIND_CONSUME_EAT && kind != KIND_CONSUME_DRINK {
        log::warn!("emit_hotbar_consume_at: unexpected kind {kind}");
        return;
    }
    emit_world_sound(
        ctx,
        kind,
        0,
        x,
        y,
        z,
        0.66,
        16.0,
        AXIS_WEIGHT_Y_ITEM_PICKUP_CONSUME,
        emitter,
    );
}

/// Chest-height point by the in-cab panel (`emitter` = rider who pressed).
pub fn emit_elevator_floor_button_at(
    ctx: &ReducerContext,
    x: f32,
    y: f32,
    z: f32,
    emitter: Identity,
) {
    emit_world_sound(
        ctx,
        KIND_ELEVATOR_FLOOR_BUTTON,
        0,
        x,
        y,
        z,
        0.52,
        14.0,
        AXIS_WEIGHT_Y_ELEVATOR_DOOR,
        emitter,
    );
}

/// Landing call panel center (`emitter` = player who hailed).
pub fn emit_elevator_landing_hail_at(
    ctx: &ReducerContext,
    x: f32,
    y: f32,
    z: f32,
    emitter: Identity,
) {
    emit_world_sound(
        ctx,
        KIND_ELEVATOR_LANDING_HAIL,
        0,
        x,
        y,
        z,
        0.55,
        16.0,
        AXIS_WEIGHT_Y_ELEVATOR_DOOR,
        emitter,
    );
}

/// Landing corridor swing door — opening motion starts (`emitter` = player who toggled).
pub fn emit_landing_exterior_door_open_at(
    ctx: &ReducerContext,
    x: f32,
    y: f32,
    z: f32,
    emitter: Identity,
) {
    emit_world_sound(
        ctx,
        KIND_LANDING_EXTERIOR_DOOR_OPEN,
        0,
        x,
        y,
        z,
        0.58,
        20.0,
        AXIS_WEIGHT_Y_ELEVATOR_DOOR,
        emitter,
    );
}

/// Landing corridor swing door — closing motion starts.
pub fn emit_landing_exterior_door_close_at(
    ctx: &ReducerContext,
    x: f32,
    y: f32,
    z: f32,
    emitter: Identity,
) {
    emit_world_sound(
        ctx,
        KIND_LANDING_EXTERIOR_DOOR_CLOSE,
        0,
        x,
        y,
        z,
        0.58,
        20.0,
        AXIS_WEIGHT_Y_ELEVATOR_DOOR,
        emitter,
    );
}

/// In-cab world position for the arrival chime (`emitter` = module identity so every subscriber hears it).
pub fn emit_elevator_cab_arrival_at(ctx: &ReducerContext, x: f32, y: f32, z: f32) {
    emit_world_sound(
        ctx,
        KIND_ELEVATOR_CAB_ARRIVAL,
        0,
        x,
        y,
        z,
        0.62,
        22.0,
        AXIS_WEIGHT_Y_ELEVATOR_DOOR,
        ctx.identity(),
    );
}

/// Loud woodworking / hammering noise while reinforcing claimed doors (`variation` unused).
pub fn emit_reinforcement_noise_at(
    ctx: &ReducerContext,
    x: f32,
    y: f32,
    z: f32,
    emitter: Identity,
) {
    emit_world_sound(
        ctx,
        KIND_DOOR_REINFORCE,
        0,
        x,
        y,
        z,
        0.94,
        48.0,
        AXIS_WEIGHT_Y_REINFORCE,
        emitter,
    );
}

pub fn emit_gunfire_at(
    ctx: &ReducerContext,
    x: f32,
    y: f32,
    z: f32,
    emitter: Identity,
    variation: u8,
) {
    emit_world_sound(
        ctx,
        KIND_FIREARM_SHOT,
        variation,
        x,
        y,
        z,
        0.88,
        56.0,
        AXIS_WEIGHT_Y_GUNFIRE,
        emitter,
    );
}

pub fn emit_melee_flesh_hit_at(ctx: &ReducerContext, x: f32, y: f32, z: f32, emitter: Identity) {
    emit_world_sound(
        ctx,
        KIND_MELEE_FLESH_HIT,
        0,
        x,
        y,
        z,
        0.72,
        18.0,
        AXIS_WEIGHT_Y_MELEE,
        emitter,
    );
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
    if ctx
        .db
        .player_melee_cooldown()
        .identity()
        .find(&id)
        .is_none()
    {
        let _ = ctx.db.player_melee_cooldown().insert(PlayerMeleeCooldown {
            identity: id,
            last_swing_micros: 0,
        });
    }
}

pub fn reset_player_melee_cooldown_row(ctx: &ReducerContext, id: Identity) {
    if let Some(mut row) = ctx.db.player_melee_cooldown().identity().find(&id) {
        row.last_swing_micros = 0;
        ctx.db.player_melee_cooldown().identity().update(row);
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
            AXIS_WEIGHT_Y_FOOTSTEP,
            id,
        );
        cad.last_stride_cell = stride_cell;
    } else if !can_step {
        cad.last_stride_cell = stride_cell;
    }

    ctx.db.player_foot_cadence().identity().update(cad);
}

/// Low bits of melee swing `variation` — stem index (A/B alternation). Sync with
/// `apps/client/src/game/meleeSwingSound.ts` `MELEE_SWING_VARIATION_STEM_MASK`.
pub const MELEE_SWING_VARIATION_STEM_MASK: u8 = 0b11;

/// Catalog `def_id` → client sound profile (upper bits of `variation`). Keep aligned with
/// `meleeWeaponSwingSoundProfileFromDefId` in `meleeSwingSound.ts`.
#[inline]
pub fn melee_weapon_swing_sound_profile_for_def_id(def_id: &str) -> u8 {
    match def_id {
        // Example when assets exist: "knife" => 1,
        _ => 0,
    }
}

#[inline]
pub fn melee_weapon_swing_variation(profile: u8, stem_jitter: u8) -> u8 {
    let profile = profile.min(63);
    (profile << 2) | (stem_jitter & MELEE_SWING_VARIATION_STEM_MASK)
}

#[cfg(test)]
mod melee_swing_variation_tests {
    use super::*;

    #[test]
    fn melee_weapon_swing_variation_layout_matches_client() {
        let v = melee_weapon_swing_variation(7, 1);
        assert_eq!(v & MELEE_SWING_VARIATION_STEM_MASK, 1);
        assert_eq!((v >> 2) & 0x3f, 7);
    }
}

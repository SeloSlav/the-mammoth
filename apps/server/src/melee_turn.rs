//! Melee reducer — wired here to avoid cyclic imports (`world_sound` ↔ `apartments`).

use spacetimedb::{ReducerContext, Table};

use crate::apartments;
use crate::auth;
use crate::combat_stub;
use crate::combat_stub::melee_damage_for_def_id;
use crate::hitscan;
use crate::movement::player_input;
use crate::player_vitals;
use crate::pose::{bump_melee_presentation_seq, player_pose};
use crate::world_sound::{
    emit_melee_flesh_hit_at, emit_world_sound, melee_weapon_swing_sound_profile_for_def_id,
    melee_weapon_swing_variation, player_melee_cooldown, PlayerMeleeCooldown, AXIS_WEIGHT_Y_MELEE,
    KIND_MELEE_WEAPON_SWING, MELEE_SWING_VARIATION_STEM_MASK,
};

const MELEE_COOLDOWN_MICROS: i64 = 480_000;

#[spacetimedb::reducer]
pub fn submit_melee_swing(ctx: &ReducerContext, aim_dir_x: f32, aim_dir_y: f32, aim_dir_z: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_melee_swing blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if player_vitals::is_player_dead(ctx, id) {
        return;
    }
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
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
    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let Some(mut cd) = ctx.db.player_melee_cooldown().identity().find(&id) else {
        return;
    };
    if now_us - cd.last_swing_micros < MELEE_COOLDOWN_MICROS {
        return;
    }
    let Some(weapon_def_id) = combat_stub::active_hotbar_weapon_def_id(ctx, id) else {
        return;
    };
    cd.last_swing_micros = now_us;
    ctx.db.player_melee_cooldown().identity().update(cd);

    // Use latest intent yaw (`player_input.aim_yaw`), not `pose.yaw`. `pose.yaw` only advances on the
    // physics schedule (~20 Hz), while swings arrive mid-tick — stationary flick-turn would melee
    // along stale facing and silently miss (no flesh-hit sound).
    let swing_yaw = ctx
        .db
        .player_input()
        .identity()
        .find(&id)
        .map(|r| r.aim_yaw)
        .unwrap_or(pose.yaw);

    let aim_world = hitscan::sanitize_client_aim_dir(swing_yaw, aim_dir_x, aim_dir_y, aim_dir_z);

    if let Some(hit) = combat_stub::resolve_melee_hit(
        ctx,
        id,
        pose.x,
        pose.y,
        pose.z,
        swing_yaw,
        &weapon_def_id,
        aim_world,
        None,
        None,
    ) {
        player_vitals::apply_damage(ctx, hit.target, hit.damage);
        emit_melee_flesh_hit_at(ctx, hit.impact_x, hit.impact_y, hit.impact_z, id);
    } else {
        apartments::apply_forward_melee_door_damage(
            ctx,
            id,
            &pose,
            swing_yaw,
            melee_damage_for_def_id(&weapon_def_id),
        );
    }

    let profile = melee_weapon_swing_sound_profile_for_def_id(&weapon_def_id);
    let stem = ((now_us >> 7) as u8) & MELEE_SWING_VARIATION_STEM_MASK;
    let v = melee_weapon_swing_variation(profile, stem);
    bump_melee_presentation_seq(ctx, id);
    emit_world_sound(
        ctx,
        KIND_MELEE_WEAPON_SWING,
        v,
        pose.x,
        pose.y + 0.95,
        pose.z,
        0.62,
        20.0,
        AXIS_WEIGHT_Y_MELEE,
        id,
    );
}

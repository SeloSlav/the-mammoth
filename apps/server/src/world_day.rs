//! World day / sleep progression — discrete "nights" instead of a global clock.
//! Sleeping or dying advances the day for the player's claimed apartment systems.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments::{self, apartment_unit};
use crate::auth;
use crate::balcony_grow_op;
use crate::crafting::emit_hud_notice;
use crate::player_vitals;
use crate::pose::player_pose;

const BED_INTERACT_RADIUS_M: f32 = 2.25;
const BED_INTERACT_RADIUS_SQ: f32 = BED_INTERACT_RADIUS_M * BED_INTERACT_RADIUS_M;
const BED_FEET_Y_BELOW_M: f32 = 0.35;
const BED_FEET_Y_ABOVE_M: f32 = 2.5;

#[spacetimedb::table(public, accessor = player_world_progress)]
pub struct PlayerWorldProgress {
    #[primary_key]
    pub identity: Identity,
    /// Nights slept or skipped forward (death recovery counts).
    pub sleeps_count: u32,
}

pub(crate) fn ensure_player_world_progress(ctx: &ReducerContext, owner: Identity) {
    if ctx
        .db
        .player_world_progress()
        .identity()
        .find(&owner)
        .is_some()
    {
        return;
    }
    let _ = ctx.db.player_world_progress().insert(PlayerWorldProgress {
        identity: owner,
        sleeps_count: 0,
    });
}

pub(crate) fn sleeps_count_for(ctx: &ReducerContext, owner: Identity) -> u32 {
    ctx.db
        .player_world_progress()
        .identity()
        .find(&owner)
        .map(|r| r.sleeps_count)
        .unwrap_or(0)
}

fn player_near_unit_bed(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
) -> Result<(), String> {
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
        .ok_or_else(|| "unknown apartment".to_string())?;
    if unit.owner != Some(owner) || unit.state != apartments::UNIT_STATE_CLAIMED {
        return Err("need your claimed apartment".to_string());
    }
    let pose = ctx
        .db
        .player_pose()
        .identity()
        .find(&owner)
        .ok_or_else(|| "missing player pose".to_string())?;
    let (bx, by, bz) = if let Some(b) = apartments::primary_bed_row_for_unit_key(ctx, unit_key) {
        (b.pos_x, b.pos_y, b.pos_z)
    } else {
        (unit.bed_x, unit.bed_y, unit.bed_z)
    };
    let dx = pose.x - bx;
    let dz = pose.z - bz;
    if dx * dx + dz * dz > BED_INTERACT_RADIUS_SQ {
        return Err("Move closer to your bed.".to_string());
    }
    let dy = pose.y - by;
    if dy < -BED_FEET_Y_BELOW_M || dy > BED_FEET_Y_ABOVE_M {
        return Err("Move closer to your bed.".to_string());
    }
    Ok(())
}

/// Advance one world day: increment sleep counter, restore vitals, run apartment day hooks.
pub(crate) fn advance_world_day_for_player(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: Option<&str>,
) -> Result<u32, String> {
    ensure_player_world_progress(ctx, owner);
    let Some(mut row) = ctx.db.player_world_progress().identity().find(&owner) else {
        return Err("missing world progress row".to_string());
    };
    row.sleeps_count = row.sleeps_count.saturating_add(1);
    let nights = row.sleeps_count;
    ctx.db.player_world_progress().identity().update(row);
    player_vitals::restore_player_vitals_full(ctx, owner);
    if let Some(uk) = unit_key {
        balcony_grow_op::advance_world_day_for_unit(ctx, uk, 1);
    }
    Ok(nights)
}

#[spacetimedb::reducer]
pub fn sleep_in_bed(ctx: &ReducerContext, unit_key: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("sleep_in_bed blocked: {e}");
        return;
    }
    if let Err(e) = sleep_in_bed_impl(ctx, unit_key.as_str()) {
        log::debug!("sleep_in_bed: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

fn sleep_in_bed_impl(ctx: &ReducerContext, unit_key: &str) -> Result<(), String> {
    let sender = ctx.sender();
    if player_vitals::is_player_dead(ctx, sender) {
        return Err("You cannot sleep while unconscious.".to_string());
    }
    let claimed = apartments::claimed_unit_key_for_owner(ctx, sender)
        .ok_or_else(|| "need a claimed apartment".to_string())?;
    if claimed != unit_key {
        return Err("That is not your apartment.".to_string());
    }
    player_near_unit_bed(ctx, sender, unit_key)?;
    let nights = advance_world_day_for_player(ctx, sender, Some(unit_key))?;
    emit_hud_notice(
        ctx,
        sender,
        format!(
            "Morning. You lost track of the calendar long ago — night {nights} in the block."
        ),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn bed_interact_radius_is_reasonable() {
        assert!(super::BED_INTERACT_RADIUS_M >= 1.5);
    }
}

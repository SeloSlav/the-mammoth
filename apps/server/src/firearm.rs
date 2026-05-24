//! Ranged fire — chamber ammo, reload, and authoritative LOS hit-scan.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::auth;
use crate::hitscan;
use crate::inventory::{self, inventory_item};
use crate::inventory_models::ItemLocation;
use crate::movement::player_input;
use crate::player_vitals;
use crate::pose::{bump_firearm_presentation_seq, player_pose};
use crate::world_sound;

const RANGED_COOLDOWN_MICROS: i64 = 160_000;

/// Compact sidearm (`pistol` catalog) — single-stack magazine capacity.
const PISTOL_CHAMBER_CAPACITY: u8 = 6;
/// Coach shotgun — two shells in the tube before reload.
const SHOTGUN_CHAMBER_CAPACITY: u8 = 2;

const RELOAD_PISTOL_MICROS: i64 = 2_000_000;
const RELOAD_SHOTGUN_MICROS: i64 = 2_800_000;

#[spacetimedb::table(public, accessor = player_firearm_cooldown)]
pub struct PlayerFirearmCooldown {
    #[primary_key]
    pub identity: Identity,
    pub last_shot_micros: i64,
}

#[spacetimedb::table(public, accessor = player_firearm_chamber)]
pub struct PlayerFirearmChamber {
    #[primary_key]
    pub identity: Identity,
    /// Hotbar weapon this chamber row tracks (empty when unset).
    pub weapon_def_id: String,
    pub chamber_count: u8,
    /// Micros since epoch when an in-progress reload completes; `0` = idle.
    pub reload_complete_micros: i64,
}

pub fn ensure_player_firearm_cooldown_row(ctx: &ReducerContext, id: Identity) {
    if ctx
        .db
        .player_firearm_cooldown()
        .identity()
        .find(&id)
        .is_none()
    {
        let _ = ctx
            .db
            .player_firearm_cooldown()
            .insert(PlayerFirearmCooldown {
                identity: id,
                last_shot_micros: 0,
            });
    }
}

pub fn ensure_player_firearm_chamber_row(ctx: &ReducerContext, id: Identity) {
    if ctx
        .db
        .player_firearm_chamber()
        .identity()
        .find(&id)
        .is_none()
    {
        let _ = ctx
            .db
            .player_firearm_chamber()
            .insert(PlayerFirearmChamber {
                identity: id,
                weapon_def_id: String::new(),
                chamber_count: 0,
                reload_complete_micros: 0,
            });
    }
}

pub fn reset_player_firearm_chamber(ctx: &ReducerContext, id: Identity) {
    ensure_player_firearm_chamber_row(ctx, id);
    let Some(mut row) = ctx.db.player_firearm_chamber().identity().find(&id) else {
        return;
    };
    row.weapon_def_id = String::new();
    row.chamber_count = 0;
    row.reload_complete_micros = 0;
    ctx.db.player_firearm_chamber().identity().update(row);
}

fn ammo_def_for_weapon(weapon: &str) -> Option<&'static str> {
    match weapon {
        "pistol" => Some("ammo-9mm"),
        "shotgun-coach" => Some("ammo-shotgun-shell"),
        _ => None,
    }
}

fn chamber_capacity_for_weapon(weapon: &str) -> u8 {
    match weapon {
        "pistol" => PISTOL_CHAMBER_CAPACITY,
        "shotgun-coach" => SHOTGUN_CHAMBER_CAPACITY,
        _ => 0,
    }
}

fn reload_duration_micros_for_weapon(weapon: &str) -> i64 {
    match weapon {
        "pistol" => RELOAD_PISTOL_MICROS,
        "shotgun-coach" => RELOAD_SHOTGUN_MICROS,
        _ => 0,
    }
}

fn ranged_damage(weapon: &str) -> f32 {
    match weapon {
        "pistol" => crate::hitscan::FIREARM_DAMAGE_PISTOL,
        "shotgun-coach" => crate::hitscan::FIREARM_DAMAGE_SHOTGUN_TOTAL,
        _ => 0.0,
    }
}

fn is_ranged_weapon(def_id: &str) -> bool {
    ammo_def_for_weapon(def_id).is_some() && ranged_damage(def_id) > 0.0
}

fn count_carried_ammo(ctx: &ReducerContext, owner: Identity, def: &str) -> u32 {
    let mut total = 0u32;
    for row in ctx.db.inventory_item().iter() {
        let ok = match &row.location {
            ItemLocation::Inventory(d) => d.owner_id == owner,
            ItemLocation::Hotbar(d) => d.owner_id == owner,
            _ => false,
        };
        if ok && row.def_id == def {
            total = total.saturating_add(row.quantity);
        }
    }
    total
}

fn consume_carried_ammo(ctx: &ReducerContext, owner: Identity, def: &str, mut want: u32) -> u32 {
    if want == 0 {
        return 0;
    }
    let mut consumed = 0u32;
    for row in ctx.db.inventory_item().iter() {
        if want == 0 {
            break;
        }
        let ok = match &row.location {
            ItemLocation::Inventory(d) => d.owner_id == owner,
            ItemLocation::Hotbar(d) => d.owner_id == owner,
            _ => false,
        };
        if !ok || row.def_id != def || row.quantity == 0 {
            continue;
        }
        let take = want.min(row.quantity);
        let _ = inventory::remove_player_item_quantity(ctx, row.instance_id, take);
        consumed = consumed.saturating_add(take);
        want = want.saturating_sub(take);
    }
    consumed
}

fn firearm_reload_variation(weapon_def_id: &str) -> u8 {
    if weapon_def_id == "shotgun-coach" {
        world_sound::FIREARM_VARIATION_SHOTGUN
    } else {
        world_sound::FIREARM_VARIATION_PISTOL
    }
}

fn try_finish_reload(ctx: &ReducerContext, id: Identity, now_us: i64) {
    let Some(mut chamber) = ctx.db.player_firearm_chamber().identity().find(&id) else {
        return;
    };
    if chamber.reload_complete_micros == 0 || now_us < chamber.reload_complete_micros {
        return;
    }
    if chamber.weapon_def_id.is_empty() || !is_ranged_weapon(&chamber.weapon_def_id) {
        chamber.reload_complete_micros = 0;
        ctx.db.player_firearm_chamber().identity().update(chamber);
        return;
    }
    let cap = chamber_capacity_for_weapon(&chamber.weapon_def_id);
    let needed = cap.saturating_sub(chamber.chamber_count) as u32;
    if needed > 0 {
        let ammo_def = ammo_def_for_weapon(&chamber.weapon_def_id).expect("validated");
        let loaded = consume_carried_ammo(ctx, id, ammo_def, needed);
        chamber.chamber_count = chamber
            .chamber_count
            .saturating_add(loaded.min(u32::from(u8::MAX)) as u8);
    }
    chamber.reload_complete_micros = 0;
    ctx.db.player_firearm_chamber().identity().update(chamber);
}

/// When the active hotbar weapon changes, load a fresh chamber from carried reserve ammo.
fn ensure_chamber_weapon_synced(ctx: &ReducerContext, id: Identity, weapon_def_id: &str) {
    ensure_player_firearm_chamber_row(ctx, id);
    let Some(mut chamber) = ctx.db.player_firearm_chamber().identity().find(&id) else {
        return;
    };
    if chamber.weapon_def_id == weapon_def_id {
        return;
    }
    chamber.weapon_def_id = weapon_def_id.to_string();
    chamber.reload_complete_micros = 0;
    let cap = chamber_capacity_for_weapon(weapon_def_id);
    let ammo_def = ammo_def_for_weapon(weapon_def_id).expect("validated");
    let loaded = consume_carried_ammo(ctx, id, ammo_def, u32::from(cap));
    chamber.chamber_count = loaded.min(u32::from(cap)) as u8;
    ctx.db.player_firearm_chamber().identity().update(chamber);
}

fn is_reload_in_progress(chamber: &PlayerFirearmChamber, now_us: i64) -> bool {
    chamber.reload_complete_micros > 0 && now_us < chamber.reload_complete_micros
}

/// Client-sent camera-forward direction `(aim_dir_xyz)` in world units. Server normalizes +
/// clamps wild vectors before consuming ammo — **must** precede projectile math.
#[spacetimedb::reducer]
pub fn submit_firearm_shot(ctx: &ReducerContext, aim_dir_x: f32, aim_dir_y: f32, aim_dir_z: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_firearm_shot blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if player_vitals::is_player_dead(ctx, id) {
        return;
    }
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    let Some(weapon_def_id) = crate::combat_stub::active_hotbar_item_def_id(ctx, id) else {
        return;
    };
    if !is_ranged_weapon(&weapon_def_id) {
        return;
    }

    let yaw = ctx
        .db
        .player_input()
        .identity()
        .find(&id)
        .map(|r| r.aim_yaw)
        .unwrap_or(pose.yaw);

    if hitscan::sanitize_client_aim_dir(yaw, aim_dir_x, aim_dir_y, aim_dir_z).is_none() {
        return;
    }

    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    try_finish_reload(ctx, id, now_us);
    ensure_chamber_weapon_synced(ctx, id, &weapon_def_id);

    let Some(chamber) = ctx.db.player_firearm_chamber().identity().find(&id) else {
        return;
    };
    if is_reload_in_progress(&chamber, now_us) || chamber.chamber_count == 0 {
        return;
    }

    ensure_player_firearm_cooldown_row(ctx, id);
    let Some(mut cd) = ctx.db.player_firearm_cooldown().identity().find(&id) else {
        return;
    };
    if now_us - cd.last_shot_micros < RANGED_COOLDOWN_MICROS {
        return;
    }

    let Some(mut chamber) = ctx.db.player_firearm_chamber().identity().find(&id) else {
        return;
    };
    chamber.chamber_count = chamber.chamber_count.saturating_sub(1);
    ctx.db.player_firearm_chamber().identity().update(chamber);

    cd.last_shot_micros = now_us;
    ctx.db.player_firearm_cooldown().identity().update(cd);

    bump_firearm_presentation_seq(ctx, id);

    let gun_sound_variation = firearm_reload_variation(&weapon_def_id);
    world_sound::emit_gunfire_at(ctx, pose.x, pose.y + 1.02, pose.z, id, gun_sound_variation);

    let hits = hitscan::firearm_hitscan_weapon(
        ctx,
        id,
        &pose,
        weapon_def_id.as_str(),
        aim_dir_x,
        aim_dir_y,
        aim_dir_z,
    );

    for h in hits {
        player_vitals::apply_damage(ctx, h.identity, h.damage);
        world_sound::emit_melee_flesh_hit_at(
            ctx,
            h.ix,
            h.iy,
            h.iz,
            id,
            world_sound::flesh_impact_variation_for_hit(h.headshot, true, ""),
        );
    }

    let npc_hits = hitscan::firearm_hitscan_npcs(
        ctx,
        &pose,
        weapon_def_id.as_str(),
        aim_dir_x,
        aim_dir_y,
        aim_dir_z,
    );
    for h in npc_hits {
        crate::npc::apply_npc_damage(ctx, h.npc_id, h.damage);
        world_sound::emit_melee_flesh_hit_at(
            ctx,
            h.ix,
            h.iy,
            h.iz,
            id,
            world_sound::flesh_impact_variation_for_hit(h.headshot, true, ""),
        );
    }
}

/// Fill the chamber from carried reserve ammo after a timed reload (`R` on client).
#[spacetimedb::reducer]
pub fn submit_firearm_reload(ctx: &ReducerContext) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_firearm_reload blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if player_vitals::is_player_dead(ctx, id) {
        return;
    }
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    let Some(weapon_def_id) = crate::combat_stub::active_hotbar_item_def_id(ctx, id) else {
        return;
    };
    if !is_ranged_weapon(&weapon_def_id) {
        return;
    }

    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    try_finish_reload(ctx, id, now_us);
    ensure_chamber_weapon_synced(ctx, id, &weapon_def_id);

    let Some(mut chamber) = ctx.db.player_firearm_chamber().identity().find(&id) else {
        return;
    };
    if is_reload_in_progress(&chamber, now_us) {
        return;
    }

    let cap = chamber_capacity_for_weapon(&weapon_def_id);
    if chamber.chamber_count >= cap {
        return;
    }

    let ammo_def = ammo_def_for_weapon(&weapon_def_id).expect("validated");
    if count_carried_ammo(ctx, id, ammo_def) == 0 {
        return;
    }

    let duration = reload_duration_micros_for_weapon(&weapon_def_id);
    if duration <= 0 {
        return;
    }

    chamber.reload_complete_micros = now_us + duration;
    ctx.db.player_firearm_chamber().identity().update(chamber);

    world_sound::emit_firearm_reload_at(
        ctx,
        pose.x,
        pose.y + 1.02,
        pose.z,
        id,
        firearm_reload_variation(&weapon_def_id),
    );
}

/// Complete timed reloads whose deadline has passed (called from the physics schedule).
pub fn tick_firearm_reloads(ctx: &ReducerContext) {
    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let due: Vec<Identity> = ctx
        .db
        .player_firearm_chamber()
        .iter()
        .filter(|row| row.reload_complete_micros > 0 && now_us >= row.reload_complete_micros)
        .map(|row| row.identity)
        .collect();
    for id in due {
        try_finish_reload(ctx, id, now_us);
    }
}

#[cfg(test)]
mod chamber_tests {
    use super::*;

    #[test]
    fn chamber_capacities_match_catalog_weapons() {
        assert_eq!(
            chamber_capacity_for_weapon("pistol"),
            PISTOL_CHAMBER_CAPACITY
        );
        assert_eq!(
            chamber_capacity_for_weapon("shotgun-coach"),
            SHOTGUN_CHAMBER_CAPACITY
        );
        assert_eq!(chamber_capacity_for_weapon("crowbar"), 0);
    }

    #[test]
    fn reload_durations_are_weapon_specific() {
        assert_eq!(
            reload_duration_micros_for_weapon("pistol"),
            RELOAD_PISTOL_MICROS
        );
        assert_eq!(
            reload_duration_micros_for_weapon("shotgun-coach"),
            RELOAD_SHOTGUN_MICROS
        );
    }
}

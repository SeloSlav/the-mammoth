//! SpaceTimeDB module — persistence + **trusted-client locomotion** (solo); elevators/apartments/etc.
//! Run `pnpm client:generate` from the repo root to refresh TypeScript bindings.
//!
//! Server-side locomotion integration is off for solo; `elevator` kinematics, stair overlay helpers,
//! and `movement` input bitmasks still compile as client-synced anchors for future authority.
#![allow(dead_code)]

mod balcony_grow_op;
mod accounts;
mod apartment_door;
mod apartment_interior_anchors;
mod apartment_stash_location_match;
mod apartment_stash_rules;
mod apartments;
mod auth;
mod combat_stub;
mod crafting;
mod dropped_item;
mod elevator;
mod elevator_layout;
mod feature_flags;
mod firearm;
mod generated_apartment_doors;
mod generated_collision_solids;
mod generated_walk_surfaces;
mod hitscan;
mod inventory;
mod inventory_models;
mod items_catalog;
mod kinematic_support;
mod loadout;
mod melee_turn;
mod movement;
mod player_vitals;
mod pose;
mod spawn_routing;
mod stair_runtime_overlay;
mod water_container;
mod world_sound;

use crate::movement::player_input;
use crate::pose::player_pose;
use accounts::{user, User};
use spacetimedb::{ReducerContext, Table};

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    log::info!("mammoth-module initialized");
    elevator::seed_elevators(ctx);
    apartment_door::seed_apartment_doors(ctx);
    apartments::seed_apartment_units(ctx);
    apartment_door::sync_residential_unit_door_band_presentations(ctx);
    dropped_item::seed_world_loot_spawns(ctx);
    dropped_item::start_world_loot_refresh_schedule(ctx);
    movement::start_physics_schedule(ctx);
    player_vitals::start_player_vitals_schedule(ctx);
    world_sound::start_cleanup_schedule(ctx);
    dropped_item::start_dropped_item_cleanup_schedule(ctx);
    crafting::start_craft_queue_tick_schedule(ctx);
    crafting::start_hud_toast_cleanup_schedule(ctx);
    water_container::start_apartment_water_tank_schedule(ctx);
    balcony_grow_op::start_balcony_grow_schedule(ctx);
}

/// Ensure `user`, `player_pose`, and `player_input` rows exist.
#[spacetimedb::reducer(client_connected)]
pub fn on_connect(ctx: &ReducerContext) {
    let id = ctx.sender();
    if ctx.db.user().identity().find(&id).is_none() {
        let _ = ctx.db.user().insert(User {
            identity: id,
            username: None,
            avatar_body: 0,
        });
    }
    dropped_item::ensure_world_loot_spawns(ctx);
    elevator::seed_elevator_landing_doors(ctx);
    apartment_door::seed_apartment_doors(ctx);
    apartments::seed_apartment_units(ctx);
    apartment_door::sync_residential_unit_door_band_presentations(ctx);
    apartments::ensure_player_home_apartment(ctx, id);
    apartments::lock_owned_residential_doors(ctx, id);
    pose::ensure_player_pose_row(ctx, id);
    movement::ensure_player_input_row(ctx, id, 0.0);
    world_sound::ensure_player_audio_rows(ctx, id);
    firearm::ensure_player_firearm_cooldown_row(ctx, id);
    player_vitals::ensure_player_vitals_row(ctx, id);
    inventory::ensure_starter_loadout(ctx, id);
    inventory::ensure_starter_footlocker_grow_op(ctx, id);
    inventory::ensure_starter_fridge(ctx, id);
    water_container::backfill_water_bottle_fill_rows(ctx);
    apartments::ensure_starter_apartment_water_tank(ctx, id);
    balcony_grow_op::ensure_balcony_grow_for_owner(ctx, id);
    loadout::ensure_player_active_hotbar_row(ctx, id);
}

#[spacetimedb::reducer(client_disconnected)]
pub fn on_disconnect(_ctx: &ReducerContext) {}

/// First screen: validate and store display name (letters, digits, `_`, `-` only).
#[spacetimedb::reducer]
pub fn set_username(ctx: &ReducerContext, name: String) {
    if let Err(msg) = auth::is_valid_username(&name) {
        log::warn!("set_username rejected: {msg}");
        return;
    }
    let id = ctx.sender();
    let Some(mut row) = ctx.db.user().identity().find(&id) else {
        log::error!("set_username: missing user row for {id}");
        return;
    };
    row.username = Some(name);
    ctx.db.user().identity().update(row);
}

/// Male (`0`) or female (`1`) player body — used by client presentation / profile gate.
#[spacetimedb::reducer]
pub fn set_avatar_body(ctx: &ReducerContext, body: u8) {
    if body != 0 && body != 1 {
        log::warn!("set_avatar_body rejected: invalid body {body}");
        return;
    }
    let id = ctx.sender();
    let Some(mut row) = ctx.db.user().identity().find(&id) else {
        log::error!("set_avatar_body: missing user row for {id}");
        return;
    };
    row.avatar_body = body;
    ctx.db.user().identity().update(row);
}

/// Example gated reducer — extend for claim apartment, etc.
#[spacetimedb::reducer]
pub fn ping_world(ctx: &ReducerContext) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::info!("ping_world blocked: {e}");
        return;
    }
    let u = ctx.db.user().identity().find(&ctx.sender()).unwrap();
    log::info!("ping_world ok for {}", auth::display_name_for(&u));
}

#[spacetimedb::reducer]
pub fn respawn_player(ctx: &ReducerContext, _mode: u8) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("respawn_player blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if !player_vitals::is_player_dead(ctx, id) {
        return;
    }
    let prev_pose = ctx.db.player_pose().identity().find(&id);
    let base_seq = prev_pose.map(|p| p.seq).unwrap_or(0);
    let in_seq = ctx
        .db
        .player_input()
        .identity()
        .find(&id)
        .map(|i| i.intent_seq)
        .unwrap_or(0);

    // Death recovery is apartment-first whenever the player has a claimed unit (bed_pose path).
    let bed_pose = apartments::spawn_pose_owned_bed(ctx, id);
    let mut sp = if let Some(bed) = bed_pose {
        apartments::lock_owned_residential_doors(ctx, id);
        bed
    } else {
        spawn_routing::random_public_spawn_pose(ctx, id)
    };
    // Solo client may have advanced `intent_seq` while dead (snapshots rejected). Jump `pose.seq`
    // past those so the first live snapshot cannot stomp the spawn pose.
    sp.seq = base_seq.max(in_seq).saturating_add(1);

    let yaw = sp.yaw;
    ctx.db.player_pose().identity().update(sp);
    movement::reset_player_input_row(ctx, id, yaw);
    inventory::reset_player_loadout_for_respawn(ctx, id);
    loadout::reset_player_active_hotbar_slot_to_first(ctx, id);
    player_vitals::reset_player_vitals_for_respawn(ctx, id);
    world_sound::reset_player_melee_cooldown_row(ctx, id);
}

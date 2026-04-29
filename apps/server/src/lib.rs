//! SpaceTimeDB module — live persistence (presence, auth, intent-driven movement, …).
//! Run `pnpm client:generate` from the repo root to refresh TypeScript bindings.

mod accounts;
mod apartment_door;
mod apartment_interior_anchors;
mod apartments;
mod auth;
mod character_controller;
mod chat;
mod combat_stub;
mod dropped_item;
mod elevator;
mod elevator_layout;
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
mod stair_opening_collision;
mod stair_runtime_overlay;
mod world_sound;

use crate::pose::player_pose;
use accounts::{user, User};
use spacetimedb::{ReducerContext, Table};

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    log::info!("mammoth-module initialized");
    elevator::seed_elevators(ctx);
    apartment_door::seed_apartment_doors(ctx);
    apartments::seed_apartment_units(ctx);
    apartments::open_unclaimed_residential_doors(ctx);
    dropped_item::seed_world_loot_spawns(ctx);
    dropped_item::start_world_loot_refresh_schedule(ctx);
    movement::start_physics_schedule(ctx);
    player_vitals::start_player_vitals_schedule(ctx);
    world_sound::start_cleanup_schedule(ctx);
    dropped_item::start_dropped_item_cleanup_schedule(ctx);
}

/// Ensure `user`, `player_pose`, and `player_input` rows exist.
#[spacetimedb::reducer(client_connected)]
pub fn on_connect(ctx: &ReducerContext) {
    let id = ctx.sender();
    if ctx.db.user().identity().find(&id).is_none() {
        let _ = ctx.db.user().insert(User {
            identity: id,
            username: None,
        });
    }
    pose::ensure_player_pose_row(ctx, id);
    movement::ensure_player_input_row(ctx, id, 0.0);
    elevator::seed_elevator_landing_doors(ctx);
    apartment_door::seed_apartment_doors(ctx);
    world_sound::ensure_player_audio_rows(ctx, id);
    firearm::ensure_player_firearm_cooldown_row(ctx, id);
    player_vitals::ensure_player_vitals_row(ctx, id);
    inventory::ensure_starter_loadout(ctx, id);
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
pub fn respawn_player(ctx: &ReducerContext, mode: u8) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("respawn_player blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if !player_vitals::is_player_dead(ctx, id) {
        return;
    }
    let bed_pose = if mode == 1 {
        apartments::spawn_pose_owned_bed(ctx, id)
    } else {
        None
    };
    let sp = if let Some(bed) = bed_pose {
        apartments::lock_owned_residential_doors(ctx, id);
        bed
    } else {
        spawn_routing::random_public_spawn_pose(ctx, id)
    };
    let yaw = sp.yaw;
    ctx.db.player_pose().identity().update(sp);
    movement::reset_player_input_row(ctx, id, yaw);
    player_vitals::reset_player_vitals_for_respawn(ctx, id);
    world_sound::reset_player_melee_cooldown_row(ctx, id);
}

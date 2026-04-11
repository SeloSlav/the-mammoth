//! SpaceTimeDB module — live persistence (presence, auth, intent-driven movement, …).
//! Run `pnpm client:generate` from the repo root to refresh TypeScript bindings.

mod accounts;
mod auth;
mod movement;
mod pose;

use spacetimedb::{ReducerContext, Table};
use accounts::{user, User};
use pose::{player_pose, PlayerPose};

#[spacetimedb::reducer(init)]
pub fn init(ctx: &ReducerContext) {
    log::info!("mammoth-module initialized");
    movement::start_physics_schedule(ctx);
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
    if ctx.db.player_pose().identity().find(&id).is_none() {
        let _ = ctx.db.player_pose().insert(PlayerPose {
            identity: id,
            x: 0.0,
            y: 1.0,
            z: 6.0,
            yaw: 0.0,
            seq: 0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            grounded: 1,
        });
    }
    movement::ensure_player_input_row(ctx, id, 0.0);
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

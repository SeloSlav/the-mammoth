//! SpaceTimeDB module — live persistence (presence, auth, player poses, …).
//! Run `pnpm client:generate` from the repo root to refresh TypeScript bindings.

mod accounts;
mod auth;
mod pose;

use spacetimedb::{ReducerContext, Table};
use accounts::{user, User};
use pose::{player_pose, PlayerPose};

#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    log::info!("mammoth-module initialized");
}

/// Ensure `user` and `player_pose` rows exist (pose is used after username gate for movement).
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
        });
    }
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

/// Client-authoritative pose with light server-side clamping (anti-grief / glitch).
#[spacetimedb::reducer]
pub fn update_player_pose(ctx: &ReducerContext, seq: u64, x: f32, y: f32, z: f32, yaw: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("update_player_pose blocked: {e}");
        return;
    }
    let id = ctx.sender();
    let Some(prev) = ctx.db.player_pose().identity().find(&id) else {
        log::warn!("update_player_pose: no row for {id}");
        return;
    };
    if seq <= prev.seq {
        return;
    }
    let (cx, cy, cz) = pose::clamp_pose_step(&prev, x, y, z);
    ctx.db.player_pose().identity().update(PlayerPose {
        identity: id,
        x: cx,
        y: cy,
        z: cz,
        yaw,
        seq,
    });
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

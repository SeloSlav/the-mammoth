//! Authoritative player transform — updated by the movement tick from intents + sim.

use spacetimedb::{Identity, ReducerContext, Table};

#[spacetimedb::table(public, accessor = player_pose)]
pub struct PlayerPose {
    #[primary_key]
    pub identity: Identity,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Body / look yaw (from latest intent).
    pub yaw: f32,
    /// Last `submit_move_intent` `intent_seq` applied by the server tick.
    pub seq: u64,
    pub vel_x: f32,
    pub vel_y: f32,
    pub vel_z: f32,
    /// 1 = grounded, 0 = airborne.
    pub grounded: u8,
}

pub const PLAYER_SPAWN_X: f32 = 0.0;
pub const PLAYER_SPAWN_Y: f32 = 1.35;
pub const PLAYER_SPAWN_Z: f32 = 0.0;
pub const PLAYER_SPAWN_YAW: f32 = 0.0;

pub fn spawn_pose(identity: Identity) -> PlayerPose {
    PlayerPose {
        identity,
        x: PLAYER_SPAWN_X,
        y: PLAYER_SPAWN_Y,
        z: PLAYER_SPAWN_Z,
        yaw: PLAYER_SPAWN_YAW,
        seq: 0,
        vel_x: 0.0,
        vel_y: 0.0,
        vel_z: 0.0,
        grounded: 1,
    }
}

pub fn ensure_player_pose_row(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_pose().identity().find(&id).is_none() {
        let _ = ctx.db.player_pose().insert(spawn_pose(id));
    }
}

pub fn reset_player_pose_to_spawn(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_pose().identity().find(&id).is_some() {
        ctx.db.player_pose().identity().update(spawn_pose(id));
    } else {
        let _ = ctx.db.player_pose().insert(spawn_pose(id));
    }
}

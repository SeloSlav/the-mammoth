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

pub fn ensure_player_pose_row(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_pose().identity().find(&id).is_none() {
        let sp = crate::spawn_routing::random_public_spawn_pose(ctx, id);
        let _ = ctx.db.player_pose().insert(sp);
    }
}

//! Authoritative player transform — updated by the movement tick from intents + sim.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments;

#[spacetimedb::table(public, accessor = player_pose)]
pub struct PlayerPose {
    #[primary_key]
    pub identity: Identity,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Body / look yaw (from latest intent).
    pub yaw: f32,
    /// Monotonic locomotion snapshot id (`submit_player_locomotion_snapshot`); echoed back replicated.
    pub seq: u64,
    pub vel_x: f32,
    pub vel_y: f32,
    pub vel_z: f32,
    /// 1 = grounded, 0 = airborne.
    pub grounded: u8,
    /// `submit_melee_swing` increments when a swing is authored (presentation / remote viewers).
    pub melee_presentation_seq: u32,
    /// `submit_firearm_shot` increments on each discharged shot accepted by ammo + cooldown gates.
    pub firearm_presentation_seq: u32,
}

pub fn bump_melee_presentation_seq(ctx: &ReducerContext, id: Identity) {
    let Some(mut pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    pose.melee_presentation_seq = pose.melee_presentation_seq.wrapping_add(1);
    ctx.db.player_pose().identity().update(pose);
}

pub fn bump_firearm_presentation_seq(ctx: &ReducerContext, id: Identity) {
    let Some(mut pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    pose.firearm_presentation_seq = pose.firearm_presentation_seq.wrapping_add(1);
    ctx.db.player_pose().identity().update(pose);
}

pub fn ensure_player_pose_row(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_pose().identity().find(&id).is_none() {
        let sp = apartments::join_pose_from_owned_bed(ctx, id).unwrap_or_else(|| {
            crate::spawn_routing::random_public_spawn_pose(ctx, id)
        });
        let _ = ctx.db.player_pose().insert(sp);
    }
}

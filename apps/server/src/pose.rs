//! Authoritative player transform for multiplayer (first-person prototype).

use spacetimedb::Identity;

#[spacetimedb::table(public, accessor = player_pose)]
pub struct PlayerPose {
    #[primary_key]
    pub identity: Identity,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub yaw: f32,
    pub seq: u64,
}

/// Max horizontal step per accepted update (~7 m/s at ~20 Hz + margin).
const MAX_STEP_XZ: f32 = 0.4;
const MAX_STEP_Y: f32 = 0.45;
const MIN_Y: f32 = 0.35;
const MAX_Y: f32 = 64.0;

pub(crate) fn clamp_pose_step(prev: &PlayerPose, x: f32, y: f32, z: f32) -> (f32, f32, f32) {
    let mut dx = x - prev.x;
    let mut dy = y - prev.y;
    let mut dz = z - prev.z;
    let horiz = (dx * dx + dz * dz).sqrt();
    if horiz > MAX_STEP_XZ && horiz > 1e-6 {
        let s = MAX_STEP_XZ / horiz;
        dx *= s;
        dz *= s;
    }
    if dy.abs() > MAX_STEP_Y {
        dy = dy.signum() * MAX_STEP_Y;
    }
    let nx = prev.x + dx;
    let ny = (prev.y + dy).clamp(MIN_Y, MAX_Y);
    let nz = prev.z + dz;
    (nx, ny, nz)
}

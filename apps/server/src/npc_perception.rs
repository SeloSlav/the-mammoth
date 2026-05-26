//! Archetype-agnostic NPC idle→aggro perception (range + forward vision cone + crouch modifier).

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NpcPerceptionProfile {
    pub aggro_range_m: f32,
    pub vision_half_angle_rad: f32,
    pub crouch_detection_range_mul: f32,
}

pub fn npc_detection_range_m(profile: &NpcPerceptionProfile, player_crouching: bool) -> f32 {
    if player_crouching {
        profile.aggro_range_m * profile.crouch_detection_range_mul
    } else {
        profile.aggro_range_m
    }
}

pub fn npc_in_vision_cone(
    profile: &NpcPerceptionProfile,
    npc_yaw: f32,
    to_player_x: f32,
    to_player_z: f32,
    dist_sq: f32,
) -> bool {
    if dist_sq < 1e-8 {
        return true;
    }
    let inv_dist = 1.0 / dist_sq.sqrt();
    let dir_x = to_player_x * inv_dist;
    let dir_z = to_player_z * inv_dist;
    let fwd_x = npc_yaw.sin();
    let fwd_z = npc_yaw.cos();
    let dot = dir_x * fwd_x + dir_z * fwd_z;
    dot >= profile.vision_half_angle_rad.cos()
}

pub fn npc_player_detectable(
    profile: &NpcPerceptionProfile,
    npc_yaw: f32,
    to_player_x: f32,
    to_player_z: f32,
    dist_sq: f32,
    player_crouching: bool,
) -> bool {
    let range_m = npc_detection_range_m(profile, player_crouching);
    if dist_sq > range_m * range_m {
        return false;
    }
    npc_in_vision_cone(profile, npc_yaw, to_player_x, to_player_z, dist_sq)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_profile() -> NpcPerceptionProfile {
        NpcPerceptionProfile {
            aggro_range_m: 6.5,
            vision_half_angle_rad: 60_f32.to_radians(),
            crouch_detection_range_mul: 0.55,
        }
    }

    #[test]
    fn detects_player_in_front_within_range() {
        let profile = test_profile();
        assert!(npc_player_detectable(&profile, 0.0, 0.0, 3.0, 9.0, false));
    }

    #[test]
    fn ignores_player_behind() {
        let profile = test_profile();
        assert!(!npc_player_detectable(&profile, 0.0, 0.0, -3.0, 9.0, false));
    }

    #[test]
    fn rejects_player_outside_vision_cone() {
        let profile = test_profile();
        let z = 3.0;
        let x = z * (68_f32.to_radians()).tan();
        assert!(!npc_player_detectable(
            &profile,
            0.0,
            x,
            z,
            x * x + z * z,
            false,
        ));
    }

    #[test]
    fn crouch_reduces_detection_range() {
        let profile = test_profile();
        let dist = (profile.aggro_range_m
            + profile.aggro_range_m * profile.crouch_detection_range_mul)
            * 0.5;
        let dist_sq = dist * dist;
        assert!(npc_player_detectable(
            &profile, 0.0, 0.0, dist, dist_sq, false
        ));
        assert!(!npc_player_detectable(
            &profile, 0.0, 0.0, dist, dist_sq, true
        ));
    }
}

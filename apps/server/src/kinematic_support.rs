use crate::pose::PlayerPose;

pub struct KinematicSupportSurface {
    pub top_y: f32,
    pub vertical_velocity_mps: f32,
}

pub struct KinematicAttachment {
    pub support_y: f32,
    pub clamp_bounds_xz: Option<(f32, f32, f32, f32)>,
}

#[inline]
pub fn merge_support_top(base_top: f32, surface: Option<&KinematicSupportSurface>) -> f32 {
    let Some(surface) = surface else {
        return base_top;
    };
    if base_top.is_nan() {
        surface.top_y
    } else {
        base_top.max(surface.top_y)
    }
}

#[inline]
pub fn support_vertical_velocity_mps(
    base_top: f32,
    surface: Option<&KinematicSupportSurface>,
    win_epsilon: f32,
) -> f32 {
    let Some(surface) = surface else {
        return 0.0;
    };
    let merged = merge_support_top(base_top, Some(surface));
    if (merged - surface.top_y).abs() <= win_epsilon {
        surface.vertical_velocity_mps
    } else {
        0.0
    }
}

pub fn snap_attached_feet_to_support(
    pose: &mut PlayerPose,
    attachment: Option<&KinematicAttachment>,
    skip_attach_upward_vy_mps: f32,
) -> bool {
    if pose.vel_y > skip_attach_upward_vy_mps {
        return false;
    }
    let Some(attachment) = attachment else {
        return false;
    };
    pose.y = attachment.support_y;
    pose.vel_y = 0.0;
    pose.grounded = 1;
    true
}

pub fn clamp_attached_body_xz(
    pose: &mut PlayerPose,
    attachment: Option<&KinematicAttachment>,
) -> bool {
    let Some(attachment) = attachment else {
        return false;
    };
    let Some((xmin, xmax, zmin, zmax)) = attachment.clamp_bounds_xz else {
        return false;
    };
    let px = pose.x;
    let pz = pose.z;
    pose.x = pose.x.clamp(xmin, xmax);
    pose.z = pose.z.clamp(zmin, zmax);
    if pose.x > px && pose.vel_x < 0.0 {
        pose.vel_x = 0.0;
    }
    if pose.x < px && pose.vel_x > 0.0 {
        pose.vel_x = 0.0;
    }
    if pose.z > pz && pose.vel_z < 0.0 {
        pose.vel_z = 0.0;
    }
    if pose.z < pz && pose.vel_z > 0.0 {
        pose.vel_z = 0.0;
    }
    pose.x != px || pose.z != pz
}

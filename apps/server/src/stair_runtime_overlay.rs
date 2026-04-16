#[derive(Clone, Copy)]
pub enum RuntimeStairSupportSurface {
    Flat {
        min_x: f32,
        max_x: f32,
        min_z: f32,
        max_z: f32,
        top_y: f32,
    },
    Slope {
        axis: u8,
        min_x: f32,
        max_x: f32,
        min_z: f32,
        max_z: f32,
        along_min: f32,
        along_max: f32,
        y_at_along_min: f32,
        y_at_along_max: f32,
    },
}

include!(concat!(env!("OUT_DIR"), "/stair_runtime_overlay.rs"));

#[inline]
fn overlaps(min_a: [f32; 3], max_a: [f32; 3], min_b: [f32; 3], max_b: [f32; 3]) -> bool {
    !(max_a[0] <= min_b[0]
        || min_a[0] >= max_b[0]
        || max_a[1] <= min_b[1]
        || min_a[1] >= max_b[1]
        || max_a[2] <= min_b[2]
        || min_a[2] >= max_b[2])
}

pub fn suppress_static_blocker(min: [f32; 3], max: [f32; 3]) -> bool {
    STAIR_RUNTIME_BLOCKER_SUPPRESS_MASKS
        .iter()
        .any(|(mask_min, mask_max)| overlaps(min, max, *mask_min, *mask_max))
}

pub fn append_runtime_replacement_blockers(
    x0: f32,
    x1: f32,
    z0: f32,
    z1: f32,
    feet_y: f32,
    body_h: f32,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    let body_y0 = feet_y;
    let body_y1 = feet_y + body_h;
    for (mn, mx) in STAIR_RUNTIME_BLOCKER_REPLACEMENTS {
        if x1 < mn[0] || x0 > mx[0] || z1 < mn[2] || z0 > mx[2] {
            continue;
        }
        if body_y1 <= mn[1] + 1e-4 || body_y0 >= mx[1] - 1e-4 {
            continue;
        }
        out.push((*mn, *mx));
    }
}

pub fn suppress_static_walk_surface(min: [f32; 3], max: [f32; 3]) -> bool {
    STAIR_RUNTIME_WALK_SUPPRESS_MASKS
        .iter()
        .any(|(mask_min, mask_max)| overlaps(min, max, *mask_min, *mask_max))
}

pub fn sample_runtime_stair_support_top_y(
    x: f32,
    z: f32,
    probe_top_y: f32,
    foot_radius_xz: f32,
    step_up_margin: f32,
    probe_dy: f32,
) -> f32 {
    let feet_y = probe_top_y - probe_dy;
    let fx0 = x - foot_radius_xz;
    let fx1 = x + foot_radius_xz;
    let fz0 = z - foot_radius_xz;
    let fz1 = z + foot_radius_xz;
    let mut best = f32::NAN;

    for surface in STAIR_RUNTIME_SUPPORT_SURFACES {
        let top = match *surface {
            RuntimeStairSupportSurface::Flat {
                min_x,
                max_x,
                min_z,
                max_z,
                top_y,
            } => {
                if fx1 < min_x || fx0 > max_x || fz1 < min_z || fz0 > max_z {
                    continue;
                }
                top_y
            }
            RuntimeStairSupportSurface::Slope {
                axis,
                min_x,
                max_x,
                min_z,
                max_z,
                along_min,
                along_max,
                y_at_along_min,
                y_at_along_max,
            } => {
                if fx1 < min_x || fx0 > max_x || fz1 < min_z || fz0 > max_z {
                    continue;
                }
                let (overlap_min, overlap_max) = if axis == b'x' {
                    (fx0.max(min_x), fx1.min(max_x))
                } else {
                    (fz0.max(min_z), fz1.min(max_z))
                };
                if overlap_max < overlap_min {
                    continue;
                }
                let span = (along_max - along_min).max(1e-6);
                let y0 = y_at_along_min
                    + ((overlap_min - along_min) / span) * (y_at_along_max - y_at_along_min);
                let y1 = y_at_along_min
                    + ((overlap_max - along_min) / span) * (y_at_along_max - y_at_along_min);
                y0.max(y1)
            }
        };
        if top <= feet_y + step_up_margin {
            best = if best.is_nan() { top } else { best.max(top) };
        }
    }

    best
}

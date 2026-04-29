//! Wardrobe + footlocker XZ — **fixed fractional depth** along the door spine every unit, mirrored
//! laterally so props aren’t on the hinge strip. Matches seed in `seed_apartment_units`.

const APARTMENT_INTERIOR_MIN_DEPTH_FROM_DOOR_M: f32 = 2.35;
const WALL_MARGIN_M: f32 = 0.42;
const LATERAL_SEP_M: f32 = 1.08;
/// Same relative depth into every apartment (fraction of usable spine length past `depth_near`).
const SPINE_DEPTH_FRAC: f32 = 0.42;

#[inline]
fn clamp(v: f32, lo: f32, hi: f32) -> f32 {
    v.max(lo).min(hi)
}

/// Wardrobe on one side of the unit, footlocker on the opposite — **same spine depth** via
/// `SPINE_DEPTH_FRAC`, clamped to `mn_*` / `mx_*`.
pub(crate) fn wardrobe_and_footlocker_xz_for_unit_seed(
    mn_x: f32,
    mx_x: f32,
    mn_z: f32,
    mx_z: f32,
    hinge_x: f32,
    hinge_z: f32,
    face: u8,
) -> ([f32; 2], [f32; 2]) {
    let max_depth: f32;
    let depth_at: Box<dyn Fn(f32) -> (f32, f32)>;
    let perp_x: f32;
    let perp_z: f32;

    match face {
        3 => {
            max_depth = hinge_x - mn_x - WALL_MARGIN_M;
            depth_at = Box::new(move |depth| (hinge_x - depth, hinge_z));
            perp_x = 0.0;
            perp_z = 1.0;
        }
        2 => {
            max_depth = mx_x - hinge_x - WALL_MARGIN_M;
            depth_at = Box::new(move |depth| (hinge_x + depth, hinge_z));
            perp_x = 0.0;
            perp_z = 1.0;
        }
        0 => {
            max_depth = hinge_z - mn_z - WALL_MARGIN_M;
            depth_at = Box::new(move |depth| (hinge_x, hinge_z - depth));
            perp_x = 1.0;
            perp_z = 0.0;
        }
        1 => {
            max_depth = mx_z - hinge_z - WALL_MARGIN_M;
            depth_at = Box::new(move |depth| (hinge_x, hinge_z + depth));
            perp_x = 1.0;
            perp_z = 0.0;
        }
        _ => {
            max_depth = hinge_x - mn_x - WALL_MARGIN_M;
            depth_at = Box::new(move |depth| (hinge_x - depth, hinge_z));
            perp_x = 0.0;
            perp_z = 1.0;
        }
    }

    let depth_near = APARTMENT_INTERIOR_MIN_DEPTH_FROM_DOOR_M + WALL_MARGIN_M;
    let max_depth_clamped = (max_depth - WALL_MARGIN_M * 0.5).max(depth_near);
    let depth_span = (max_depth_clamped - depth_near).max(0.05);
    let depth_clamped =
        clamp(depth_near + SPINE_DEPTH_FRAC * depth_span, depth_near, max_depth_clamped);
    let base = depth_at(depth_clamped);

    let z_span = mx_z - mn_z;
    let x_span = mx_x - mn_x;
    let lateral_raw = if face == 3 || face == 2 {
        LATERAL_SEP_M.min(z_span * 0.5 - WALL_MARGIN_M)
    } else {
        LATERAL_SEP_M.min(x_span * 0.5 - WALL_MARGIN_M)
    };
    let lateral = lateral_raw.max(0.42);

    let mut wx = base.0 + perp_x * lateral;
    let mut wz = base.1 + perp_z * lateral;
    wx = clamp(wx, mn_x + WALL_MARGIN_M, mx_x - WALL_MARGIN_M);
    wz = clamp(wz, mn_z + WALL_MARGIN_M, mx_z - WALL_MARGIN_M);

    let mut fx = base.0 - perp_x * lateral;
    let mut fz = base.1 - perp_z * lateral;
    fx = clamp(fx, mn_x + WALL_MARGIN_M, mx_x - WALL_MARGIN_M);
    fz = clamp(fz, mn_z + WALL_MARGIN_M, mx_z - WALL_MARGIN_M);

    ([wx, wz], [fx, fz])
}

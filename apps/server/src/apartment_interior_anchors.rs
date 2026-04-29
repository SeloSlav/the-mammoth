//! Wardrobe / footlocker / bed placement for apartment shells.
//!
//! **`unit_e_*`/`unit_w_*` residential flats** (`SwingDoorFace::W`/`E`): bed headboard flush on the wall
//! **opposite** the exterior door hinge strip, mattress axis points along the doorway ray; footlocker
//! sits centered just past the **foot edge** of the bed toward the doorway; wardrobe is placed
//! flush on the **long corridor-parallel wall** that does **not** host the doorway strip (south vs
//! north picked from hinge side vs centroid), swept **along X ~2.1 m inward** from that back-corner
//! wall (`mn_x`/`mx_x`), so it clears the bedside without floating mid-room.

use crate::apartment_door::SwingDoorFace;

const APARTMENT_INTERIOR_MIN_DEPTH_FROM_DOOR_M: f32 = 2.35;
const WALL_MARGIN_M: f32 = 0.42;
const LATERAL_SEP_M: f32 = 1.08;
/// Same relative depth into every apartment (fraction of usable spine length past `depth_near`).
const SPINE_DEPTH_FRAC: f32 = 0.42;

// --- East/West doorway residential flats (canonical layout) ---
const BED_HEADBOARD_GAP_M: f32 = 0.088;
const BED_HALF_LENGTH_M: f32 = 1.02;
const FOOT_GAP_BEYOND_MATTRESS_M: f32 = 0.16;
const FOOTLOCKER_TAIL_HALF_M: f32 = 0.34;
/// Keep props away from shell edges — matches client furniture merge padding.
const HULL_EDGE_M: f32 = 0.56;
const WARD_FLUSH_LONG_WALL_INSET_M: f32 = 0.44;
const WARD_CORNER_DEPTH_ALONG_ROOM_AXIS_M: f32 = 2.12;

#[inline]
fn clamp(v: f32, lo: f32, hi: f32) -> f32 {
    v.max(lo).min(hi)
}

#[inline]
fn unit2(dx: f32, dz: f32) -> (f32, f32) {
    let l = (dx * dx + dz * dz).sqrt().max(1e-5);
    (dx / l, dz / l)
}

/// Bed / footlocker / wardrobe for **SwingDoorFace `W|E`** units (east/west hinged corridor doors).
///
/// Authoritative XZ (+ bed yaw rad) seeded into `ApartmentUnit` on init.
pub(crate) struct EastWestInteriorFurnitureSeed {
    pub bed_x: f32,
    pub bed_z: f32,
    pub foot_x: f32,
    pub foot_z: f32,
    pub wardrobe_x: f32,
    pub wardrobe_z: f32,
    pub bed_yaw: f32,
}

pub(crate) fn east_west_interior_furniture_seed(
    mn: &[f32; 3],
    mx: &[f32; 3],
    hinge_x: f32,
    hinge_z: f32,
    face: SwingDoorFace,
) -> Option<EastWestInteriorFurnitureSeed> {
    if !matches!(face, SwingDoorFace::W | SwingDoorFace::E) {
        return None;
    }

    let cz = (mn[2] + mx[2]) * 0.5;
    let cz_f = clamp(cz, mn[2] + HULL_EDGE_M, mx[2] - HULL_EDGE_M);

    // Headboard midpoint on plane parallel to the hinge strip — small inset from drywall.
    let bx = match face {
        SwingDoorFace::W => mn[0] + BED_HEADBOARD_GAP_M,
        SwingDoorFace::E => mx[0] - BED_HEADBOARD_GAP_M,
        SwingDoorFace::N | SwingDoorFace::S => unreachable!("filtered above"),
    };

    // Feet / mattress longitudinal axis runs from headboard toward the hinge doorway.
    let (efx, efz) = unit2(hinge_x - bx, hinge_z - cz_f);

    let bed_half = BED_HALF_LENGTH_M;
    let foot_ray = bed_half + bed_half + FOOT_GAP_BEYOND_MATTRESS_M + FOOTLOCKER_TAIL_HALF_M;

    let mut bed_x = bx + efx * bed_half;
    let mut bed_z = cz_f + efz * bed_half;
    let mut foot_x = bx + efx * foot_ray;
    let mut foot_z = cz_f + efz * foot_ray;

    bed_x = clamp(bed_x, mn[0] + HULL_EDGE_M, mx[0] - HULL_EDGE_M);
    bed_z = clamp(bed_z, mn[2] + HULL_EDGE_M, mx[2] - HULL_EDGE_M);
    foot_x = clamp(foot_x, mn[0] + HULL_EDGE_M, mx[0] - HULL_EDGE_M);
    foot_z = clamp(foot_z, mn[2] + HULL_EDGE_M, mx[2] - HULL_EDGE_M);

    // Wardrobe hugs the corridor-parallel interior wall farthest from the door strip in Z …
    let wardrobe_z_raw = if hinge_z <= cz_f {
        mx[2] - WARD_FLUSH_LONG_WALL_INSET_M
    } else {
        mn[2] + WARD_FLUSH_LONG_WALL_INSET_M
    };

    // Spine offset along −X/+X opposite the corridor doorway so wardrobe clears the bedside.
    let mut wardrobe_x = match face {
        SwingDoorFace::W => mn[0] + WARD_CORNER_DEPTH_ALONG_ROOM_AXIS_M,
        SwingDoorFace::E => mx[0] - WARD_CORNER_DEPTH_ALONG_ROOM_AXIS_M,
        SwingDoorFace::N | SwingDoorFace::S => unreachable!("filtered above"),
    };
    wardrobe_x = clamp(wardrobe_x, mn[0] + HULL_EDGE_M, mx[0] - HULL_EDGE_M);

    let wardrobe_z_clamped =
        clamp(wardrobe_z_raw, mn[2] + HULL_EDGE_M, mx[2] - HULL_EDGE_M);

    // Match `{ forward_x, forward_z } = { -sin yaw, -cos yaw }` used by `movement` / `spawn_pose_owned_bed`.
    let bed_yaw = (-efx).atan2(-efz);

    Some(EastWestInteriorFurnitureSeed {
        bed_x,
        bed_z,
        foot_x,
        foot_z,
        wardrobe_x,
        wardrobe_z: wardrobe_z_clamped,
        bed_yaw,
    })
}

/// Wardrobe + footlocker — legacy spine placement for **`N`|`S`** (stair shafts, etc.).
/// Matches historical seed ordering when bed / foot weren't tied geometrically.
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

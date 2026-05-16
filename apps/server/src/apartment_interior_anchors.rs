//! Wardrobe / footlocker / bed placement for apartment shells.
//!
//! **`unit_e_*`/`unit_w_*`** (`SwingDoorFace::W`/`E`): bed + footlocker anchors are measured from
//! the hull **far wall** (away from the corridor hinge); footlock stays between bed and entryway.
//! Wardrobe stays door-adjacent but inset from the hinge edge so interact radii do not reach the corridor.
//! Z offsets are hull-centered with clamps.

use crate::apartment_door::SwingDoorFace;

const APARTMENT_INTERIOR_MIN_DEPTH_FROM_DOOR_M: f32 = 2.35;
const WALL_MARGIN_M: f32 = 0.42;
const LATERAL_SEP_M: f32 = 1.08;
/// Same relative depth into every apartment (fraction of usable spine length past `depth_near`).
const SPINE_DEPTH_FRAC: f32 = 0.42;

// --- East/West doorway residential flats (canonical layout) ---
/// Keep props away from shell edges — matches client furniture merge padding.
const PROP_WALL_GAP_M: f32 = 0.06;
/// Bed mesh half-extents along local bed axes (matches prop GLB authoring).
pub(crate) const BED_HALF_X_M: f32 = 1.09;
pub(crate) const BED_HALF_Z_M: f32 = 0.61;
const FOOTLOCKER_HALF_X_M: f32 = 0.43;
const WARDROBE_HALF_X_M: f32 = 0.26;
const Z_EDGE_M: f32 = BED_HALF_Z_M + PROP_WALL_GAP_M;
/// Distance from the exterior / window wall (hull X face) to bed center.
/// The rendered shell's glass sits inside this hull box; anchors must leave margin so GLB footprints
/// (and server interact columns) stay clearly inside the living volume.
const BED_CENTER_FROM_BACK_WALL_M: f32 = 5.15;
/// Footlocker stays between entryway and bed; keep it beyond the bed foot along the spine.
const FOOTLOCKER_CENTER_FROM_BACK_WALL_M: f32 = 6.75;
const BED_CENTER_Z_OFFSET_M: f32 = -1.08;
/// Door-adjacent wardrobe — pushed deeper so hallway poses cannot overlap the wardrobe interact disc.
const WARDROBE_CENTER_FROM_BACK_WALL_M: f32 = 1.38;
const WARDROBE_CENTER_Z_OFFSET_M: f32 = 2.34;
/// Clearance from hull edges for the starter stove anchor at the interior SW corner (`min X`, `min Z`).
const STOVE_CORNER_CLEARANCE_M: f32 = 0.38;

#[inline]
fn clamp(v: f32, lo: f32, hi: f32) -> f32 {
    v.max(lo).min(hi)
}

/// Interior **south-west** corner (`min X`, `min Z`) with shell clearance — replicated into `ApartmentUnit.stove_*`.
pub(crate) fn stove_corner_seed_xz(mn: &[f32; 3], mx: &[f32; 3]) -> (f32, f32) {
    let inset = PROP_WALL_GAP_M + STOVE_CORNER_CLEARANCE_M;
    let x = clamp(mn[0] + inset, mn[0] + inset, mx[0] - inset);
    let z = clamp(mn[2] + inset, mn[2] + inset, mx[2] - inset);
    (x, z)
}

/// Bed / footlocker / wardrobe / stove for **SwingDoorFace `W|E`** units (east/west hinged corridor doors).
///
/// Authoritative XZ (+ bed yaw rad) seeded into `ApartmentUnit` on init.
pub(crate) struct EastWestInteriorFurnitureSeed {
    pub bed_x: f32,
    pub bed_z: f32,
    pub foot_x: f32,
    pub foot_z: f32,
    pub wardrobe_x: f32,
    pub wardrobe_z: f32,
    pub stove_x: f32,
    pub stove_z: f32,
    pub bed_yaw: f32,
}

pub(crate) fn east_west_interior_furniture_seed(
    mn: &[f32; 3],
    mx: &[f32; 3],
    _hinge_x: f32,
    _hinge_z: f32,
    face: SwingDoorFace,
) -> Option<EastWestInteriorFurnitureSeed> {
    if !matches!(face, SwingDoorFace::W | SwingDoorFace::E) {
        return None;
    }

    let cz = (mn[2] + mx[2]) * 0.5;
    let z_lo = mn[2] + Z_EDGE_M;
    let z_hi = mx[2] - Z_EDGE_M;
    let bed_z = clamp(cz + BED_CENTER_Z_OFFSET_M, z_lo, z_hi);
    let foot_z = bed_z;
    let wardrobe_z = clamp(cz + WARDROBE_CENTER_Z_OFFSET_M, z_lo, z_hi);

    let (bed_x, foot_x, wardrobe_x, bed_yaw) = match face {
        // Door / corridor at low X (mn). Back wall at high X (mx). Bed + footlocker live deep, by mx.
        SwingDoorFace::W => (
            clamp(
                mx[0] - BED_CENTER_FROM_BACK_WALL_M,
                mn[0] + BED_HALF_X_M + PROP_WALL_GAP_M,
                mx[0] - BED_HALF_X_M - PROP_WALL_GAP_M,
            ),
            clamp(
                mx[0] - FOOTLOCKER_CENTER_FROM_BACK_WALL_M,
                mn[0] + FOOTLOCKER_HALF_X_M + PROP_WALL_GAP_M,
                mx[0] - FOOTLOCKER_HALF_X_M - PROP_WALL_GAP_M,
            ),
            clamp(
                mn[0] + WARDROBE_CENTER_FROM_BACK_WALL_M,
                mn[0] + WARDROBE_HALF_X_M + PROP_WALL_GAP_M,
                mx[0] - WARDROBE_HALF_X_M - PROP_WALL_GAP_M,
            ),
            std::f32::consts::FRAC_PI_2,
        ),
        // Back wall at low X (mn). Corridor at high X (mx). Wardrobe stays door-side toward mx (unchanged).
        SwingDoorFace::E => (
            clamp(
                mn[0] + BED_CENTER_FROM_BACK_WALL_M,
                mn[0] + BED_HALF_X_M + PROP_WALL_GAP_M,
                mx[0] - BED_HALF_X_M - PROP_WALL_GAP_M,
            ),
            clamp(
                mn[0] + FOOTLOCKER_CENTER_FROM_BACK_WALL_M,
                mn[0] + FOOTLOCKER_HALF_X_M + PROP_WALL_GAP_M,
                mx[0] - FOOTLOCKER_HALF_X_M - PROP_WALL_GAP_M,
            ),
            clamp(
                mx[0] - WARDROBE_CENTER_FROM_BACK_WALL_M,
                mn[0] + WARDROBE_HALF_X_M + PROP_WALL_GAP_M,
                mx[0] - WARDROBE_HALF_X_M - PROP_WALL_GAP_M,
            ),
            -std::f32::consts::FRAC_PI_2,
        ),
        SwingDoorFace::N | SwingDoorFace::S => unreachable!("filtered above"),
    };

    let (stove_x, stove_z) = stove_corner_seed_xz(mn, mx);

    Some(EastWestInteriorFurnitureSeed {
        bed_x,
        bed_z,
        foot_x,
        foot_z,
        wardrobe_x,
        wardrobe_z,
        stove_x,
        stove_z,
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
    let depth_clamped = clamp(
        depth_near + SPINE_DEPTH_FRAC * depth_span,
        depth_near,
        max_depth_clamped,
    );
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated_apartment_doors::APARTMENT_DOOR_TEMPLATE_SETS;

    const TEST_LEVEL: u32 = 2;
    const BUILDING_ORIGIN_Y: f32 = 0.0;
    const STOREY_SPACING_M: f32 = 3.16;
    const DEPTH: f32 = 13.0;
    const HALF_WIDTH: f32 = 3.3;
    const RESIDENTIAL_FAR_WALL_X_INSET_M: f32 = 1.38;
    const FOOTLOCKER_HALF_Z_M: f32 = 0.54;
    const WARDROBE_HALF_Z_M: f32 = 0.56;

    fn feet_world_y(level: u32, feet_y_offset: f32) -> f32 {
        BUILDING_ORIGIN_Y + (level.max(1) as f32 - 1.0) * STOREY_SPACING_M + feet_y_offset
    }

    fn test_bounds(
        face: SwingDoorFace,
        hinge_x: f32,
        hinge_z: f32,
        feet_y: f32,
    ) -> ([f32; 3], [f32; 3]) {
        let top_y = feet_y + 3.0;
        match face {
            SwingDoorFace::W => (
                [hinge_x + 0.08, feet_y - 0.06, hinge_z - HALF_WIDTH],
                [
                    hinge_x + DEPTH - RESIDENTIAL_FAR_WALL_X_INSET_M,
                    top_y,
                    hinge_z + HALF_WIDTH,
                ],
            ),
            SwingDoorFace::E => (
                [
                    hinge_x - DEPTH + RESIDENTIAL_FAR_WALL_X_INSET_M,
                    feet_y - 0.06,
                    hinge_z - HALF_WIDTH,
                ],
                [hinge_x - 0.08, top_y, hinge_z + HALF_WIDTH],
            ),
            _ => (
                [hinge_x - HALF_WIDTH, feet_y - 0.06, hinge_z - DEPTH],
                [hinge_x + HALF_WIDTH, top_y, hinge_z + HALF_WIDTH],
            ),
        }
    }

    fn assert_inside(label: &str, mn: &[f32; 3], mx: &[f32; 3], x: f32, z: f32) {
        assert!(
            x >= mn[0] + PROP_WALL_GAP_M && x <= mx[0] - PROP_WALL_GAP_M,
            "{label} x={x} outside [{}, {}]",
            mn[0] + PROP_WALL_GAP_M,
            mx[0] - PROP_WALL_GAP_M,
        );
        assert!(
            z >= mn[2] + PROP_WALL_GAP_M && z <= mx[2] - PROP_WALL_GAP_M,
            "{label} z={z} outside [{}, {}]",
            mn[2] + PROP_WALL_GAP_M,
            mx[2] - PROP_WALL_GAP_M,
        );
    }

    fn assert_footprint_inside(
        label: &str,
        mn: &[f32; 3],
        mx: &[f32; 3],
        x: f32,
        z: f32,
        half_x: f32,
        half_z: f32,
    ) {
        assert!(
            x - half_x >= mn[0] + PROP_WALL_GAP_M && x + half_x <= mx[0] - PROP_WALL_GAP_M,
            "{label} footprint x=[{}, {}] outside [{}, {}]",
            x - half_x,
            x + half_x,
            mn[0] + PROP_WALL_GAP_M,
            mx[0] - PROP_WALL_GAP_M,
        );
        assert!(
            z - half_z >= mn[2] + PROP_WALL_GAP_M && z + half_z <= mx[2] - PROP_WALL_GAP_M,
            "{label} footprint z=[{}, {}] outside [{}, {}]",
            z - half_z,
            z + half_z,
            mn[2] + PROP_WALL_GAP_M,
            mx[2] - PROP_WALL_GAP_M,
        );
    }

    #[test]
    fn generated_residential_furniture_anchors_stay_inside_unit_hulls() {
        let mut checked = 0;
        for set in APARTMENT_DOOR_TEMPLATE_SETS {
            for t in set.templates {
                if !(t.unit_id.starts_with("unit_e_") || t.unit_id.starts_with("unit_w_")) {
                    continue;
                }
                let face = SwingDoorFace::from_u8(t.face);
                let feet_y = feet_world_y(TEST_LEVEL, t.feet_y_offset);
                let (mn, mx) = test_bounds(face, t.hinge_x, t.hinge_z, feet_y);
                let seed = east_west_interior_furniture_seed(&mn, &mx, t.hinge_x, t.hinge_z, face)
                    .expect("residential east/west units must use canonical furniture seed");
                let unit_label = format!("{}:{}", set.floor_doc_id, t.unit_id);

                assert_inside(
                    &format!("{unit_label} bed"),
                    &mn,
                    &mx,
                    seed.bed_x,
                    seed.bed_z,
                );
                assert_inside(
                    &format!("{unit_label} footlocker"),
                    &mn,
                    &mx,
                    seed.foot_x,
                    seed.foot_z,
                );
                assert_inside(
                    &format!("{unit_label} wardrobe"),
                    &mn,
                    &mx,
                    seed.wardrobe_x,
                    seed.wardrobe_z,
                );
                assert_footprint_inside(
                    &format!("{unit_label} bed"),
                    &mn,
                    &mx,
                    seed.bed_x,
                    seed.bed_z,
                    BED_HALF_X_M,
                    BED_HALF_Z_M,
                );
                assert_footprint_inside(
                    &format!("{unit_label} footlocker"),
                    &mn,
                    &mx,
                    seed.foot_x,
                    seed.foot_z,
                    FOOTLOCKER_HALF_X_M,
                    FOOTLOCKER_HALF_Z_M,
                );
                assert_footprint_inside(
                    &format!("{unit_label} wardrobe"),
                    &mn,
                    &mx,
                    seed.wardrobe_x,
                    seed.wardrobe_z,
                    WARDROBE_HALF_X_M,
                    WARDROBE_HALF_Z_M,
                );
                assert_inside(
                    &format!("{unit_label} stove"),
                    &mn,
                    &mx,
                    seed.stove_x,
                    seed.stove_z,
                );
                assert_footprint_inside(
                    &format!("{unit_label} stove"),
                    &mn,
                    &mx,
                    seed.stove_x,
                    seed.stove_z,
                    STOVE_CORNER_CLEARANCE_M,
                    STOVE_CORNER_CLEARANCE_M,
                );

                checked += 1;
            }
        }
        assert_eq!(checked, 32);
    }

    #[test]
    fn canonical_layout_is_mirrored_and_footlocker_sits_at_bed_foot() {
        let mn = [2.005, 0.0, -117.5825];
        let mx = [14.925, 3.0, -106.5825];
        let east = east_west_interior_furniture_seed(&mn, &mx, 1.925, -112.0825, SwingDoorFace::W)
            .unwrap();
        assert!(east.foot_x < east.bed_x);
        assert!((east.foot_z - east.bed_z).abs() < 1e-4);
        assert!(east.wardrobe_x < east.foot_x);
        assert!(east.wardrobe_z > east.bed_z);
        assert!((east.wardrobe_x - (mn[0] + WARDROBE_CENTER_FROM_BACK_WALL_M)).abs() < 1e-4);
        assert!((east.bed_yaw - std::f32::consts::FRAC_PI_2).abs() < 1e-4);
        assert!(east.stove_x < east.wardrobe_x);
        assert!(east.stove_z < east.bed_z);
        assert!(
            (east.stove_x - (mn[0] + PROP_WALL_GAP_M + STOVE_CORNER_CLEARANCE_M)).abs() < 0.06
        );
        assert!(
            (east.stove_z - (mn[2] + PROP_WALL_GAP_M + STOVE_CORNER_CLEARANCE_M)).abs() < 0.06
        );

        let west_mn = [-14.925, 0.0, -117.5825];
        let west_mx = [-2.005, 3.0, -106.5825];
        let west = east_west_interior_furniture_seed(
            &west_mn,
            &west_mx,
            -1.925,
            -112.0825,
            SwingDoorFace::E,
        )
        .unwrap();
        assert!(west.foot_x > west.bed_x);
        assert!((west.foot_z - west.bed_z).abs() < 1e-4);
        assert!(west.wardrobe_x > west.foot_x);
        assert!(west.wardrobe_z > west.bed_z);
        assert!((west.wardrobe_x - (west_mx[0] - WARDROBE_CENTER_FROM_BACK_WALL_M)).abs() < 1e-4);
        assert!((west.bed_yaw + std::f32::consts::FRAC_PI_2).abs() < 1e-4);
        assert!(west.stove_x < west.wardrobe_x);
        assert!(
            (west.stove_x - (west_mn[0] + PROP_WALL_GAP_M + STOVE_CORNER_CLEARANCE_M)).abs()
                < 0.06
        );
        assert!(
            (west.stove_z - (west_mn[2] + PROP_WALL_GAP_M + STOVE_CORNER_CLEARANCE_M)).abs()
                < 0.06
        );
    }

    #[test]
    fn generated_residential_unit_bounds_do_not_overlap_neighbors() {
        for set in APARTMENT_DOOR_TEMPLATE_SETS {
            let mut by_side: Vec<(u8, f32, f32, f32, String)> = set
                .templates
                .iter()
                .filter(|t| t.unit_id.starts_with("unit_e_") || t.unit_id.starts_with("unit_w_"))
                .map(|t| {
                    let face = SwingDoorFace::from_u8(t.face);
                    let feet_y = feet_world_y(TEST_LEVEL, t.feet_y_offset);
                    let (mn, mx) = test_bounds(face, t.hinge_x, t.hinge_z, feet_y);
                    (t.face, mn[2], mx[2], t.hinge_z, t.unit_id.to_string())
                })
                .collect();
            by_side.sort_by(|a, b| {
                a.0.cmp(&b.0)
                    .then_with(|| a.3.partial_cmp(&b.3).unwrap_or(std::cmp::Ordering::Equal))
            });
            for pair in by_side.windows(2) {
                let a = &pair[0];
                let b = &pair[1];
                if a.0 != b.0 {
                    continue;
                }
                assert!(
                    a.2 <= b.1 || b.2 <= a.1,
                    "{} and {} overlap: [{}, {}] vs [{}, {}]",
                    a.4,
                    b.4,
                    a.1,
                    a.2,
                    b.1,
                    b.2,
                );
            }
        }
    }
}

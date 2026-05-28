//! Walk-surface spawn anchors for megablock floor babushkas — corridor spine + unit interiors only.

use crate::apartments::ApartmentUnit;
use crate::dropped_item::apartment_clear_pickup_anchor_xz;
use crate::elevator_layout::{support_feet_y_for_level, BUILDING_ORIGIN_Y};
use crate::generated_walk_surfaces::WALK_SURFACE_AABB_SHARDS;
use crate::spawn_routing::xz_point_hits_elevator_shaft;

const FEET_CLEARANCE_M: f32 = 0.034;
const SPAWN_SLAB_INSET: f32 = 0.45;
const MIN_SLAB_SPAN_XZ: f32 = 0.95;
const MIN_SLAB_AREA_XZ: f32 = 1.35;
/// Inset from unit AABB — keeps spawns off balcony lips and outer window ledges.
const UNIT_INTERIOR_INSET_M: f32 = 1.15;
/// Corridor spine half-width (m) — rejects exterior catwalk slabs outside the hall shell.
const CORRIDOR_SPINE_HALF_WIDTH_M: f32 = 5.75;
/// ~2 of 6 slots use corridor walk meshes; remainder use unit interior anchors.
const CORRIDOR_SPAWN_SLOT_STRIDE: u32 = 3;

#[derive(Clone, Copy)]
struct WalkSpawnSlab {
    mn: [f32; 3],
    mx: [f32; 3],
    area_xz: f32,
}

#[inline]
fn splitmix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

#[inline]
fn rand_next(seed: &mut u64) -> u64 {
    let x = splitmix64(*seed);
    *seed = x.wrapping_mul(6364136223846793005).wrapping_add(1);
    x
}

#[inline]
fn hash_to_unit(seed: u64) -> f32 {
    let mixed = seed.wrapping_mul(1103515245).wrapping_add(12345);
    (mixed & 0xffff) as f32 / 65535.0
}

#[inline]
fn xz_inside_unit_bounds(unit: &ApartmentUnit, x: f32, z: f32) -> bool {
    x >= unit.bound_min_x
        && x <= unit.bound_max_x
        && z >= unit.bound_min_z
        && z <= unit.bound_max_z
}

#[inline]
fn xz_inside_unit_interior(unit: &ApartmentUnit, x: f32, z: f32) -> bool {
    let inset = UNIT_INTERIOR_INSET_M;
    x >= unit.bound_min_x + inset
        && x <= unit.bound_max_x - inset
        && z >= unit.bound_min_z + inset
        && z <= unit.bound_max_z - inset
}

fn level_walk_top_band(level_index: u32) -> (f32, f32) {
    let feet = support_feet_y_for_level(level_index, BUILDING_ORIGIN_Y);
    (feet - 0.85, feet + 0.55)
}

fn residential_spine_z_span(units: &[ApartmentUnit]) -> (f32, f32) {
    let mut min_z = f32::INFINITY;
    let mut max_z = f32::NEG_INFINITY;
    for unit in units {
        min_z = min_z.min(unit.bound_min_z);
        max_z = max_z.max(unit.bound_max_z);
    }
    (min_z - 0.6, max_z + 0.6)
}

fn is_corridor_walk_slab(units: &[ApartmentUnit], mn: [f32; 3], mx: [f32; 3]) -> bool {
    let cx = (mn[0] + mx[0]) * 0.5;
    let cz = (mn[2] + mx[2]) * 0.5;
    if units.iter().any(|u| xz_inside_unit_bounds(u, cx, cz)) {
        return false;
    }
    if cx.abs() > CORRIDOR_SPINE_HALF_WIDTH_M {
        return false;
    }
    let (z_lo, z_hi) = residential_spine_z_span(units);
    cz >= z_lo && cz <= z_hi
}

fn collect_corridor_walk_slabs(level_index: u32, units: &[ApartmentUnit]) -> Vec<WalkSpawnSlab> {
    let (y_lo, y_hi) = level_walk_top_band(level_index);
    let mut out = Vec::new();
    for shard in WALK_SURFACE_AABB_SHARDS.iter() {
        for &(mn, mx) in *shard {
            let top = mx[1];
            if top < y_lo || top > y_hi {
                continue;
            }
            let th = top - mn[1];
            if th <= 1e-4 || th > 0.55 {
                continue;
            }
            let dx = mx[0] - mn[0];
            let dz = mx[2] - mn[2];
            if dx < MIN_SLAB_SPAN_XZ || dz < MIN_SLAB_SPAN_XZ {
                continue;
            }
            let area = dx * dz;
            if area < MIN_SLAB_AREA_XZ {
                continue;
            }
            if !is_corridor_walk_slab(units, mn, mx) {
                continue;
            }
            out.push(WalkSpawnSlab { mn, mx, area_xz: area });
        }
    }
    out
}

fn sample_corridor_walk_pose(
    level_index: u32,
    units: &[ApartmentUnit],
    seed: &mut u64,
) -> Option<(f32, f32, f32, f32)> {
    let slabs = collect_corridor_walk_slabs(level_index, units);
    let total: f64 = slabs.iter().map(|s| s.area_xz as f64).sum();
    if !(total > 1e-6) {
        return None;
    }

    const SLAB_ATTEMPTS: usize = 12;
    const POINT_ATTEMPTS: usize = 16;

    for _ in 0..SLAB_ATTEMPTS {
        let roll = (rand_next(seed) as f64 / u64::MAX as f64) * total;
        let mut accum = 0.0;
        let mut chosen = slabs.last()?;
        for slab in &slabs {
            accum += slab.area_xz as f64;
            if roll <= accum {
                chosen = slab;
                break;
            }
        }

        let x0 = chosen.mn[0] + SPAWN_SLAB_INSET;
        let x1 = chosen.mx[0] - SPAWN_SLAB_INSET;
        let z0 = chosen.mn[2] + SPAWN_SLAB_INSET;
        let z1 = chosen.mx[2] - SPAWN_SLAB_INSET;
        if !(x1 > x0 && z1 > z0) {
            continue;
        }

        for _ in 0..POINT_ATTEMPTS {
            let u = (rand_next(seed) & 0xffff) as f32 / 65535.0;
            let v = (rand_next(seed) & 0xffff) as f32 / 65535.0;
            let x = x0 + u * (x1 - x0);
            let z = z0 + v * (z1 - z0);
            if xz_point_hits_elevator_shaft(x, z) {
                continue;
            }
            let y = chosen.mx[1] + FEET_CLEARANCE_M;
            let yaw = hash_to_unit(*seed) * std::f32::consts::TAU;
            *seed = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15);
            return Some((x, y, z, yaw));
        }
    }
    None
}

fn unit_interior_spawn_pose(unit: &ApartmentUnit, salt: u64) -> (f32, f32, f32, f32) {
    let (x, z) = apartment_clear_pickup_anchor_xz(unit, salt);
    let y = unit.foot_y;
    let yaw = hash_to_unit(salt.wrapping_mul(97)) * std::f32::consts::TAU;
    (x, y, z, yaw)
}

/// Corridor walk mesh or authored unit interior — never raw unit AABB (balcony ledges).
pub fn megablock_babushka_spawn_pose(
    level_index: u32,
    units: &[ApartmentUnit],
    slot_index: u32,
    spawn_salt: u64,
) -> (f32, f32, f32, f32) {
    let mut seed =
        spawn_salt.wrapping_add((slot_index as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15));
    if slot_index % CORRIDOR_SPAWN_SLOT_STRIDE == 0 {
        if let Some(pose) = sample_corridor_walk_pose(level_index, units, &mut seed) {
            return pose;
        }
    }
    let unit = &units[slot_index as usize % units.len()];
    unit_interior_spawn_pose(unit, seed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_unit() -> ApartmentUnit {
        ApartmentUnit {
            unit_key: "floor_mamutica_typical|17|unit_e_004".to_string(),
            floor_doc_id: "floor_mamutica_typical".to_string(),
            level: 17,
            unit_id: "unit_e_004".to_string(),
            state: 0,
            owner: None,
            claim_progress_secs: 0.0,
            claim_started_by: None,
            last_claim_pulse_micros: 0,
            reinforce_progress_secs: 0.0,
            reinforce_by: None,
            reinforced: 0,
            bed_x: 2.0,
            bed_y: 50.0,
            bed_z: -4.0,
            bed_yaw: 0.0,
            foot_x: 1.0,
            foot_y: 50.5,
            foot_z: -2.0,
            wardrobe_x: 3.0,
            wardrobe_z: -3.0,
            stove_x: 0.0,
            stove_z: 0.0,
            bound_min_x: -4.0,
            bound_max_x: 5.0,
            bound_min_z: -6.0,
            bound_max_z: 2.0,
            bound_min_y: 50.0,
            bound_max_y: 53.0,
        }
    }

    #[test]
    fn balcony_lip_outside_interior_inset() {
        let unit = test_unit();
        assert!(xz_inside_unit_bounds(&unit, 4.6, -5.5));
        assert!(!xz_inside_unit_interior(&unit, 4.6, -5.5));
    }

    #[test]
    fn corridor_spine_excludes_wide_offset_from_hall_center() {
        let units = [test_unit()];
        assert!(!is_corridor_walk_slab(&units, [-12.0, 50.0, -2.0], [-10.0, 50.2, 0.0]));
    }
}

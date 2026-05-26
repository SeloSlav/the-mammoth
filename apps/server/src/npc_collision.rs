//! Authoritative NPC capsule vs static/dynamic AABB locomotion (mirrors client FP resolver).

use spacetimedb::ReducerContext;

use crate::combat_stub::vertical_overlap;
use crate::generated_collision_constants::{
    COLLISION_EPS, DEPENETRATE_PASSES, FP_WALK_STEP_UP_MARGIN_M, SLIDE_PASSES,
    STEP_IGNORE_BELOW_FEET_M,
};
use crate::npc::{body_dims_for_archetype, WorldNpc};
use crate::npc_blockers::gather_npc_locomotion_blockers;

#[inline]
fn should_ignore_horizontal_block(body_feet_y: f32, _b_min_y: f32, b_max_y: f32) -> bool {
    b_max_y <= body_feet_y + FP_WALK_STEP_UP_MARGIN_M + 1e-4
        && b_max_y >= body_feet_y - STEP_IGNORE_BELOW_FEET_M
}

#[inline]
fn vertical_overlap_aabb(feet_y: f32, height: f32, mn: [f32; 3], mx: [f32; 3]) -> bool {
    vertical_overlap(feet_y, height, mn[1], mx[1] - mn[1])
}

fn resolve_overlap_along_axis(
    resolved: f32,
    prev: f32,
    radius: f32,
    min_face: f32,
    max_face: f32,
) -> f32 {
    let prev_max = prev + radius;
    let prev_min = prev - radius;
    if prev_max <= min_face + COLLISION_EPS {
        return resolved.min(min_face - radius - COLLISION_EPS);
    }
    if prev_min >= max_face - COLLISION_EPS {
        return resolved.max(max_face + radius + COLLISION_EPS);
    }
    let axis_delta = resolved - prev;
    if axis_delta > COLLISION_EPS {
        return resolved.min(min_face - radius - COLLISION_EPS);
    }
    if axis_delta < -COLLISION_EPS {
        return resolved.max(max_face + radius + COLLISION_EPS);
    }
    let mid = (min_face + max_face) * 0.5;
    if prev <= mid {
        resolved.min(min_face - radius - COLLISION_EPS)
    } else {
        resolved.max(max_face + radius + COLLISION_EPS)
    }
}

fn depenetrate_horizontal(
    x: &mut f32,
    z: &mut f32,
    prev_x: f32,
    prev_z: f32,
    vel_x: &mut f32,
    vel_z: &mut f32,
    feet_y: f32,
    height: f32,
    radius: f32,
    blockers: &[([f32; 3], [f32; 3])],
) {
    for _ in 0..DEPENETRATE_PASSES {
        let mut changed = false;
        for (mn, mx) in blockers {
            if !vertical_overlap_aabb(feet_y, height, *mn, *mx) {
                continue;
            }
            if should_ignore_horizontal_block(feet_y, mn[1], mx[1]) {
                continue;
            }
            let body_min_x = *x - radius;
            let body_max_x = *x + radius;
            let body_min_z = *z - radius;
            let body_max_z = *z + radius;
            let overlap_x = (body_max_x - mn[0]).min(mx[0] - body_min_x);
            let overlap_z = (body_max_z - mn[2]).min(mx[2] - body_min_z);
            if overlap_x <= 0.0 || overlap_z <= 0.0 {
                continue;
            }
            if overlap_x <= overlap_z {
                let next_x = resolve_overlap_along_axis(*x, prev_x, radius, mn[0], mx[0]);
                if next_x != *x {
                    if next_x < *x && *vel_x > 0.0 {
                        *vel_x = 0.0;
                    }
                    if next_x > *x && *vel_x < 0.0 {
                        *vel_x = 0.0;
                    }
                    *x = next_x;
                    changed = true;
                }
            } else {
                let next_z = resolve_overlap_along_axis(*z, prev_z, radius, mn[2], mx[2]);
                if next_z != *z {
                    if next_z < *z && *vel_z > 0.0 {
                        *vel_z = 0.0;
                    }
                    if next_z > *z && *vel_z < 0.0 {
                        *vel_z = 0.0;
                    }
                    *z = next_z;
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
}

fn slide_move_xz(
    px: f32,
    pz: f32,
    tx: f32,
    tz: f32,
    feet_y: f32,
    height: f32,
    radius: f32,
    blockers: &[([f32; 3], [f32; 3])],
    vel_x: &mut f32,
    vel_z: &mut f32,
) -> (f32, f32) {
    let mut rx = tx - px;
    let mut rz = tz - pz;
    let mut cx = px;
    let mut cz = pz;

    for _ in 0..SLIDE_PASSES {
        let len = (rx * rx + rz * rz).sqrt();
        if len < 1e-8 {
            break;
        }

        let mut best_t = 1.0_f32;
        let mut best_nx = 0.0_f32;
        let mut best_nz = 0.0_f32;

        for (mn, mx) in blockers {
            if !vertical_overlap_aabb(feet_y, height, *mn, *mx) {
                continue;
            }
            if should_ignore_horizontal_block(feet_y, mn[1], mx[1]) {
                continue;
            }

            if rx.abs() > 1e-8 {
                if rx > 0.0 {
                    let t = (mn[0] - radius - COLLISION_EPS - px) / rx;
                    if t >= 0.0 && t < best_t {
                        best_t = t;
                        best_nx = -1.0;
                        best_nz = 0.0;
                    }
                } else {
                    let t = (mx[0] + radius + COLLISION_EPS - px) / rx;
                    if t >= 0.0 && t < best_t {
                        best_t = t;
                        best_nx = 1.0;
                        best_nz = 0.0;
                    }
                }
            }
            if rz.abs() > 1e-8 {
                if rz > 0.0 {
                    let t = (mn[2] - radius - COLLISION_EPS - pz) / rz;
                    if t >= 0.0 && t < best_t {
                        best_t = t;
                        best_nx = 0.0;
                        best_nz = -1.0;
                    }
                } else {
                    let t = (mx[2] + radius + COLLISION_EPS - pz) / rz;
                    if t >= 0.0 && t < best_t {
                        best_t = t;
                        best_nx = 0.0;
                        best_nz = 1.0;
                    }
                }
            }
        }

        if best_t >= 1.0 - 1e-9 {
            cx += rx;
            cz += rz;
            break;
        }

        let t = best_t.max(0.0).min(1.0);
        cx += rx * t;
        cz += rz * t;

        let into = *vel_x * best_nx + *vel_z * best_nz;
        if into < 0.0 {
            *vel_x -= into * best_nx;
            *vel_z -= into * best_nz;
        }

        let remx = rx * (1.0 - t);
        let remz = rz * (1.0 - t);
        let slide_dot = remx * best_nx + remz * best_nz;
        rx = remx - slide_dot * best_nx;
        rz = remz - slide_dot * best_nz;
    }

    (cx, cz)
}

/// Resolve authoritative NPC planar motion against the same blocker set the player uses.
pub fn resolve_npc_planar_motion(
    ctx: &ReducerContext,
    npc: &WorldNpc,
    x: &mut f32,
    z: &mut f32,
    vel_x: &mut f32,
    vel_z: &mut f32,
    prev_x: f32,
    prev_z: f32,
) {
    let (radius, height) = body_dims_for_archetype(npc.archetype.as_str());
    let mut blockers = Vec::<([f32; 3], [f32; 3])>::new();
    gather_npc_locomotion_blockers(
        ctx,
        npc,
        prev_x,
        prev_z,
        *x,
        *z,
        radius,
        &mut blockers,
    );
    if blockers.is_empty() {
        return;
    }

    let (sx, sz) = slide_move_xz(
        prev_x,
        prev_z,
        *x,
        *z,
        npc.y,
        height,
        radius,
        &blockers,
        vel_x,
        vel_z,
    );
    *x = sx;
    *z = sz;
    depenetrate_horizontal(
        x,
        z,
        prev_x,
        prev_z,
        vel_x,
        vel_z,
        npc.y,
        height,
        radius,
        &blockers,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slide_move_stops_before_aabb_face() {
        let blockers = [([1.0, 0.0, -2.0], [2.0, 3.0, 2.0])];
        let mut vx = 1.0;
        let mut vz = 0.0;
        let (x, _) = slide_move_xz(0.4, 0.0, 1.3, 0.0, 0.4, 1.55, 0.28, &blockers, &mut vx, &mut vz);
        assert!(x <= 1.0 - 0.28 + 1e-3);
        assert_eq!(vx, 0.0);
    }
}

//! Horizontal FPS collision: disc sweep + multi-pass slide vs AABB blockers.
//! Mirrors `packages/world/src/fpCharacterController.ts` for client/server parity.
//! Regression vectors: `packages/world/src/testFixtures/fpCharacterControllerParity.json` (vitest).

use std::cell::Cell;

use crate::generated_collision_solids;
use crate::stair_opening_collision;
use crate::pose::PlayerPose;

const COLLISION_EPS: f32 = 0.0015;
const STEP_IGNORE_BELOW_FEET_M: f32 = 0.2;
const WALK_STEP_UP_MARGIN: f32 = 0.82;
const MAX_HORIZONTAL_COLLISION_SUBSTEP_M: f32 = 0.18;
const FOOT_R: f32 = 0.22;
const SLIDE_PASSES: usize = 4;
const RAY_EPS: f32 = 1e-8;

#[inline]
fn ignore_horizontal_block(feet_y: f32, top_y: f32) -> bool {
    top_y <= feet_y + WALK_STEP_UP_MARGIN + 1e-4 && top_y >= feet_y - STEP_IGNORE_BELOW_FEET_M
}

#[inline]
fn vertical_overlap_body(feet_y: f32, body_h: f32, mn: &[f32; 3], mx: &[f32; 3]) -> bool {
    let y0 = feet_y;
    let y1 = feet_y + body_h;
    y1 > mn[1] + 1e-4 && y0 < mx[1] - 1e-4
}

#[inline]
fn swept_vertical_overlap(
    prev_feet_y: f32,
    feet_y: f32,
    body_h: f32,
    mn: &[f32; 3],
    mx: &[f32; 3],
) -> bool {
    let y0 = prev_feet_y.min(feet_y);
    let y1 = (prev_feet_y + body_h).max(feet_y + body_h);
    y1 > mn[1] + 1e-4 && y0 < mx[1] - 1e-4
}

fn resolve_overlap_along_axis(
    resolved_pos: f32,
    prev_pos: f32,
    radius: f32,
    min_face: f32,
    max_face: f32,
) -> f32 {
    let prev_max = prev_pos + radius;
    let prev_min = prev_pos - radius;
    if prev_max <= min_face + COLLISION_EPS {
        return resolved_pos.min(min_face - radius - COLLISION_EPS);
    }
    if prev_min >= max_face - COLLISION_EPS {
        return resolved_pos.max(max_face + radius + COLLISION_EPS);
    }
    let axis_delta = resolved_pos - prev_pos;
    if axis_delta > COLLISION_EPS {
        return resolved_pos.min(min_face - radius - COLLISION_EPS);
    }
    if axis_delta < -COLLISION_EPS {
        return resolved_pos.max(max_face + radius + COLLISION_EPS);
    }
    let mid = (min_face + max_face) * 0.5;
    if prev_pos <= mid {
        resolved_pos.min(min_face - radius - COLLISION_EPS)
    } else {
        resolved_pos.max(max_face + radius + COLLISION_EPS)
    }
}

fn segment_vs_rect_xz(
    ox: f32,
    oz: f32,
    dx: f32,
    dz: f32,
    xmin: f32,
    zmin: f32,
    xmax: f32,
    zmax: f32,
) -> Option<(f32, f32)> {
    let mut u1 = 0.0_f32;
    let mut u2 = 1.0_f32;

    let mut clip = |p: f32, q: f32| -> bool {
        if p.abs() < RAY_EPS {
            return q >= 0.0;
        }
        let r = q / p;
        if p < 0.0 {
            if r > u2 {
                return false;
            }
            if r > u1 {
                u1 = r;
            }
        } else {
            if r < u1 {
                return false;
            }
            if r < u2 {
                u2 = r;
            }
        }
        true
    };

    if !clip(-dx, ox - xmin) {
        return None;
    }
    if !clip(dx, xmax - ox) {
        return None;
    }
    if !clip(-dz, oz - zmin) {
        return None;
    }
    if !clip(dz, zmax - oz) {
        return None;
    }
    if u1 > u2 {
        return None;
    }
    Some((u1, u2))
}

#[inline]
fn point_inside_rect_xz(x: f32, z: f32, x0: f32, z0: f32, x1: f32, z1: f32) -> bool {
    x >= x0 - 1e-9 && x <= x1 + 1e-9 && z >= z0 - 1e-9 && z <= z1 + 1e-9
}

fn penetration_normal_xz(ox: f32, oz: f32, x0: f32, z0: f32, x1: f32, z1: f32) -> (f32, f32) {
    let dl = ox - x0;
    let dr = x1 - ox;
    let db = oz - z0;
    let dt = z1 - oz;
    let m = dl.min(dr).min(db).min(dt);
    if m == dl {
        return (-1.0, 0.0);
    }
    if m == dr {
        return (1.0, 0.0);
    }
    if m == db {
        return (0.0, -1.0);
    }
    (0.0, 1.0)
}

fn hit_normal_at_xz(px: f32, pz: f32, x0: f32, z0: f32, x1: f32, z1: f32, dx: f32, dz: f32) -> (f32, f32) {
    let e = 1e-4_f32;
    if (px - x0).abs() < e {
        return (-1.0, 0.0);
    }
    if (px - x1).abs() < e {
        return (1.0, 0.0);
    }
    if (pz - z0).abs() < e {
        return (0.0, -1.0);
    }
    if (pz - z1).abs() < e {
        return (0.0, 1.0);
    }
    if dx.abs() >= dz.abs() {
        if dx > 0.0 {
            (-1.0, 0.0)
        } else {
            (1.0, 0.0)
        }
    } else if dz > 0.0 {
        (0.0, -1.0)
    } else {
        (0.0, 1.0)
    }
}

fn sweep_disc_vs_aabb(
    ox: f32,
    oz: f32,
    dx: f32,
    dz: f32,
    radius: f32,
    mn: &[f32; 3],
    mx: &[f32; 3],
    feet_y: f32,
    prev_feet_y: f32,
    body_h: f32,
) -> Option<(f32, f32, f32)> {
    if !swept_vertical_overlap(prev_feet_y, feet_y, body_h, mn, mx) {
        return None;
    }
    if ignore_horizontal_block(feet_y, mx[1]) {
        return None;
    }

    let x0 = mn[0] - radius;
    let x1 = mx[0] + radius;
    let z0 = mn[2] - radius;
    let z1 = mx[2] + radius;

    let seg = segment_vs_rect_xz(ox, oz, dx, dz, x0, z0, x1, z1)?;
    let (t0, t1) = seg;
    if t1 < -1e-9 || t0 > 1.0 + 1e-9 {
        return None;
    }

    if point_inside_rect_xz(ox, oz, x0, z0, x1, z1) {
        let (nx, nz) = penetration_normal_xz(ox, oz, x0, z0, x1, z1);
        return Some((0.0, nx, nz));
    }

    let mut t_hit = t0;
    if t_hit < 0.0 {
        t_hit = 0.0;
    }
    if t_hit > 1.0 {
        return None;
    }

    let px = ox + dx * t_hit;
    let pz = oz + dz * t_hit;
    let (nx, nz) = hit_normal_at_xz(px, pz, x0, z0, x1, z1, dx, dz);
    Some((t_hit, nx, nz))
}

fn find_closest_hit(
    ox: f32,
    oz: f32,
    dx: f32,
    dz: f32,
    r: f32,
    feet_y: f32,
    prev_feet_y: f32,
    body_h: f32,
    buf: &[([f32; 3], [f32; 3])],
) -> Option<(f32, f32, f32)> {
    let mut best: Option<(f32, f32, f32)> = None;
    for (mn, mx) in buf {
        if let Some(h) = sweep_disc_vs_aabb(ox, oz, dx, dz, r, mn, mx, feet_y, prev_feet_y, body_h) {
            let (t, nx, nz) = h;
            let replace = match best {
                None => true,
                Some((bt, _, _)) => t < bt - 1e-9,
            };
            if replace {
                best = Some((t, nx, nz));
            }
        }
    }
    best
}

fn fill_static_blockers(
    x0: f32,
    x1: f32,
    z0: f32,
    z1: f32,
    feet_y: f32,
    body_h: f32,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    out.clear();
    for shard in generated_collision_solids::COLLISION_SOLID_AABB_SHARDS {
        for (mn, mx) in *shard {
            if x1 < mn[0] || x0 > mx[0] || z1 < mn[2] || z0 > mx[2] {
                continue;
            }
            if !vertical_overlap_body(feet_y, body_h, mn, mx) {
                continue;
            }
            if stair_opening_collision::suppress_static_blocker(*mn, *mx) {
                continue;
            }
            out.push((*mn, *mx));
        }
    }
    stair_opening_collision::append_runtime_replacement_blockers(
        x0, x1, z0, z1, feet_y, body_h, out,
    );
}

fn slide_move_xz<F>(
    mut cx: f32,
    mut cz: f32,
    tx: f32,
    tz: f32,
    feet_y: f32,
    prev_feet_y: f32,
    body_h: f32,
    r: f32,
    buf: &mut Vec<([f32; 3], [f32; 3])>,
    p: &mut PlayerPose,
    fill: &mut F,
) -> (f32, f32)
where
    F: FnMut(f32, f32, f32, f32, Option<(f32, f32, f32)>, &mut Vec<([f32; 3], [f32; 3])>),
{
    let mut rx = tx - cx;
    let mut rz = tz - cz;

    for _ in 0..SLIDE_PASSES {
        let len = (rx * rx + rz * rz).sqrt();
        if len < 1e-8 {
            break;
        }

        let pad = r + COLLISION_EPS;
        let qx0 = (cx.min(cx + rx)) - pad;
        let qx1 = (cx.max(cx + rx)) + pad;
        let qz0 = (cz.min(cz + rz)) - pad;
        let qz1 = (cz.max(cz + rz)) + pad;
        fill(
            qx0,
            qx1,
            qz0,
            qz1,
            Some((cx, feet_y, cz)),
            buf,
        );

        let hit = find_closest_hit(cx, cz, rx, rz, r, feet_y, prev_feet_y, body_h, buf);

        let Some((t_hit, nx, nz)) = hit else {
            cx += rx;
            cz += rz;
            break;
        };

        if t_hit > 1.0 - 1e-9 {
            cx += rx;
            cz += rz;
            break;
        }

        if t_hit < 1e-7 {
            let nudge = COLLISION_EPS * 6.0;
            cx += nx * nudge;
            cz += nz * nudge;
            continue;
        }

        let t = (t_hit - 1e-6).clamp(0.0, 1.0);
        cx += rx * t;
        cz += rz * t;

        let into = p.vel_x * nx + p.vel_z * nz;
        if into < 0.0 {
            p.vel_x -= into * nx;
            p.vel_z -= into * nz;
        }

        let remx = rx * (1.0 - t);
        let remz = rz * (1.0 - t);
        let slide_dot = remx * nx + remz * nz;
        rx = remx - slide_dot * nx;
        rz = remz - slide_dot * nz;
    }

    (cx, cz)
}

fn depenetrate<F>(
    p: &mut PlayerPose,
    prev_x: f32,
    prev_z: f32,
    body_h: f32,
    r: f32,
    buf: &mut Vec<([f32; 3], [f32; 3])>,
    fill: &mut F,
) where
    F: FnMut(f32, f32, f32, f32, Option<(f32, f32, f32)>, &mut Vec<([f32; 3], [f32; 3])>),
{
    let max_iterations = 8;
    let mut overlapped_after_pass = false;

    for _ in 0..max_iterations {
        let mut changed = false;
        overlapped_after_pass = false;
        let x0 = p.x - r - COLLISION_EPS;
        let x1 = p.x + r + COLLISION_EPS;
        let z0 = p.z - r - COLLISION_EPS;
        let z1 = p.z + r + COLLISION_EPS;
        fill(x0, x1, z0, z1, Some((p.x, p.y, p.z)), buf);

        for (mn, mx) in buf.iter() {
            if !vertical_overlap_body(p.y, body_h, mn, mx) {
                continue;
            }
            if ignore_horizontal_block(p.y, mx[1]) {
                continue;
            }
            let body_min_x = p.x - r;
            let body_max_x = p.x + r;
            let body_min_z = p.z - r;
            let body_max_z = p.z + r;
            let overlap_x = (body_max_x - mn[0]).min(mx[0] - body_min_x);
            let overlap_z = (body_max_z - mn[2]).min(mx[2] - body_min_z);
            if overlap_x <= 0.0 || overlap_z <= 0.0 {
                continue;
            }
            overlapped_after_pass = true;
            if overlap_x <= overlap_z {
                let next_x = resolve_overlap_along_axis(p.x, prev_x, r, mn[0], mx[0]);
                if next_x != p.x {
                    if next_x < p.x && p.vel_x > 0.0 {
                        p.vel_x = 0.0;
                    }
                    if next_x > p.x && p.vel_x < 0.0 {
                        p.vel_x = 0.0;
                    }
                    p.x = next_x;
                    changed = true;
                }
            } else {
                let next_z = resolve_overlap_along_axis(p.z, prev_z, r, mn[2], mx[2]);
                if next_z != p.z {
                    if next_z < p.z && p.vel_z > 0.0 {
                        p.vel_z = 0.0;
                    }
                    if next_z > p.z && p.vel_z < 0.0 {
                        p.vel_z = 0.0;
                    }
                    p.z = next_z;
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }

    if !overlapped_after_pass {
        return;
    }

    let x0 = p.x - r - COLLISION_EPS;
    let x1 = p.x + r + COLLISION_EPS;
    let z0 = p.z - r - COLLISION_EPS;
    let z1 = p.z + r + COLLISION_EPS;
    fill(x0, x1, z0, z1, Some((p.x, p.y, p.z)), buf);
    let mut still = false;
    for (mn, mx) in buf.iter() {
        if !vertical_overlap_body(p.y, body_h, mn, mx) || ignore_horizontal_block(p.y, mx[1]) {
            continue;
        }
        let bminx = p.x - r;
        let bmaxx = p.x + r;
        let bminz = p.z - r;
        let bmaxz = p.z + r;
        if bmaxx <= mn[0] || bminx >= mx[0] || bmaxz <= mn[2] || bminz >= mx[2] {
            continue;
        }
        still = true;
        break;
    }
    if still {
        p.x = prev_x;
        p.z = prev_z;
        p.vel_x = 0.0;
        p.vel_z = 0.0;
    }
}

/// Static world shards + optional ceiling clamp when `vel_y > 0`.
pub fn resolve_player_static_collisions_character(
    p: &mut PlayerPose,
    prev_x: f32,
    prev_y: f32,
    prev_z: f32,
    body_h: f32,
    grounded: bool,
    buf: &mut Vec<([f32; 3], [f32; 3])>,
) {
    let r = FOOT_R;
    let fallback_feet_y = Cell::new(p.y);
    let mut fill = |x0: f32,
                    x1: f32,
                    z0: f32,
                    z1: f32,
                    qpose: Option<(f32, f32, f32)>,
                    out: &mut Vec<([f32; 3], [f32; 3])>| {
        let fy = qpose.map(|q| q.1).unwrap_or(fallback_feet_y.get());
        fill_static_blockers(x0, x1, z0, z1, fy, body_h, out);
    };

    let start_x = prev_x;
    let start_z = prev_z;
    let target_x = p.x;
    let target_z = p.z;
    let max_axis_delta = (target_x - start_x).abs().max((target_z - start_z).abs());
    let step_count = ((max_axis_delta / MAX_HORIZONTAL_COLLISION_SUBSTEP_M).ceil() as u32).max(1);

    let mut step_prev_x = start_x;
    let mut step_prev_z = start_z;
    for step in 1..=step_count {
        let u = step as f32 / step_count as f32;
        let sub_tx = start_x + (target_x - start_x) * u;
        let sub_tz = start_z + (target_z - start_z) * u;

        fallback_feet_y.set(p.y);
        let (mut nx, mut nz) = slide_move_xz(
            step_prev_x,
            step_prev_z,
            sub_tx,
            sub_tz,
            p.y,
            prev_y,
            body_h,
            r,
            buf,
            p,
            &mut fill,
        );

        if grounded && ((nx - sub_tx).abs() > 1e-4 || (nz - sub_tz).abs() > 1e-4) {
            let raised_y = p.y + 0.42_f32.min(WALK_STEP_UP_MARGIN * 0.5);
            let (sx, sz) = slide_move_xz(
                step_prev_x,
                step_prev_z,
                sub_tx,
                sub_tz,
                raised_y,
                prev_y,
                body_h,
                r,
                buf,
                p,
                &mut fill,
            );
            let reached = (sx - sub_tx).abs() < 1e-4 && (sz - sub_tz).abs() < 1e-4;
            if reached {
                p.y = raised_y;
                fallback_feet_y.set(p.y);
                nx = sx;
                nz = sz;
            }
        }

        p.x = nx;
        p.z = nz;
        step_prev_x = p.x;
        step_prev_z = p.z;
    }

    fallback_feet_y.set(p.y);
    depenetrate(p, prev_x, prev_z, body_h, r, buf, &mut fill);

    if p.vel_y > 0.0 {
        let x0 = p.x - r - COLLISION_EPS;
        let x1 = p.x + r + COLLISION_EPS;
        let z0 = p.z - r - COLLISION_EPS;
        let z1 = p.z + r + COLLISION_EPS;
        fill_static_blockers(x0, x1, z0, z1, p.y, body_h, buf);
        let head = p.y + body_h;
        let mut best_feet = p.y;
        for (mn, mx) in buf.iter() {
            if x1 <= mn[0] || x0 >= mx[0] || z1 <= mn[2] || z0 >= mx[2] {
                continue;
            }
            if head <= mn[1] + COLLISION_EPS {
                continue;
            }
            if p.y >= mn[1] {
                continue;
            }
            best_feet = best_feet.min(mn[1] - body_h - COLLISION_EPS);
        }
        if best_feet < p.y {
            p.y = best_feet;
            if p.vel_y > 0.0 {
                p.vel_y = 0.0;
            }
        }
    }
}

/// Same solver as static, but blockers come from `fill` (elevator/doors runtime collector).
pub fn resolve_horizontal_character_with_fill<F>(
    p: &mut PlayerPose,
    prev_x: f32,
    prev_y: f32,
    prev_z: f32,
    body_h: f32,
    grounded: bool,
    foot_r: f32,
    fill: &mut F,
    buf: &mut Vec<([f32; 3], [f32; 3])>,
) where
    F: FnMut(f32, f32, f32, f32, Option<(f32, f32, f32)>, &mut Vec<([f32; 3], [f32; 3])>),
{
    let start_x = prev_x;
    let start_z = prev_z;
    let target_x = p.x;
    let target_z = p.z;
    let max_axis_delta = (target_x - start_x).abs().max((target_z - start_z).abs());
    let step_count = ((max_axis_delta / MAX_HORIZONTAL_COLLISION_SUBSTEP_M).ceil() as u32).max(1);

    let mut step_prev_x = start_x;
    let mut step_prev_z = start_z;
    for step in 1..=step_count {
        let u = step as f32 / step_count as f32;
        let sub_tx = start_x + (target_x - start_x) * u;
        let sub_tz = start_z + (target_z - start_z) * u;

        let (mut nx, mut nz) = slide_move_xz(
            step_prev_x,
            step_prev_z,
            sub_tx,
            sub_tz,
            p.y,
            prev_y,
            body_h,
            foot_r,
            buf,
            p,
            fill,
        );

        if grounded && ((nx - sub_tx).abs() > 1e-4 || (nz - sub_tz).abs() > 1e-4) {
            let raised_y = p.y + 0.42_f32.min(WALK_STEP_UP_MARGIN * 0.5);
            let (sx, sz) = slide_move_xz(
                step_prev_x,
                step_prev_z,
                sub_tx,
                sub_tz,
                raised_y,
                prev_y,
                body_h,
                foot_r,
                buf,
                p,
                fill,
            );
            let reached = (sx - sub_tx).abs() < 1e-4 && (sz - sub_tz).abs() < 1e-4;
            if reached {
                p.y = raised_y;
                nx = sx;
                nz = sz;
            }
        }

        p.x = nx;
        p.z = nz;
        step_prev_x = p.x;
        step_prev_z = p.z;
    }

    depenetrate(p, prev_x, prev_z, body_h, foot_r, buf, fill);

    if p.vel_y > 0.0 {
        let r = foot_r;
        let x0 = p.x - r - COLLISION_EPS;
        let x1 = p.x + r + COLLISION_EPS;
        let z0 = p.z - r - COLLISION_EPS;
        let z1 = p.z + r + COLLISION_EPS;
        fill(x0, x1, z0, z1, Some((p.x, p.y, p.z)), buf);
        let head = p.y + body_h;
        let mut best_feet = p.y;
        for (mn, mx) in buf.iter() {
            if x1 <= mn[0] || x0 >= mx[0] || z1 <= mn[2] || z0 >= mx[2] {
                continue;
            }
            if head <= mn[1] + COLLISION_EPS {
                continue;
            }
            if p.y >= mn[1] {
                continue;
            }
            best_feet = best_feet.min(mn[1] - body_h - COLLISION_EPS);
        }
        if best_feet < p.y {
            p.y = best_feet;
            if p.vel_y > 0.0 {
                p.vel_y = 0.0;
            }
        }
    }
}

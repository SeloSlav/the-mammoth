//! Intent-driven movement + fixed-rate server integration.
//! Constants mirror `packages/engine/src/fpLocomotion.ts` — keep in sync when tuning.
//!
//! Elevator cab floors are snapshotted at tick start and lerped across player integration substeps
//! so vertical motion is not quantized to one 20 Hz sample per tick.
//! After integration, the generic kinematic-support helpers re-attach riders inside the moving cab
//! volume so probe/walk gaps cannot drop them through a moving platform.

use std::collections::HashMap;

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::accounts::user;
use crate::auth;
use crate::elevator::{self, elevator_car, ElevatorCar};
use crate::kinematic_support;
use crate::pose::{player_pose, PlayerPose};
use crate::world_sound;

// --- Bit layout (must match `apps/client/src/game/moveIntentCodec.ts`) ---
pub const BIT_FORWARD: u8 = 1 << 0;
pub const BIT_BACK: u8 = 1 << 1;
pub const BIT_LEFT: u8 = 1 << 2;
pub const BIT_RIGHT: u8 = 1 << 3;
pub const BIT_JUMP: u8 = 1 << 4;
pub const BIT_SPRINT: u8 = 1 << 5;
pub const BIT_CROUCH: u8 = 1 << 6;

// --- Physics (keep aligned with fpLocomotion.ts) ---
const FLOOR_Y: f32 = 0.35;
const SKIN: f32 = 0.034;
const GRAVITY: f32 = 18.0;
const JUMP_SPEED: f32 = 5.4;
// Indoor-ish profile — keep in sync with `packages/engine/src/fpLocomotion.ts`.
const WALK_SPEED: f32 = 1.65;
const SPRINT_SPEED: f32 = 3.35;
const CROUCH_SPEED: f32 = 1.05;
const GROUND_ACCEL: f32 = 19.0;
const AIR_ACCEL: f32 = 4.2;
const DRAG: f32 = 10.0;
const TICK_DT: f32 = 0.05; // 20 Hz; matches 50_000 µs schedule
/// Keep in sync with `FP_WALK_PROBE_DY` (`packages/engine/src/fpLocomotion.ts`).
const WALK_PROBE_DY: f32 = 1.05;
/// Keep in sync with `FP_WALK_STEP_UP_MARGIN` / `sampleWalkGroundTopY` in world.
const WALK_STEP_UP_MARGIN: f32 = 0.82;
/// Keep in sync with `FP_WALK_FOOT_RADIUS_XZ`.
const FOOT_RADIUS_XZ: f32 = 0.22;
/// Match client: `round(FP_LOCOMOTION_SUBSTEPS_PER_SECOND * dt)` per integration step.
const LOCOMOTION_SUBSTEPS_PER_SECOND: f32 = 200.0;
/// Keep in sync with `stepFpLocomotion` integration substeps (max bound).
const PHYS_SUBSTEPS_MAX: u32 = 50;
/// Ignore ground farther below the feet than this (m); avoids snapping to lobby slab in a shaft.
/// Keep in sync with `FP_WALK_MAX_SUPPORT_DROP_M`.
const MAX_SUPPORT_DROP_M: f32 = 3.1;
const SNAP_EPS: f32 = 0.006;
const PLAYER_HEIGHT_STAND_M: f32 = 1.78;
const PLAYER_HEIGHT_CROUCH_M: f32 = 1.2;
const COLLISION_EPS: f32 = 0.0015;
const STEP_IGNORE_BELOW_FEET_M: f32 = 0.2;
const MAX_HORIZONTAL_COLLISION_SUBSTEP_M: f32 = 0.18;

#[inline]
fn damp(current: f32, target: f32, lambda: f32, dt: f32) -> f32 {
    target + (current - target) * (-lambda * dt).exp()
}

#[inline]
fn clamp_len2(dx: f32, dz: f32, max_len: f32) -> (f32, f32) {
    let h = (dx * dx + dz * dz).sqrt();
    if h <= max_len || h < 1e-6 {
        return (dx, dz);
    }
    let s = max_len / h;
    (dx * s, dz * s)
}

/// Latest sampled input per client; the physics tick reads this (write: intents only).
#[spacetimedb::table(public, accessor = player_input)]
pub struct PlayerInput {
    #[primary_key]
    pub identity: Identity,
    pub intent_seq: u64,
    pub bits: u8,
    pub aim_yaw: f32,
}

/// Drives `physics_tick_step` at a fixed interval (server simulation tick).
#[spacetimedb::table(
    public,
    accessor = physics_tick,
    scheduled(physics_tick_step)
)]
pub struct PhysicsTick {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::reducer]
pub fn submit_move_intent(ctx: &ReducerContext, intent_seq: u64, bits: u8, aim_yaw: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_move_intent blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if let Some(prev) = ctx.db.player_input().identity().find(&id) {
        if intent_seq <= prev.intent_seq {
            return;
        }
        ctx.db.player_input().identity().update(PlayerInput {
            identity: id,
            intent_seq,
            bits,
            aim_yaw,
        });
    } else {
        let _ = ctx.db.player_input().insert(PlayerInput {
            identity: id,
            intent_seq,
            bits,
            aim_yaw,
        });
    }
}

#[spacetimedb::reducer]
pub fn physics_tick_step(ctx: &ReducerContext, _arg: PhysicsTick) {
    if ctx.sender() != ctx.identity() {
        return;
    }

    let prev_elevators: HashMap<String, ElevatorCar> = ctx
        .db
        .elevator_car()
        .iter()
        .map(|c| (c.shaft_key.clone(), c))
        .collect();
    elevator::tick_all_elevators(ctx, TICK_DT);

    for pose in ctx.db.player_pose().iter() {
        let id = pose.identity;
        let Some(u) = ctx.db.user().identity().find(&id) else {
            continue;
        };
        if !auth::has_completed_registration(&u) {
            continue;
        }

        let input = ctx
            .db
            .player_input()
            .identity()
            .find(&id)
            .unwrap_or(PlayerInput {
                identity: id,
                intent_seq: 0,
                bits: 0,
                aim_yaw: pose.yaw,
            });

        let grounded_before = pose.grounded;
        let mut p = pose;
        let prev_x = p.x;
        let prev_y = p.y;
        let prev_z = p.z;
        integrate_one(ctx, &input, &mut p, TICK_DT, &prev_elevators);
        // Snap feet onto kinematic support (elevator cab floor) BEFORE collision
        // so the dynamic AABB suppression check ("is rider inside moving cab?")
        // sees the correct feet Y rather than the pre-snap locomotion Y.
        elevator::snap_player_to_elevator_kinematic_support(ctx, &mut p);
        resolve_player_static_collisions(&mut p, prev_x, prev_y, prev_z, input.bits);
        elevator::resolve_player_generated_collision_aabbs(
            ctx,
            &mut p,
            prev_x,
            prev_y,
            prev_z,
            input.bits & BIT_CROUCH != 0,
        );
        elevator::clamp_player_to_elevator_kinematic_support(ctx, &mut p);
        world_sound::sync_footsteps_for_tick(ctx, id, &input, grounded_before, &p, TICK_DT);
        ctx.db.player_pose().identity().update(p);
    }
}

fn sample_static_walk_ground_top_y(x: f32, z: f32, probe_top_y: f32) -> f32 {
    let mut best = f32::NAN;
    let fr = FOOT_RADIUS_XZ;
    let fx0 = x - fr;
    let fx1 = x + fr;
    let fz0 = z - fr;
    let fz1 = z + fr;
    for shard in crate::generated_walk_surfaces::WALK_SURFACE_AABB_SHARDS {
        for (mn, mx) in *shard {
            if fx1 < mn[0] || fx0 > mx[0] || fz1 < mn[2] || fz0 > mx[2] {
                continue;
            }
            let top = mx[1];
            if top <= probe_top_y + WALK_STEP_UP_MARGIN {
                best = if best.is_nan() {
                    top
                } else {
                    best.max(top)
                };
            }
        }
    }
    best
}

/// Walk top sampling with elevator cab Y interpolated between tick-start and tick-end snapshots.
fn sample_walk_ground_top_y_lerped(
    ctx: &ReducerContext,
    x: f32,
    z: f32,
    probe_top_y: f32,
    prev_elevators: &HashMap<String, ElevatorCar>,
    alpha: f32,
) -> f32 {
    let mut best = sample_static_walk_ground_top_y(x, z, probe_top_y);
    let elevator_surface = elevator::sample_elevator_kinematic_support_surface_lerped(
        ctx,
        x,
        z,
        probe_top_y,
        WALK_STEP_UP_MARGIN,
        Some(prev_elevators),
        alpha,
        TICK_DT,
    );
    best = kinematic_support::merge_support_top(best, elevator_surface.as_ref());
    if best.is_nan() {
        const FP_MARGIN: f32 = 2.0;
        let outside = x < crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MIN_X - FP_MARGIN
            || x > crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MAX_X + FP_MARGIN
            || z < crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MIN_Z - FP_MARGIN
            || z > crate::generated_walk_surfaces::WALK_SURFACE_FOOTPRINT_MAX_Z + FP_MARGIN;
        let exterior_probe_max_y = FLOOR_Y + 8.0;
        if outside && probe_top_y <= exterior_probe_max_y {
            FLOOR_Y
        } else {
            f32::NAN
        }
    } else {
        best.max(FLOOR_Y)
    }
}

fn integrate_one(
    ctx: &ReducerContext,
    input: &PlayerInput,
    p: &mut PlayerPose,
    dt: f32,
    prev_elevators: &HashMap<String, ElevatorCar>,
) {
    let h = dt.clamp(0.0, 0.05);
    let bits = input.bits;
    let yaw = input.aim_yaw;

    let ix = (bits & BIT_RIGHT != 0) as i32 - (bits & BIT_LEFT != 0) as i32;
    let iy = (bits & BIT_FORWARD != 0) as i32 - (bits & BIT_BACK != 0) as i32;
    let mut in_x = ix as f32;
    let mut in_y = iy as f32;
    let in_len = (in_x * in_x + in_y * in_y).sqrt();
    if in_len > 1.0 {
        in_x /= in_len;
        in_y /= in_len;
    }

    let forward_x = -yaw.sin();
    let forward_z = -yaw.cos();
    let right_x = yaw.cos();
    let right_z = -yaw.sin();

    let wish_x = forward_x * in_y + right_x * in_x;
    let wish_z = forward_z * in_y + right_z * in_x;

    let crouch = bits & BIT_CROUCH != 0;
    let sprint = bits & BIT_SPRINT != 0;
    let speed = if crouch {
        CROUCH_SPEED
    } else if sprint {
        SPRINT_SPEED
    } else {
        WALK_SPEED
    };
    let accel = if p.grounded != 0 {
        GROUND_ACCEL
    } else {
        AIR_ACCEL
    };
    let target_vx = wish_x * speed;
    let target_vz = wish_z * speed;

    p.vel_x = damp(p.vel_x, target_vx, accel, h);
    p.vel_z = damp(p.vel_z, target_vz, accel, h);

    let moving = in_x * in_x + in_y * in_y > 1e-4;
    if !moving && p.grounded != 0 {
        p.vel_x = damp(p.vel_x, 0.0, DRAG, h);
        p.vel_z = damp(p.vel_z, 0.0, DRAG, h);
    }

    if p.grounded != 0 && (bits & BIT_JUMP != 0) {
        let probe_top_y = p.y + WALK_PROBE_DY;
        let base_top = sample_static_walk_ground_top_y(p.x, p.z, probe_top_y);
        let elevator_surface = elevator::sample_elevator_kinematic_support_surface_lerped(
            ctx,
            p.x,
            p.z,
            probe_top_y,
            WALK_STEP_UP_MARGIN,
            Some(prev_elevators),
            1.0,
            h,
        );
        let boost =
            kinematic_support::support_vertical_velocity_mps(base_top, elevator_surface.as_ref(), 0.05);
        p.vel_y = JUMP_SPEED + boost;
        p.grounded = 0;
    }

    let n_sub = (LOCOMOTION_SUBSTEPS_PER_SECOND * h).round() as i32;
    let n_sub = n_sub.clamp(1, PHYS_SUBSTEPS_MAX as i32) as u32;
    let sh = h / n_sub as f32;
    for i in 0..n_sub {
        let alpha = (i + 1) as f32 / n_sub as f32;
        let x0 = p.x;
        let z0 = p.z;
        p.vel_y -= GRAVITY * sh;
        p.x += p.vel_x * sh;
        p.z += p.vel_z * sh;
        p.y += p.vel_y * sh;
        let probe_y = p.y + WALK_PROBE_DY;
        let w0 = sample_walk_ground_top_y_lerped(ctx, x0, z0, probe_y, prev_elevators, alpha);
        let w1 = sample_walk_ground_top_y_lerped(ctx, p.x, p.z, probe_y, prev_elevators, alpha);
        let mut walk_top = w0;
        if w1.is_finite() {
            walk_top = if w0.is_finite() { w0.max(w1) } else { w1 };
        }
        if walk_top.is_finite()
            && walk_top > p.y - MAX_SUPPORT_DROP_M
            && p.y <= walk_top + SKIN + SNAP_EPS
        {
            p.y = walk_top + SKIN;
            p.vel_y = 0.0;
            p.grounded = 1;
        } else if !walk_top.is_finite() || walk_top <= p.y - MAX_SUPPORT_DROP_M {
            p.grounded = 0;
        }
    }

    if p.y < FLOOR_Y + SKIN - 1e-4 {
        p.y = FLOOR_Y + SKIN;
        p.vel_y = p.vel_y.max(0.0);
        p.grounded = 1;
    }

    // Anti-grief: clamp insane horizontal velocity from bad clients / float blowup
    let (vx, vz) = clamp_len2(p.vel_x, p.vel_z, 24.0);
    p.vel_x = vx;
    p.vel_z = vz;

    p.yaw = yaw;
    p.seq = input.intent_seq;
}

#[inline]
fn player_body_height(bits: u8) -> f32 {
    if bits & BIT_CROUCH != 0 {
        PLAYER_HEIGHT_CROUCH_M
    } else {
        PLAYER_HEIGHT_STAND_M
    }
}

#[inline]
fn swept_body_vertical_overlap(
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

#[inline]
fn ignore_horizontal_block(feet_y: f32, top_y: f32) -> bool {
    top_y <= feet_y + WALK_STEP_UP_MARGIN + 1e-4 && top_y >= feet_y - STEP_IGNORE_BELOW_FEET_M
}

#[inline]
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

    // If we are already overlapping, prefer the side opposite the attempted
    // motion instead of the minimum-penetration side. This prevents held-input
    // ratcheting through thin walls across repeated reconcile/tick steps.
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

#[inline]
fn depenetrate_static_horizontal_overlaps(
    p: &mut PlayerPose,
    prev_x: f32,
    prev_z: f32,
    body_h: f32,
) {
    let r = FOOT_RADIUS_XZ;
    let max_iterations = 8;
    let mut overlapped_after_pass = false;

    for _ in 0..max_iterations {
        let mut changed = false;
        overlapped_after_pass = false;
        let x0 = p.x - r - COLLISION_EPS;
        let x1 = p.x + r + COLLISION_EPS;
        let z0 = p.z - r - COLLISION_EPS;
        let z1 = p.z + r + COLLISION_EPS;
        for shard in crate::generated_collision_solids::COLLISION_SOLID_AABB_SHARDS {
            for (mn, mx) in *shard {
                if x1 <= mn[0] || x0 >= mx[0] || z1 <= mn[2] || z0 >= mx[2] {
                    continue;
                }
                if !swept_body_vertical_overlap(p.y, p.y, body_h, mn, mx) {
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
    let mut still_overlapping = false;
    for shard in crate::generated_collision_solids::COLLISION_SOLID_AABB_SHARDS {
        for (mn, mx) in *shard {
            if x1 <= mn[0] || x0 >= mx[0] || z1 <= mn[2] || z0 >= mx[2] {
                continue;
            }
            if !swept_body_vertical_overlap(p.y, p.y, body_h, mn, mx) {
                continue;
            }
            if ignore_horizontal_block(p.y, mx[1]) {
                continue;
            }
            let body_min_x = p.x - r;
            let body_max_x = p.x + r;
            let body_min_z = p.z - r;
            let body_max_z = p.z + r;
            if body_max_x <= mn[0] || body_min_x >= mx[0] {
                continue;
            }
            if body_max_z <= mn[2] || body_min_z >= mx[2] {
                continue;
            }
            still_overlapping = true;
            break;
        }
        if still_overlapping {
            break;
        }
    }
    if !still_overlapping {
        return;
    }

    p.x = prev_x;
    p.z = prev_z;
    p.vel_x = 0.0;
    p.vel_z = 0.0;
}

fn resolve_player_static_horizontal_collision_step(
    p: &mut PlayerPose,
    prev_x: f32,
    prev_y: f32,
    prev_z: f32,
    body_h: f32,
) {
    let r = FOOT_RADIUS_XZ;

    {
        let mut resolved_x = p.x;
        let x0 = (prev_x.min(p.x)) - r - COLLISION_EPS;
        let x1 = (prev_x.max(p.x)) + r + COLLISION_EPS;
        let z0 = (prev_z.min(p.z)) - r - COLLISION_EPS;
        let z1 = (prev_z.max(p.z)) + r + COLLISION_EPS;
        for shard in crate::generated_collision_solids::COLLISION_SOLID_AABB_SHARDS {
            for (mn, mx) in *shard {
                if x1 <= mn[0] || x0 >= mx[0] || z1 <= mn[2] || z0 >= mx[2] {
                    continue;
                }
                if !swept_body_vertical_overlap(prev_y, p.y, body_h, mn, mx) {
                    continue;
                }
                if ignore_horizontal_block(p.y, mx[1]) {
                    continue;
                }
                let body_min = resolved_x - r;
                let body_max = resolved_x + r;
                if body_max <= mn[0] || body_min >= mx[0] {
                    continue;
                }
                let next_resolved_x = resolve_overlap_along_axis(resolved_x, prev_x, r, mn[0], mx[0]);
                if next_resolved_x < resolved_x && p.vel_x > 0.0 {
                    p.vel_x = 0.0;
                }
                if next_resolved_x > resolved_x && p.vel_x < 0.0 {
                    p.vel_x = 0.0;
                }
                resolved_x = next_resolved_x;
            }
        }
        p.x = resolved_x;
    }

    {
        let mut resolved_z = p.z;
        let x0 = (prev_x.min(p.x)) - r - COLLISION_EPS;
        let x1 = (prev_x.max(p.x)) + r + COLLISION_EPS;
        let z0 = (prev_z.min(p.z)) - r - COLLISION_EPS;
        let z1 = (prev_z.max(p.z)) + r + COLLISION_EPS;
        for shard in crate::generated_collision_solids::COLLISION_SOLID_AABB_SHARDS {
            for (mn, mx) in *shard {
                if x1 <= mn[0] || x0 >= mx[0] || z1 <= mn[2] || z0 >= mx[2] {
                    continue;
                }
                if !swept_body_vertical_overlap(prev_y, p.y, body_h, mn, mx) {
                    continue;
                }
                if ignore_horizontal_block(p.y, mx[1]) {
                    continue;
                }
                let body_min = resolved_z - r;
                let body_max = resolved_z + r;
                if body_max <= mn[2] || body_min >= mx[2] {
                    continue;
                }
                let next_resolved_z = resolve_overlap_along_axis(resolved_z, prev_z, r, mn[2], mx[2]);
                if next_resolved_z < resolved_z && p.vel_z > 0.0 {
                    p.vel_z = 0.0;
                }
                if next_resolved_z > resolved_z && p.vel_z < 0.0 {
                    p.vel_z = 0.0;
                }
                resolved_z = next_resolved_z;
            }
        }
        p.z = resolved_z;
    }
}

fn resolve_player_static_collisions(
    p: &mut PlayerPose,
    prev_x: f32,
    prev_y: f32,
    prev_z: f32,
    bits: u8,
) {
    let body_h = player_body_height(bits);
    let start_x = prev_x;
    let start_z = prev_z;
    let target_x = p.x;
    let target_z = p.z;
    let max_axis_delta = (target_x - start_x).abs().max((target_z - start_z).abs());
    let step_count =
        ((max_axis_delta / MAX_HORIZONTAL_COLLISION_SUBSTEP_M).ceil() as u32).max(1);
    let mut step_prev_x = start_x;
    let mut step_prev_z = start_z;
    for step in 1..=step_count {
        let u = step as f32 / step_count as f32;
        p.x = start_x + (target_x - start_x) * u;
        p.z = start_z + (target_z - start_z) * u;
        resolve_player_static_horizontal_collision_step(p, step_prev_x, prev_y, step_prev_z, body_h);
        step_prev_x = p.x;
        step_prev_z = p.z;
    }

    depenetrate_static_horizontal_overlaps(p, prev_x, prev_z, body_h);

    if p.vel_y > 0.0 {
        let r = FOOT_RADIUS_XZ;
        let x0 = p.x - r - COLLISION_EPS;
        let x1 = p.x + r + COLLISION_EPS;
        let z0 = p.z - r - COLLISION_EPS;
        let z1 = p.z + r + COLLISION_EPS;
        let head = p.y + body_h;
        let mut best_feet = p.y;
        for shard in crate::generated_collision_solids::COLLISION_SOLID_AABB_SHARDS {
            for (mn, mx) in *shard {
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
        }
        if best_feet < p.y {
            p.y = best_feet;
            if p.vel_y > 0.0 {
                p.vel_y = 0.0;
            }
        }
    }
}

/// Insert repeating physics schedule (call from `init`).
pub fn start_physics_schedule(ctx: &ReducerContext) {
    let interval: TimeDuration = TimeDuration::from_micros(50_000);
    let _ = ctx.db.physics_tick().insert(PhysicsTick {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

/// Default input row for a new connection (processed before first intent).
pub fn ensure_player_input_row(ctx: &ReducerContext, id: Identity, yaw0: f32) {
    if ctx.db.player_input().identity().find(&id).is_none() {
        let _ = ctx.db.player_input().insert(PlayerInput {
            identity: id,
            intent_seq: 0,
            bits: 0,
            aim_yaw: yaw0,
        });
    }
}

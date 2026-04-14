//! **Runtime (stateful) elevator collision for authoritative movement** — not obsolete.
//!
//! The unified collision pipeline bakes **static** solids into `generated_collision_solids`
//! (from `buildStaticCollisionSceneForBuilding` via `scripts/gen-walk-aabbs.ts`). Those AABBs
//! cannot track live `elevator_car` / `elevator_landing_door` rows: cab door open fraction,
//! exterior swing, or “passage open when the corridor swing clears; if the car is docked here,
//! interior cab doors must also be clear”.
//!
//! This module is therefore the server-side **dynamic half** of the same design: it emits
//! query-local AABBs from current DB state and resolves them with the same axis-sweep rules as
//! [`crate::movement::resolve_player_static_collisions`], after static solids and before
//! kinematic cab snap/clamp (see `movement::physics_tick_step`).
//!
//! Interior automatic cab doors when nearly closed: **hallway-side slab** (first loop in
//! [`collect_generated_collision_aabbs`]). Corridor swing + hoistway front wall: **landing**
//! section of the same collector. Client prediction mirrors geometry in TS (e.g.
//! `fpElevatorLandingExteriorDoor.ts`); keep constants aligned with this file and `mod.rs`.
//!
//! Split from `mod.rs` so reducer/table logic stays easier to navigate.

use spacetimedb::{ReducerContext, Table};

use super::{elevator_car, elevator_landing_door};
use crate::elevator_layout::{self, DoorFace, SKIN};
use crate::pose::PlayerPose;

use super::{door_face_from_u8, face_lateral_half, landing_front_passage_open, spec_for_key, support_y};

#[derive(Clone, Copy)]
struct CollisionAabb {
    min: [f32; 3],
    max: [f32; 3],
}

#[inline]
fn player_body_height(crouch: bool) -> f32 {
    if crouch {
        super::PLAYER_HEIGHT_CROUCH_M
    } else {
        super::PLAYER_HEIGHT_STAND_M
    }
}

#[inline]
fn body_vertical_overlap(feet_y: f32, body_h: f32, aabb: &CollisionAabb) -> bool {
    let y0 = feet_y;
    let y1 = feet_y + body_h;
    y1 > aabb.min[1] + 1e-4 && y0 < aabb.max[1] - 1e-4
}

#[inline]
fn ignore_horizontal_block(feet_y: f32, top_y: f32) -> bool {
    top_y <= feet_y + 0.82 + 1e-4 && top_y >= feet_y - super::STEP_IGNORE_BELOW_FEET_M
}

#[inline]
fn push_query_overlapping_aabb(
    out: &mut Vec<CollisionAabb>,
    qx0: f32,
    qx1: f32,
    qz0: f32,
    qz1: f32,
    min: [f32; 3],
    max: [f32; 3],
) {
    if qx1 < min[0] || qx0 > max[0] || qz1 < min[2] || qz0 > max[2] {
        return;
    }
    out.push(CollisionAabb { min, max });
}

fn collect_generated_collision_aabbs(
    ctx: &ReducerContext,
    x0: f32,
    x1: f32,
    z0: f32,
    z1: f32,
    out: &mut Vec<CollisionAabb>,
) {
    let (hx, hz) = elevator_layout::inner_half_xz();
    let iy = elevator_layout::inner_height();

    for car in ctx.db.elevator_car().iter() {
        if car.door_open_01 >= super::DOOR_EXIT_CLAMP_MIN_OPEN {
            continue;
        }
        let door_half =
            face_lateral_half(door_face_from_u8(car.door_face), hx, hz) + super::CLOSED_CAB_OUTSIDE_WIDTH_PAD;
        let y0 = car.cab_floor_y - 0.22;
        let y1 = car.cab_floor_y + iy + 0.38;
        match door_face_from_u8(car.door_face) {
            DoorFace::E => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x + hx - super::CLOSED_CAB_OUTSIDE_SLAB_IN, y0, car.plate_z - door_half],
                [car.plate_x + hx + super::CLOSED_CAB_OUTSIDE_SLAB_OUT, y1, car.plate_z + door_half],
            ),
            DoorFace::W => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x - hx - super::CLOSED_CAB_OUTSIDE_SLAB_OUT, y0, car.plate_z - door_half],
                [car.plate_x - hx + super::CLOSED_CAB_OUTSIDE_SLAB_IN, y1, car.plate_z + door_half],
            ),
            DoorFace::N => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x - door_half, y0, car.plate_z + hz - super::CLOSED_CAB_OUTSIDE_SLAB_IN],
                [car.plate_x + door_half, y1, car.plate_z + hz + super::CLOSED_CAB_OUTSIDE_SLAB_OUT],
            ),
            DoorFace::S => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x - door_half, y0, car.plate_z - hz - super::CLOSED_CAB_OUTSIDE_SLAB_OUT],
                [car.plate_x + door_half, y1, car.plate_z - hz + super::CLOSED_CAB_OUTSIDE_SLAB_IN],
            ),
        }
    }

    // Cab roof slab (always): shaft falls must not phase through the car top.
    for car in ctx.db.elevator_car().iter() {
        let roof_y0 = car.cab_floor_y + iy - 0.08;
        let roof_y1 = car.cab_floor_y + iy + 0.16;
        push_query_overlapping_aabb(
            out,
            x0,
            x1,
            z0,
            z1,
            [car.plate_x - hx, roof_y0, car.plate_z - hz],
            [car.plate_x + hx, roof_y1, car.plate_z + hz],
        );
    }

    for landing in ctx.db.elevator_landing_door().iter() {
        let Some(spec) = spec_for_key(&landing.shaft_key) else {
            continue;
        };
        let Some(car) = ctx.db.elevator_car().shaft_key().find(&landing.shaft_key) else {
            continue;
        };
        let fy = support_y(landing.level);
        let y0 = fy + super::EXT_STRIP_Y0;
        let y1 = fy + super::EXT_STRIP_Y1;
        if landing.swing_open_01 <= super::EXT_DOOR_SOLID_SLAB_MAX_SWING {
            match spec.door {
                DoorFace::E => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x + hx + super::EXT_COLLISION_L0, y0, spec.plate_z - (hz + super::EXT_COLLISION_LZ_PAD)],
                    [spec.plate_x + hx + super::EXT_COLLISION_L1, y1, spec.plate_z + (hz + super::EXT_COLLISION_LZ_PAD)],
                ),
                DoorFace::W => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x - hx - super::EXT_COLLISION_L1, y0, spec.plate_z - (hz + super::EXT_COLLISION_LZ_PAD)],
                    [spec.plate_x - hx - super::EXT_COLLISION_L0, y1, spec.plate_z + (hz + super::EXT_COLLISION_LZ_PAD)],
                ),
                DoorFace::N => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x - (hx + super::EXT_COLLISION_LZ_PAD), y0, spec.plate_z + hz + super::EXT_COLLISION_L0],
                    [spec.plate_x + (hx + super::EXT_COLLISION_LZ_PAD), y1, spec.plate_z + hz + super::EXT_COLLISION_L1],
                ),
                DoorFace::S => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x - (hx + super::EXT_COLLISION_LZ_PAD), y0, spec.plate_z - hz - super::EXT_COLLISION_L1],
                    [spec.plate_x + (hx + super::EXT_COLLISION_LZ_PAD), y1, spec.plate_z - hz - super::EXT_COLLISION_L0],
                ),
            }
        }

        let outer_hx = elevator_layout::SHAFT_SX * 0.5;
        let outer_hz = elevator_layout::SHAFT_SZ * 0.5;
        let wall_y0 = fy - 0.22;
        let wall_y1 = fy + iy + 0.38;
        let passage_open = landing_front_passage_open(&landing, &car, fy);
        match spec.door {
            DoorFace::E => {
                let min_x = spec.plate_x + outer_hx - super::LANDING_FRONT_WALL_SLAB_IN;
                let max_x = spec.plate_x + outer_hx + super::LANDING_FRONT_WALL_SLAB_OUT;
                if !passage_open || super::LANDING_FRONT_PASSAGE_HALF_W >= outer_hz {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z - outer_hz],
                        [max_x, wall_y1, spec.plate_z + outer_hz],
                    );
                } else {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z - outer_hz],
                        [max_x, wall_y1, spec.plate_z - super::LANDING_FRONT_PASSAGE_HALF_W],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z + super::LANDING_FRONT_PASSAGE_HALF_W],
                        [max_x, wall_y1, spec.plate_z + outer_hz],
                    );
                }
            }
            DoorFace::W => {
                let min_x = spec.plate_x - outer_hx - super::LANDING_FRONT_WALL_SLAB_OUT;
                let max_x = spec.plate_x - outer_hx + super::LANDING_FRONT_WALL_SLAB_IN;
                if !passage_open || super::LANDING_FRONT_PASSAGE_HALF_W >= outer_hz {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z - outer_hz],
                        [max_x, wall_y1, spec.plate_z + outer_hz],
                    );
                } else {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z - outer_hz],
                        [max_x, wall_y1, spec.plate_z - super::LANDING_FRONT_PASSAGE_HALF_W],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z + super::LANDING_FRONT_PASSAGE_HALF_W],
                        [max_x, wall_y1, spec.plate_z + outer_hz],
                    );
                }
            }
            DoorFace::N => {
                let min_z = spec.plate_z + outer_hz - super::LANDING_FRONT_WALL_SLAB_IN;
                let max_z = spec.plate_z + outer_hz + super::LANDING_FRONT_WALL_SLAB_OUT;
                if !passage_open || super::LANDING_FRONT_PASSAGE_HALF_W >= outer_hx {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x - outer_hx, wall_y0, min_z],
                        [spec.plate_x + outer_hx, wall_y1, max_z],
                    );
                } else {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x - outer_hx, wall_y0, min_z],
                        [spec.plate_x - super::LANDING_FRONT_PASSAGE_HALF_W, wall_y1, max_z],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x + super::LANDING_FRONT_PASSAGE_HALF_W, wall_y0, min_z],
                        [spec.plate_x + outer_hx, wall_y1, max_z],
                    );
                }
            }
            DoorFace::S => {
                let min_z = spec.plate_z - outer_hz - super::LANDING_FRONT_WALL_SLAB_OUT;
                let max_z = spec.plate_z - outer_hz + super::LANDING_FRONT_WALL_SLAB_IN;
                if !passage_open || super::LANDING_FRONT_PASSAGE_HALF_W >= outer_hx {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x - outer_hx, wall_y0, min_z],
                        [spec.plate_x + outer_hx, wall_y1, max_z],
                    );
                } else {
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x - outer_hx, wall_y0, min_z],
                        [spec.plate_x - super::LANDING_FRONT_PASSAGE_HALF_W, wall_y1, max_z],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x + super::LANDING_FRONT_PASSAGE_HALF_W, wall_y0, min_z],
                        [spec.plate_x + outer_hx, wall_y1, max_z],
                    );
                }
            }
        }
    }
}

pub fn resolve_player_generated_collision_aabbs(
    ctx: &ReducerContext,
    p: &mut PlayerPose,
    prev_x: f32,
    prev_y: f32,
    prev_z: f32,
    crouch: bool,
) {
    let r = super::FOOT_R;
    let body_h = player_body_height(crouch);
    let mut aabbs = Vec::<CollisionAabb>::new();

    {
        let mut resolved_x = p.x;
        aabbs.clear();
        collect_generated_collision_aabbs(
            ctx,
            prev_x.min(p.x) - r - super::COLLISION_EPS,
            prev_x.max(p.x) + r + super::COLLISION_EPS,
            p.z - r - super::COLLISION_EPS,
            p.z + r + super::COLLISION_EPS,
            &mut aabbs,
        );
        for aabb in &aabbs {
            if !body_vertical_overlap(p.y, body_h, aabb) || ignore_horizontal_block(p.y, aabb.max[1]) {
                continue;
            }
            let body_min = resolved_x - r;
            let body_max = resolved_x + r;
            if body_max <= aabb.min[0] || body_min >= aabb.max[0] {
                continue;
            }
            let prev_max = prev_x + r;
            let prev_min = prev_x - r;
            if prev_max <= aabb.min[0] + super::COLLISION_EPS {
                resolved_x = resolved_x.min(aabb.min[0] - r - super::COLLISION_EPS);
                if p.vel_x > 0.0 {
                    p.vel_x = 0.0;
                }
                continue;
            }
            if prev_min >= aabb.max[0] - super::COLLISION_EPS {
                resolved_x = resolved_x.max(aabb.max[0] + r + super::COLLISION_EPS);
                if p.vel_x < 0.0 {
                    p.vel_x = 0.0;
                }
                continue;
            }
            let push_lo = (body_max - aabb.min[0]).abs();
            let push_hi = (aabb.max[0] - body_min).abs();
            if push_lo <= push_hi {
                resolved_x = resolved_x.min(aabb.min[0] - r - super::COLLISION_EPS);
                if p.vel_x > 0.0 {
                    p.vel_x = 0.0;
                }
            } else {
                resolved_x = resolved_x.max(aabb.max[0] + r + super::COLLISION_EPS);
                if p.vel_x < 0.0 {
                    p.vel_x = 0.0;
                }
            }
        }
        p.x = resolved_x;
    }

    {
        let mut resolved_z = p.z;
        aabbs.clear();
        collect_generated_collision_aabbs(
            ctx,
            p.x - r - super::COLLISION_EPS,
            p.x + r + super::COLLISION_EPS,
            prev_z.min(p.z) - r - super::COLLISION_EPS,
            prev_z.max(p.z) + r + super::COLLISION_EPS,
            &mut aabbs,
        );
        for aabb in &aabbs {
            if !body_vertical_overlap(p.y, body_h, aabb) || ignore_horizontal_block(p.y, aabb.max[1]) {
                continue;
            }
            let body_min = resolved_z - r;
            let body_max = resolved_z + r;
            if body_max <= aabb.min[2] || body_min >= aabb.max[2] {
                continue;
            }
            let prev_max = prev_z + r;
            let prev_min = prev_z - r;
            if prev_max <= aabb.min[2] + super::COLLISION_EPS {
                resolved_z = resolved_z.min(aabb.min[2] - r - super::COLLISION_EPS);
                if p.vel_z > 0.0 {
                    p.vel_z = 0.0;
                }
                continue;
            }
            if prev_min >= aabb.max[2] - super::COLLISION_EPS {
                resolved_z = resolved_z.max(aabb.max[2] + r + super::COLLISION_EPS);
                if p.vel_z < 0.0 {
                    p.vel_z = 0.0;
                }
                continue;
            }
            let push_lo = (body_max - aabb.min[2]).abs();
            let push_hi = (aabb.max[2] - body_min).abs();
            if push_lo <= push_hi {
                resolved_z = resolved_z.min(aabb.min[2] - r - super::COLLISION_EPS);
                if p.vel_z > 0.0 {
                    p.vel_z = 0.0;
                }
            } else {
                resolved_z = resolved_z.max(aabb.max[2] + r + super::COLLISION_EPS);
                if p.vel_z < 0.0 {
                    p.vel_z = 0.0;
                }
            }
        }
        p.z = resolved_z;
    }

    if p.vel_y > 0.0 {
        aabbs.clear();
        collect_generated_collision_aabbs(
            ctx,
            p.x - r - super::COLLISION_EPS,
            p.x + r + super::COLLISION_EPS,
            p.z - r - super::COLLISION_EPS,
            p.z + r + super::COLLISION_EPS,
            &mut aabbs,
        );
        let head = p.y + body_h;
        let mut best_feet = p.y;
        for aabb in &aabbs {
            if head <= aabb.min[1] + super::COLLISION_EPS {
                continue;
            }
            best_feet = best_feet.min(aabb.min[1] - body_h - super::COLLISION_EPS);
        }
        if best_feet < p.y {
            p.y = best_feet;
            if p.vel_y > 0.0 {
                p.vel_y = 0.0;
            }
        }
    }

    // Land on cab roof when falling from above (walk merge alone can miss one substep).
    {
        let (hx, hz) = elevator_layout::inner_half_xz();
        let iy = elevator_layout::inner_height();
        let head = p.y + body_h;
        let prev_head = prev_y + body_h;
        for car in ctx.db.elevator_car().iter() {
            let roof_top = car.cab_floor_y + iy;
            let min_x = car.plate_x - hx * 0.92;
            let max_x = car.plate_x + hx * 0.92;
            let min_z = car.plate_z - hz * 0.92;
            let max_z = car.plate_z + hz * 0.92;
            if p.x + r <= min_x || p.x - r >= max_x || p.z + r <= min_z || p.z - r >= max_z {
                continue;
            }
            if prev_head <= roof_top + 0.04 {
                continue;
            }
            if head < roof_top - 0.05 {
                continue;
            }
            if p.y > roof_top + 0.35 {
                continue;
            }
            p.y = roof_top + SKIN;
            if p.vel_y < 0.0 {
                p.vel_y = 0.0;
            }
            p.grounded = 1;
            break;
        }
    }
}

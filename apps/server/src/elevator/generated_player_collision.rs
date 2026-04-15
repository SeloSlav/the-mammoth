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

const MAX_HORIZONTAL_COLLISION_SUBSTEP_M: f32 = 0.18;

#[inline]
fn player_body_height(crouch: bool) -> f32 {
    if crouch {
        super::PLAYER_HEIGHT_CROUCH_M
    } else {
        super::PLAYER_HEIGHT_STAND_M
    }
}

#[inline]
fn swept_body_vertical_overlap(
    prev_feet_y: f32,
    feet_y: f32,
    body_h: f32,
    aabb: &CollisionAabb,
) -> bool {
    let y0 = prev_feet_y.min(feet_y);
    let y1 = (prev_feet_y + body_h).max(feet_y + body_h);
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
    if prev_max <= min_face + super::COLLISION_EPS {
        return resolved_pos.min(min_face - radius - super::COLLISION_EPS);
    }
    if prev_min >= max_face - super::COLLISION_EPS {
        return resolved_pos.max(max_face + radius + super::COLLISION_EPS);
    }

    // If we are already overlapping, prefer the side opposite the attempted
    // motion instead of the minimum-penetration side. This prevents held-input
    // ratcheting through thin cab/shaft walls across repeated correction steps.
    let axis_delta = resolved_pos - prev_pos;
    if axis_delta > super::COLLISION_EPS {
        return resolved_pos.min(min_face - radius - super::COLLISION_EPS);
    }
    if axis_delta < -super::COLLISION_EPS {
        return resolved_pos.max(max_face + radius + super::COLLISION_EPS);
    }

    let mid = (min_face + max_face) * 0.5;
    if prev_pos <= mid {
        resolved_pos.min(min_face - radius - super::COLLISION_EPS)
    } else {
        resolved_pos.max(max_face + radius + super::COLLISION_EPS)
    }
}

#[inline]
fn suppress_moving_cab_generated_collision_for_pose(
    px: f32,
    py: f32,
    pz: f32,
    car: &super::ElevatorCar,
) -> bool {
    if car.phase != super::PH_MOVING {
        return false;
    }
    let lx = px - car.plate_x;
    let lz = pz - car.plate_z;
    super::player_inside_cab_at_feet(lx, lz, py, car)
}

fn collect_generated_collision_aabbs(
    ctx: &ReducerContext,
    x0: f32,
    x1: f32,
    z0: f32,
    z1: f32,
    query_pose: Option<(f32, f32, f32)>,
    out: &mut Vec<CollisionAabb>,
) {
    let (hx, hz) = elevator_layout::inner_half_xz();
    let iy = elevator_layout::inner_height();

    // Cab door slab: always emit when doors are closed (no suppress check —
    // this is the cab's own containment, not landing geometry).
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

    // Cab walls (3 non-door faces, always): primary containment for riders.
    // Walls extend from the inner gameplay face outward past the static shaft
    // face + padding (~0.28 m thick), preventing the min-penetration heuristic
    // from pushing outward during reconciliation corrections.
    {
        let outer_hx = elevator_layout::SHAFT_SX * 0.5;
        let outer_hz = elevator_layout::SHAFT_SZ * 0.5;
        let wall_pad: f32 = 0.10;
        for car in ctx.db.elevator_car().iter() {
            let y0w = car.cab_floor_y - 0.05;
            let y1w = car.cab_floor_y + iy + 0.1;
            let face = door_face_from_u8(car.door_face);
            if face != DoorFace::E {
                push_query_overlapping_aabb(out, x0, x1, z0, z1,
                    [car.plate_x + hx, y0w, car.plate_z - hz],
                    [car.plate_x + outer_hx + wall_pad, y1w, car.plate_z + hz]);
            }
            if face != DoorFace::W {
                push_query_overlapping_aabb(out, x0, x1, z0, z1,
                    [car.plate_x - outer_hx - wall_pad, y0w, car.plate_z - hz],
                    [car.plate_x - hx, y1w, car.plate_z + hz]);
            }
            if face != DoorFace::N {
                push_query_overlapping_aabb(out, x0, x1, z0, z1,
                    [car.plate_x - hx, y0w, car.plate_z + hz],
                    [car.plate_x + hx, y1w, car.plate_z + outer_hz + wall_pad]);
            }
            if face != DoorFace::S {
                push_query_overlapping_aabb(out, x0, x1, z0, z1,
                    [car.plate_x - hx, y0w, car.plate_z - outer_hz - wall_pad],
                    [car.plate_x + hx, y1w, car.plate_z - hz]);
            }
        }
    }

    for landing in ctx.db.elevator_landing_door().iter() {
        let Some(spec) = spec_for_key(&landing.shaft_key) else {
            continue;
        };
        let Some(car) = ctx.db.elevator_car().shaft_key().find(&landing.shaft_key) else {
            continue;
        };
        if let Some((px, py, pz)) = query_pose {
            if suppress_moving_cab_generated_collision_for_pose(px, py, pz, &car) {
                continue;
            }
        }
        let fy = support_y(landing.level);

        // When the cab door is closed its slab already blocks the doorway at the cab's
        // Y band. Skip per-landing exterior/front-wall AABBs for floors whose Y band
        // overlaps the cab — prevents the landing collision from fighting with the cab's
        // own containment and pushing riders out through the door opening.
        let landing_y0 = fy - 0.22;
        let landing_y1 = fy + iy + 0.38;
        let cab_door_closed = car.door_open_01 < super::DOOR_EXIT_CLAMP_MIN_OPEN;
        let cab_y0 = car.cab_floor_y - 0.22;
        let cab_y1 = car.cab_floor_y + iy + 0.38;
        let cab_covers_landing =
            cab_door_closed && cab_y1 > landing_y0 + 0.05 && cab_y0 < landing_y1 - 0.05;
        if cab_covers_landing {
            continue;
        }

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
        } else {
            let theta = landing.swing_open_01 * super::EXT_DOOR_SWING_MAX_RAD;
            let panel_w = super::EXT_DOOR_W - 0.10;
            let hinge_lat = super::EXT_DOOR_W * 0.5 - 0.06;
            let o = super::EXT_DOOR_HINGE_OUTSET;
            let pad = super::EXT_DOOR_PANEL_HALF_THICK;
            let (st, ct) = (theta.sin(), theta.cos());

            match spec.door {
                DoorFace::E => {
                    let hx_o = spec.plate_x + hx + o;
                    let hz_l = spec.plate_z + hinge_lat;
                    let tip_x = hx_o + panel_w * st;
                    let tip_z = hz_l - panel_w * ct;
                    push_query_overlapping_aabb(out, x0, x1, z0, z1,
                        [hx_o - pad, y0, tip_z.min(hz_l) - pad],
                        [tip_x + pad, y1, tip_z.max(hz_l) + pad],
                    );
                }
                DoorFace::W => {
                    let hx_o = spec.plate_x - hx - o;
                    let hz_l = spec.plate_z + hinge_lat;
                    let tip_x = hx_o - panel_w * st;
                    let tip_z = hz_l + panel_w * ct;
                    push_query_overlapping_aabb(out, x0, x1, z0, z1,
                        [tip_x.min(hx_o) - pad, y0, hz_l.min(tip_z) - pad],
                        [tip_x.max(hx_o) + pad, y1, hz_l.max(tip_z) + pad],
                    );
                }
                DoorFace::N => {
                    let hx_l = spec.plate_x - hinge_lat;
                    let hz_o = spec.plate_z + hz + o;
                    let tip_x = hx_l + panel_w * ct;
                    let tip_z = hz_o + panel_w * st;
                    push_query_overlapping_aabb(out, x0, x1, z0, z1,
                        [hx_l.min(tip_x) - pad, y0, hz_o - pad],
                        [hx_l.max(tip_x) + pad, y1, tip_z + pad],
                    );
                }
                DoorFace::S => {
                    let hx_l = spec.plate_x + hinge_lat;
                    let hz_o = spec.plate_z - hz - o;
                    let tip_x = hx_l - panel_w * ct;
                    let tip_z = hz_o - panel_w * st;
                    push_query_overlapping_aabb(out, x0, x1, z0, z1,
                        [hx_l.min(tip_x) - pad, y0, tip_z.min(hz_o) - pad],
                        [hx_l.max(tip_x) + pad, y1, tip_z.max(hz_o) + pad],
                    );
                }
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

fn resolve_generated_horizontal_collision_step(
    ctx: &ReducerContext,
    p: &mut PlayerPose,
    prev_x: f32,
    prev_y: f32,
    prev_z: f32,
    body_h: f32,
    aabbs: &mut Vec<CollisionAabb>,
) {
    let r = super::FOOT_R;

    {
        let mut resolved_x = p.x;
        aabbs.clear();
        collect_generated_collision_aabbs(
            ctx,
            prev_x.min(p.x) - r - super::COLLISION_EPS,
            prev_x.max(p.x) + r + super::COLLISION_EPS,
            prev_z.min(p.z) - r - super::COLLISION_EPS,
            prev_z.max(p.z) + r + super::COLLISION_EPS,
            Some((resolved_x, p.y, p.z)),
            aabbs,
        );
        for aabb in aabbs.iter() {
            if !swept_body_vertical_overlap(prev_y, p.y, body_h, aabb)
                || ignore_horizontal_block(p.y, aabb.max[1])
            {
                continue;
            }
            let body_min = resolved_x - r;
            let body_max = resolved_x + r;
            if body_max <= aabb.min[0] || body_min >= aabb.max[0] {
                continue;
            }
            let next_resolved_x =
                resolve_overlap_along_axis(resolved_x, prev_x, r, aabb.min[0], aabb.max[0]);
            if next_resolved_x < resolved_x && p.vel_x > 0.0 {
                p.vel_x = 0.0;
            }
            if next_resolved_x > resolved_x && p.vel_x < 0.0 {
                p.vel_x = 0.0;
            }
            resolved_x = next_resolved_x;
        }
        p.x = resolved_x;
    }

    {
        let mut resolved_z = p.z;
        aabbs.clear();
        collect_generated_collision_aabbs(
            ctx,
            prev_x.min(p.x) - r - super::COLLISION_EPS,
            prev_x.max(p.x) + r + super::COLLISION_EPS,
            prev_z.min(p.z) - r - super::COLLISION_EPS,
            prev_z.max(p.z) + r + super::COLLISION_EPS,
            Some((p.x, p.y, resolved_z)),
            aabbs,
        );
        for aabb in aabbs.iter() {
            if !swept_body_vertical_overlap(prev_y, p.y, body_h, aabb)
                || ignore_horizontal_block(p.y, aabb.max[1])
            {
                continue;
            }
            let body_min = resolved_z - r;
            let body_max = resolved_z + r;
            if body_max <= aabb.min[2] || body_min >= aabb.max[2] {
                continue;
            }
            let next_resolved_z =
                resolve_overlap_along_axis(resolved_z, prev_z, r, aabb.min[2], aabb.max[2]);
            if next_resolved_z < resolved_z && p.vel_z > 0.0 {
                p.vel_z = 0.0;
            }
            if next_resolved_z > resolved_z && p.vel_z < 0.0 {
                p.vel_z = 0.0;
            }
            resolved_z = next_resolved_z;
        }
        p.z = resolved_z;
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
    let body_h = player_body_height(crouch);
    let mut aabbs = Vec::<CollisionAabb>::new();
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
        resolve_generated_horizontal_collision_step(
            ctx,
            p,
            step_prev_x,
            prev_y,
            step_prev_z,
            body_h,
            &mut aabbs,
        );
        step_prev_x = p.x;
        step_prev_z = p.z;
    }

    if p.vel_y > 0.0 {
        let r = super::FOOT_R;
        aabbs.clear();
        collect_generated_collision_aabbs(
            ctx,
            p.x - r - super::COLLISION_EPS,
            p.x + r + super::COLLISION_EPS,
            p.z - r - super::COLLISION_EPS,
            p.z + r + super::COLLISION_EPS,
            Some((p.x, p.y, p.z)),
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
        let r = super::FOOT_R;
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

#[cfg(test)]
mod tests {
    use super::suppress_moving_cab_generated_collision_for_pose;
    use crate::elevator::ElevatorCar;

    fn sample_car(phase: u8) -> ElevatorCar {
        ElevatorCar {
            shaft_key: "test_shaft".into(),
            current_level: 1,
            door_open_01: 0.0,
            phase,
            move_from_level: 1,
            move_to_level: 2,
            move_u: 0.5,
            dest_queue: Vec::new(),
            cab_floor_y: 10.0,
            door_face: 0,
            plate_x: 20.0,
            plate_z: -5.0,
        }
    }

    #[test]
    fn moving_rider_suppresses_same_shaft_generated_collision() {
        let car = sample_car(crate::elevator::PH_MOVING);
        assert!(suppress_moving_cab_generated_collision_for_pose(
            car.plate_x,
            car.cab_floor_y + 0.5,
            car.plate_z,
            &car,
        ));
    }

    #[test]
    fn idle_cab_does_not_suppress_same_shaft_generated_collision() {
        let car = sample_car(crate::elevator::PH_IDLE);
        assert!(!suppress_moving_cab_generated_collision_for_pose(
            car.plate_x,
            car.cab_floor_y + 0.5,
            car.plate_z,
            &car,
        ));
    }

    #[test]
    fn upper_landing_same_xz_does_not_count_as_riding_moving_cab() {
        let car = sample_car(crate::elevator::PH_MOVING);
        assert!(!suppress_moving_cab_generated_collision_for_pose(
            car.plate_x,
            car.cab_floor_y + 3.4,
            car.plate_z,
            &car,
        ));
    }
}

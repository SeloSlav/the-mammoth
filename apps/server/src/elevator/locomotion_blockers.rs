//! Elevator cab + landing locomotion blockers — lockstep with client `visitFpElevatorWorldCollisionAabbsInXZ`.

use spacetimedb::{ReducerContext, Table};

use crate::elevator_layout::{self, max_level, DoorFace, ElevShaftSpec, MAMUTH_ELEVATOR_SPECS, SHAFT_SX, SHAFT_SZ};

use super::collision_tuning::*;
use super::{
    elevator_car, elevator_landing_door, landing_door_row_key, landing_front_passage_open, support_y,
    ElevatorLandingDoor, DOOR_EXIT_CLAMP_MIN_OPEN,
};

pub(crate) struct BlockerQuery {
    pub x0: f32,
    pub x1: f32,
    pub z0: f32,
    pub z1: f32,
}

impl BlockerQuery {
    fn disjoint_aabb(&self, mn: [f32; 3], mx: [f32; 3]) -> bool {
        self.x1 < mn[0] || self.x0 > mx[0] || self.z1 < mn[2] || self.z0 > mx[2]
    }
}

#[inline]
fn push_if_in_query(out: &mut Vec<([f32; 3], [f32; 3])>, query: &BlockerQuery, mn: [f32; 3], mx: [f32; 3]) {
    if query.disjoint_aabb(mn, mx) {
        return;
    }
    out.push((mn, mx));
}

#[inline]
fn face_lateral_half(door: DoorFace, hx: f32, hz: f32) -> f32 {
    match door {
        DoorFace::E | DoorFace::W => hz,
        DoorFace::N | DoorFace::S => hx,
    }
}

fn spec_for_shaft(shaft_key: &str) -> Option<&'static ElevShaftSpec> {
    MAMUTH_ELEVATOR_SPECS.iter().find(|s| s.shaft_key == shaft_key)
}

fn emit_closed_cab_door_slab(
    out: &mut Vec<([f32; 3], [f32; 3])>,
    query: &BlockerQuery,
    door: DoorFace,
    plate_x: f32,
    plate_z: f32,
    hx: f32,
    hz: f32,
    cab_floor_y: f32,
    inner_h: f32,
) {
    let y0 = cab_floor_y - 0.22;
    let y1 = cab_floor_y + inner_h + 0.38;
    let door_half = face_lateral_half(door, hx, hz) + CLOSED_CAB_OUTSIDE_WIDTH_PAD;
    let (mn, mx) = match door {
        DoorFace::E => (
            [plate_x + hx - CLOSED_CAB_OUTSIDE_SLAB_IN, y0, plate_z - door_half],
            [
                plate_x + hx + CLOSED_CAB_OUTSIDE_SLAB_OUT,
                y1,
                plate_z + door_half,
            ],
        ),
        DoorFace::W => (
            [
                plate_x - hx - CLOSED_CAB_OUTSIDE_SLAB_OUT,
                y0,
                plate_z - door_half,
            ],
            [plate_x - hx + CLOSED_CAB_OUTSIDE_SLAB_IN, y1, plate_z + door_half],
        ),
        DoorFace::N => (
            [plate_x - door_half, y0, plate_z + hz - CLOSED_CAB_OUTSIDE_SLAB_IN],
            [
                plate_x + door_half,
                y1,
                plate_z + hz + CLOSED_CAB_OUTSIDE_SLAB_OUT,
            ],
        ),
        DoorFace::S => (
            [
                plate_x - door_half,
                y0,
                plate_z - hz - CLOSED_CAB_OUTSIDE_SLAB_OUT,
            ],
            [plate_x + door_half, y1, plate_z - hz + CLOSED_CAB_OUTSIDE_SLAB_IN],
        ),
    };
    push_if_in_query(out, query, mn, mx);
}

fn emit_cab_walls(
    out: &mut Vec<([f32; 3], [f32; 3])>,
    query: &BlockerQuery,
    door: DoorFace,
    plate_x: f32,
    plate_z: f32,
    hx: f32,
    hz: f32,
    cab_floor_y: f32,
    inner_h: f32,
) {
    let outer_hx = SHAFT_SX * 0.5;
    let outer_hz = SHAFT_SZ * 0.5;
    let wall_pad = 0.10;
    let y0 = cab_floor_y - 0.05;
    let y1 = cab_floor_y + inner_h + 0.1;
    if door != DoorFace::E {
        push_if_in_query(
            out,
            query,
            [plate_x + hx, y0, plate_z - hz],
            [plate_x + outer_hx + wall_pad, y1, plate_z + hz],
        );
    }
    if door != DoorFace::W {
        push_if_in_query(
            out,
            query,
            [plate_x - outer_hx - wall_pad, y0, plate_z - hz],
            [plate_x - hx, y1, plate_z + hz],
        );
    }
    if door != DoorFace::N {
        push_if_in_query(
            out,
            query,
            [plate_x - hx, y0, plate_z + hz],
            [plate_x + hx, y1, plate_z + outer_hz + wall_pad],
        );
    }
    if door != DoorFace::S {
        push_if_in_query(
            out,
            query,
            [plate_x - hx, y0, plate_z - outer_hz - wall_pad],
            [plate_x + hx, y1, plate_z - hz],
        );
    }
}

fn emit_exterior_solid_slab(
    out: &mut Vec<([f32; 3], [f32; 3])>,
    query: &BlockerQuery,
    door: DoorFace,
    plate_x: f32,
    plate_z: f32,
    hx: f32,
    hz: f32,
    landing_feet_y: f32,
) {
    let y0 = landing_feet_y + EXT_STRIP_Y0;
    let y1 = landing_feet_y + EXT_STRIP_Y1;
    let (mn, mx) = match door {
        DoorFace::E => (
            [
                plate_x + hx + EXT_COLLISION_L0,
                y0,
                plate_z - (hz + EXT_COLLISION_LZ_PAD),
            ],
            [
                plate_x + hx + EXT_COLLISION_L1,
                y1,
                plate_z + (hz + EXT_COLLISION_LZ_PAD),
            ],
        ),
        DoorFace::W => (
            [
                plate_x - hx - EXT_COLLISION_L1,
                y0,
                plate_z - (hz + EXT_COLLISION_LZ_PAD),
            ],
            [
                plate_x - hx - EXT_COLLISION_L0,
                y1,
                plate_z + (hz + EXT_COLLISION_LZ_PAD),
            ],
        ),
        DoorFace::N => (
            [
                plate_x - (hx + EXT_COLLISION_LZ_PAD),
                y0,
                plate_z + hz + EXT_COLLISION_L0,
            ],
            [
                plate_x + (hx + EXT_COLLISION_LZ_PAD),
                y1,
                plate_z + hz + EXT_COLLISION_L1,
            ],
        ),
        DoorFace::S => (
            [
                plate_x - (hx + EXT_COLLISION_LZ_PAD),
                y0,
                plate_z - hz - EXT_COLLISION_L1,
            ],
            [
                plate_x + (hx + EXT_COLLISION_LZ_PAD),
                y1,
                plate_z - hz - EXT_COLLISION_L0,
            ],
        ),
    };
    push_if_in_query(out, query, mn, mx);
}

fn emit_landing_front_wall(
    out: &mut Vec<([f32; 3], [f32; 3])>,
    query: &BlockerQuery,
    door: DoorFace,
    plate_x: f32,
    plate_z: f32,
    landing_feet_y: f32,
    inner_h: f32,
    passage_open: bool,
) {
    let y0 = landing_feet_y - 0.22;
    let y1 = landing_feet_y + inner_h + 0.38;
    let outer_hx = SHAFT_SX * 0.5;
    let outer_hz = SHAFT_SZ * 0.5;
    if passage_open && LANDING_FRONT_PASSAGE_HALF_W < outer_hz && LANDING_FRONT_PASSAGE_HALF_W < outer_hx
    {
        match door {
            DoorFace::E => {
                let slab_min_x = plate_x + outer_hx - LANDING_FRONT_WALL_SLAB_IN;
                let slab_max_x = plate_x + outer_hx + LANDING_FRONT_WALL_SLAB_OUT;
                push_if_in_query(
                    out,
                    query,
                    [slab_min_x, y0, plate_z - outer_hz],
                    [slab_max_x, y1, plate_z - LANDING_FRONT_PASSAGE_HALF_W],
                );
                push_if_in_query(
                    out,
                    query,
                    [slab_min_x, y0, plate_z + LANDING_FRONT_PASSAGE_HALF_W],
                    [slab_max_x, y1, plate_z + outer_hz],
                );
            }
            DoorFace::W => {
                let slab_min_x = plate_x - outer_hx - LANDING_FRONT_WALL_SLAB_OUT;
                let slab_max_x = plate_x - outer_hx + LANDING_FRONT_WALL_SLAB_IN;
                push_if_in_query(
                    out,
                    query,
                    [slab_min_x, y0, plate_z - outer_hz],
                    [slab_max_x, y1, plate_z - LANDING_FRONT_PASSAGE_HALF_W],
                );
                push_if_in_query(
                    out,
                    query,
                    [slab_min_x, y0, plate_z + LANDING_FRONT_PASSAGE_HALF_W],
                    [slab_max_x, y1, plate_z + outer_hz],
                );
            }
            DoorFace::N => {
                let slab_min_z = plate_z + outer_hz - LANDING_FRONT_WALL_SLAB_IN;
                let slab_max_z = plate_z + outer_hz + LANDING_FRONT_WALL_SLAB_OUT;
                push_if_in_query(
                    out,
                    query,
                    [plate_x - outer_hx, y0, slab_min_z],
                    [plate_x - LANDING_FRONT_PASSAGE_HALF_W, y1, slab_max_z],
                );
                push_if_in_query(
                    out,
                    query,
                    [plate_x + LANDING_FRONT_PASSAGE_HALF_W, y0, slab_min_z],
                    [plate_x + outer_hx, y1, slab_max_z],
                );
            }
            DoorFace::S => {
                let slab_min_z = plate_z - outer_hz - LANDING_FRONT_WALL_SLAB_OUT;
                let slab_max_z = plate_z - outer_hz + LANDING_FRONT_WALL_SLAB_IN;
                push_if_in_query(
                    out,
                    query,
                    [plate_x - outer_hx, y0, slab_min_z],
                    [plate_x - LANDING_FRONT_PASSAGE_HALF_W, y1, slab_max_z],
                );
                push_if_in_query(
                    out,
                    query,
                    [plate_x + LANDING_FRONT_PASSAGE_HALF_W, y0, slab_min_z],
                    [plate_x + outer_hx, y1, slab_max_z],
                );
            }
        }
        return;
    }

    let (mn, mx) = match door {
        DoorFace::E => (
            [
                plate_x + outer_hx - LANDING_FRONT_WALL_SLAB_IN,
                y0,
                plate_z - outer_hz,
            ],
            [
                plate_x + outer_hx + LANDING_FRONT_WALL_SLAB_OUT,
                y1,
                plate_z + outer_hz,
            ],
        ),
        DoorFace::W => (
            [
                plate_x - outer_hx - LANDING_FRONT_WALL_SLAB_OUT,
                y0,
                plate_z - outer_hz,
            ],
            [
                plate_x - outer_hx + LANDING_FRONT_WALL_SLAB_IN,
                y1,
                plate_z + outer_hz,
            ],
        ),
        DoorFace::N => (
            [plate_x - outer_hx, y0, plate_z + outer_hz - LANDING_FRONT_WALL_SLAB_IN],
            [
                plate_x + outer_hx,
                y1,
                plate_z + outer_hz + LANDING_FRONT_WALL_SLAB_OUT,
            ],
        ),
        DoorFace::S => (
            [
                plate_x - outer_hx,
                y0,
                plate_z - outer_hz - LANDING_FRONT_WALL_SLAB_OUT,
            ],
            [
                plate_x + outer_hx,
                y1,
                plate_z - outer_hz + LANDING_FRONT_WALL_SLAB_IN,
            ],
        ),
    };
    push_if_in_query(out, query, mn, mx);
}

/// Cab walls, closed-door slabs, corridor landing barriers — same sources as client elevator collision.
pub fn gather_elevator_locomotion_blockers(
    ctx: &ReducerContext,
    query: &BlockerQuery,
    feet_y: f32,
    body_h: f32,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    let _ = (feet_y, body_h);
    let (hx, hz) = elevator_layout::inner_half_xz();
    let inner_h = elevator_layout::inner_height();
    let max_lv = max_level();

    for car in ctx.db.elevator_car().iter() {
        let Some(spec) = spec_for_shaft(car.shaft_key.as_str()) else {
            continue;
        };
        let plate_x = car.plate_x;
        let plate_z = car.plate_z;
        let cab_floor_y = car.cab_floor_y;

        if car.door_open_01 < DOOR_EXIT_CLAMP_MIN_OPEN {
            emit_closed_cab_door_slab(
                out,
                query,
                spec.door,
                plate_x,
                plate_z,
                hx,
                hz,
                cab_floor_y,
                inner_h,
            );
        }

        emit_cab_walls(
            out,
            query,
            spec.door,
            plate_x,
            plate_z,
            hx,
            hz,
            cab_floor_y,
            inner_h,
        );

        for level in 1..=max_lv {
            let landing_feet_y = support_y(level);
            let landing_key = landing_door_row_key(car.shaft_key.as_str(), level);
            let landing = ctx
                .db
                .elevator_landing_door()
                .row_key()
                .find(&landing_key)
                .unwrap_or(ElevatorLandingDoor {
                    row_key: landing_key.clone(),
                    shaft_key: car.shaft_key.clone(),
                    level,
                    desired_open: 0,
                    swing_open_01: 0.0,
                });

            let cab_covers_landing = car.door_open_01 < DOOR_EXIT_CLAMP_MIN_OPEN
                && cab_floor_y + inner_h + 0.38 > landing_feet_y - 0.22 + 0.05
                && cab_floor_y - 0.22 < landing_feet_y + inner_h + 0.38 - 0.05;

            if cab_covers_landing {
                continue;
            }

            if landing.swing_open_01 <= EXT_DOOR_SOLID_SLAB_MAX_SWING {
                emit_exterior_solid_slab(
                    out,
                    query,
                    spec.door,
                    plate_x,
                    plate_z,
                    hx,
                    hz,
                    landing_feet_y,
                );
            }

            let passage_open = landing_front_passage_open(&landing, &car, landing_feet_y);
            emit_landing_front_wall(
                out,
                query,
                spec.door,
                plate_x,
                plate_z,
                landing_feet_y,
                inner_h,
                passage_open,
            );
        }
    }
}
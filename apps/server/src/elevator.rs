//! Authoritative elevator cars (shared state) + walk/collision hooks for the movement tick.

use spacetimedb::{ReducerContext, Table};

use crate::auth;
use crate::elevator_layout::{
    self, DoorFace, ElevShaftSpec, BUILDING_ORIGIN_Y, MAMUTH_ELEVATOR_SPECS, SKIN,
};
use crate::pose::{player_pose, PlayerPose};

const PH_IDLE: u8 = 0;
const PH_CLOSING: u8 = 1;
const PH_MOVING: u8 = 2;
const PH_OPENING: u8 = 3;

const DOOR_ANIM_SPEED: f32 = 2.35;
const MOVE_SPEED_MPS: f32 = 3.15;
pub const MAX_LEVEL: u32 = 19;
const FOOT_R: f32 = 0.22;
const CALL_R_XZ: f32 = 1.55;
const CALL_Y_HALF: f32 = 2.2;

#[spacetimedb::table(public, accessor = elevator_car)]
pub struct ElevatorCar {
    #[primary_key]
    pub shaft_key: String,
    pub current_level: u32,
    pub door_open_01: f32,
    pub phase: u8,
    pub move_from_level: u32,
    pub move_to_level: u32,
    pub move_u: f32,
    pub dest_queue: Vec<u32>,
    /// Authoritative feet support Y (matches `elevatorSupportFeetWorldY` on the client).
    pub cab_floor_y: f32,
    pub door_face: u8,
    pub plate_x: f32,
    pub plate_z: f32,
}

fn spec_for_key(key: &str) -> Option<&'static ElevShaftSpec> {
    MAMUTH_ELEVATOR_SPECS.iter().find(|s| s.shaft_key == key)
}

fn door_face_from_u8(v: u8) -> DoorFace {
    match v {
        1 => DoorFace::W,
        2 => DoorFace::N,
        3 => DoorFace::S,
        _ => DoorFace::E,
    }
}

fn support_y(level: u32) -> f32 {
    elevator_layout::support_feet_y_for_level(level, BUILDING_ORIGIN_Y)
}

fn enqueue_dest(row: &mut ElevatorCar, level: u32) {
    let lv = level.clamp(1, MAX_LEVEL);
    if row.dest_queue.last() == Some(&lv) {
        return;
    }
    row.dest_queue.push(lv);
}

fn peek_dest(row: &ElevatorCar) -> Option<u32> {
    row.dest_queue.first().copied()
}

fn consume_head_if_at(row: &mut ElevatorCar) {
    if row.dest_queue.first() == Some(&row.current_level) {
        row.dest_queue.remove(0);
    }
}

/// Insert default rows once (idempotent).
pub fn seed_elevators(ctx: &ReducerContext) {
    for s in MAMUTH_ELEVATOR_SPECS {
        let key = s.shaft_key.to_string();
        if ctx.db.elevator_car().shaft_key().find(&key).is_some() {
            continue;
        }
        let current_level = 1u32;
        let cab_y = support_y(current_level);
        let _ = ctx.db.elevator_car().insert(ElevatorCar {
            shaft_key: key,
            current_level,
            door_open_01: 1.0,
            phase: PH_IDLE,
            move_from_level: 1,
            move_to_level: 1,
            move_u: 0.0,
            dest_queue: Vec::new(),
            cab_floor_y: cab_y,
            door_face: s.door as u8,
            plate_x: s.plate_x,
            plate_z: s.plate_z,
        });
    }
}

fn step_one_row(row: &mut ElevatorCar, dt: f32) {
    let dest = peek_dest(row);

    if row.phase == PH_IDLE {
        if dest.is_some_and(|d| d != row.current_level) && row.door_open_01 > 0.98 {
            row.phase = PH_CLOSING;
        } else if dest == Some(row.current_level) {
            consume_head_if_at(row);
        }
    }

    if row.phase == PH_CLOSING {
        row.door_open_01 = (row.door_open_01 - DOOR_ANIM_SPEED * dt).max(0.0);
        if row.door_open_01 <= 0.001 {
            row.door_open_01 = 0.0;
            let d = peek_dest(row);
            if d.is_some_and(|x| x != row.current_level) {
                row.move_from_level = row.current_level;
                row.move_to_level = d.unwrap();
                row.move_u = 0.0;
                row.phase = PH_MOVING;
            } else {
                row.phase = PH_OPENING;
            }
        }
    }

    if row.phase == PH_MOVING {
        let y0 = support_y(row.move_from_level);
        let y1 = support_y(row.move_to_level);
        let dist = (y1 - y0).abs();
        let need = (dist / MOVE_SPEED_MPS.max(0.08)).max(1e-4);
        row.move_u = (row.move_u + dt / need).min(1.0);
        let s = row.move_u * row.move_u * (3.0 - 2.0 * row.move_u);
        row.cab_floor_y = y0 + (y1 - y0) * s;
        if row.move_u >= 1.0 {
            row.current_level = row.move_to_level;
            row.cab_floor_y = y1;
            row.phase = PH_OPENING;
        }
    }

    if row.phase == PH_OPENING {
        row.door_open_01 = (row.door_open_01 + DOOR_ANIM_SPEED * dt).min(1.0);
        if row.door_open_01 >= 0.999 {
            row.door_open_01 = 1.0;
            consume_head_if_at(row);
            row.phase = PH_IDLE;
        }
    } else if row.phase == PH_IDLE && row.door_open_01 >= 0.999 {
        row.cab_floor_y = support_y(row.current_level);
    }
}

/// Advance all cars once per physics tick (call **before** player integration).
pub fn tick_all_elevators(ctx: &ReducerContext, dt: f32) {
    let keys: Vec<String> = ctx
        .db
        .elevator_car()
        .iter()
        .map(|r| r.shaft_key.clone())
        .collect();
    for k in keys {
        let Some(mut row) = ctx.db.elevator_car().shaft_key().find(&k) else {
            continue;
        };
        step_one_row(&mut row, dt);
        ctx.db.elevator_car().shaft_key().update(row);
    }
}

/// Merge moving cab floors into walk sampling (geometry top = feet support − skin).
pub fn merge_elevator_walk_top(
    ctx: &ReducerContext,
    x: f32,
    z: f32,
    probe_top_y: f32,
    step_up_margin: f32,
    mut best: f32,
) -> f32 {
    let fx0 = x - FOOT_R;
    let fx1 = x + FOOT_R;
    let fz0 = z - FOOT_R;
    let fz1 = z + FOOT_R;
    let (ihx, ihz) = elevator_layout::inner_half_xz();

    for car in ctx.db.elevator_car().iter() {
        let cx = car.plate_x;
        let cz = car.plate_z;
        if fx1 < cx - ihx || fx0 > cx + ihx || fz1 < cz - ihz || fz0 > cz + ihz {
            continue;
        }
        let geom_top = car.cab_floor_y - SKIN;
        if geom_top <= probe_top_y + step_up_margin {
            if best.is_nan() {
                best = geom_top;
            } else {
                best = best.max(geom_top);
            }
        }
    }
    best
}

fn player_inside_cab(p: &PlayerPose, car: &ElevatorCar) -> bool {
    let lx = p.x - car.plate_x;
    let lz = p.z - car.plate_z;
    let (hx, hz) = elevator_layout::inner_half_xz();
    let iy = elevator_layout::inner_height();
    if lx.abs() > hx * 0.9 || lz.abs() > hz * 0.9 {
        return false;
    }
    if p.y < car.cab_floor_y - 0.2 || p.y > car.cab_floor_y + iy + 0.35 {
        return false;
    }
    true
}

fn call_center_y(level: u32) -> f32 {
    support_y(level.max(1)) + 1.1
}

fn near_call_pose(p: &PlayerPose, spec: &ElevShaftSpec, level: u32) -> bool {
    let n = match spec.door {
        DoorFace::E => (1.0_f32, 0.0_f32),
        DoorFace::W => (-1.0, 0.0),
        DoorFace::N => (0.0, 1.0),
        DoorFace::S => (0.0, -1.0),
    };
    let (ihx, ihz) = elevator_layout::inner_half_xz();
    let outward = match spec.door {
        DoorFace::E | DoorFace::W => ihx,
        DoorFace::N | DoorFace::S => ihz,
    };
    let pad = 0.52_f32;
    let cx = spec.plate_x + n.0 * (outward + pad);
    let cz = spec.plate_z + n.1 * (outward + pad);
    let cy = call_center_y(level);
    if (p.x - cx).hypot(p.z - cz) > CALL_R_XZ {
        return false;
    }
    if (p.y - cy).abs() > CALL_Y_HALF {
        return false;
    }
    true
}

/// Extra meters allowed past the inner cab AABB on the **door** side so players can step out
/// while doors are opening (matches client `mergeWalkTop` / gameplay feel).
///
/// Ramps from 0 below `DOOR_SLACK_START` to `DOOR_SLACK_FULL_M` at `DOOR_SLACK_FULL_OPEN`.
const DOOR_SLACK_FULL_M: f32 = 0.85;
const DOOR_SLACK_START: f32 = 0.45;
const DOOR_SLACK_FULL_OPEN: f32 = 0.85;

#[inline]
fn door_side_slack_m(door_open_01: f32) -> f32 {
    if door_open_01 >= DOOR_SLACK_FULL_OPEN {
        DOOR_SLACK_FULL_M
    } else if door_open_01 > DOOR_SLACK_START {
        DOOR_SLACK_FULL_M * ((door_open_01 - DOOR_SLACK_START) / (DOOR_SLACK_FULL_OPEN - DOOR_SLACK_START))
    } else {
        0.0
    }
}

/// Keep players from walking through cab shells; relax door side while doors are opening.
pub fn clamp_player_to_elevators(ctx: &ReducerContext, p: &mut PlayerPose) {
    let (ihx, ihz) = elevator_layout::inner_half_xz();
    let ox = 0.0_f32;
    let oz = 0.0_f32;

    for car in ctx.db.elevator_car().iter() {
        if !player_inside_cab(p, &car) {
            continue;
        }
        let face = door_face_from_u8(car.door_face);
        let cx = ox + car.plate_x;
        let cz = oz + car.plate_z;
        let ext = door_side_slack_m(car.door_open_01);

        let mut xmin = cx - ihx * 0.92;
        let mut xmax = cx + ihx * 0.92;
        let mut zmin = cz - ihz * 0.92;
        let mut zmax = cz + ihz * 0.92;
        match face {
            DoorFace::E => xmax += ext,
            DoorFace::W => xmin -= ext,
            DoorFace::N => zmax += ext,
            DoorFace::S => zmin -= ext,
        }
        p.x = p.x.clamp(xmin, xmax);
        p.z = p.z.clamp(zmin, zmax);
    }
}

#[cfg(test)]
mod door_slack_tests {
    use super::door_side_slack_m;

    #[test]
    fn door_slack_zero_when_closed() {
        assert_eq!(door_side_slack_m(0.0), 0.0);
        assert_eq!(door_side_slack_m(0.45), 0.0);
    }

    #[test]
    fn door_slack_full_when_open_enough() {
        assert!((door_side_slack_m(0.85) - 0.85).abs() < 1e-4);
        assert!((door_side_slack_m(1.0) - 0.85).abs() < 1e-4);
    }

    #[test]
    fn door_slack_ramps_mid_range() {
        let mid = door_side_slack_m(0.65);
        assert!(mid > 0.2 && mid < 0.85);
    }
}

#[spacetimedb::reducer]
pub fn elevator_hail(ctx: &ReducerContext, shaft_key: String, level: u32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("elevator_hail blocked: {e}");
        return;
    }
    let Some(spec) = spec_for_key(&shaft_key) else {
        return;
    };
    let lv = level.clamp(1, MAX_LEVEL);
    let id = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    if !near_call_pose(&pose, spec, lv) {
        return;
    }
    let Some(mut row) = ctx.db.elevator_car().shaft_key().find(&shaft_key) else {
        return;
    };
    enqueue_dest(&mut row, lv);
    ctx.db.elevator_car().shaft_key().update(row);
}

#[spacetimedb::reducer]
pub fn elevator_select_floor(ctx: &ReducerContext, shaft_key: String, level: u32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("elevator_select_floor blocked: {e}");
        return;
    }
    if spec_for_key(&shaft_key).is_none() {
        return;
    }
    let lv = level.clamp(1, MAX_LEVEL);
    let id = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    let Some(row) = ctx.db.elevator_car().shaft_key().find(&shaft_key) else {
        return;
    };
    if !player_inside_cab(&pose, &row) {
        return;
    }
    let mut row = row;
    enqueue_dest(&mut row, lv);
    ctx.db.elevator_car().shaft_key().update(row);
}

//! Authoritative elevator cars (shared state) + walk/collision hooks for the movement tick.

use std::collections::HashMap;

use spacetimedb::{ReducerContext, Table};

use crate::auth;
use crate::elevator_layout::{
    self, DoorFace, ElevShaftSpec, BUILDING_ORIGIN_Y, MAMUTH_ELEVATOR_SPECS, SKIN,
    STOREY_SPACING_M,
};
use crate::pose::{player_pose, PlayerPose};

/// Must match `apps/client/src/game/fpElevatorConstants.ts` `ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS`.
const RIDER_LOCK_SKIP_UPWARD_VY_MPS: f32 = 0.85;
/// Same formula as client `ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M` (`DEFAULT_BUILDING_FLOOR_SPACING_M * 0.92`).
const RIDER_SNAP_FEET_BELOW_CAB_M: f32 = STOREY_SPACING_M * 0.92;
/// Same as client `ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M` (`STOREY_SPACING_M * 0.58`).
const RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M: f32 = STOREY_SPACING_M * 0.58;
/// Foot-center inset from inner half so walk merge foot circle stays valid (`FOOT_R` + 2cm). Sync client `ELEVATOR_CLAMP_FOOT_CLEARANCE_M`.
const CAB_CLAMP_FOOT_CLEAR_M: f32 = 0.24;
/// Door-axis inner edge before slack. Sync client `ELEVATOR_CLAMP_DOOR_AXIS_INNER_FRAC`.
const CAB_CLAMP_DOOR_AXIS_INNER_FRAC: f32 = 0.92;
/// Pad around clamp AABB for rider snap / clamp **gate** (m). Sync client `ELEVATOR_CAB_PHYS_GATE_PAD_M`.
const RIDER_PHYS_GATE_PAD_M: f32 = 0.26;
/// Sync client `ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN`.
const DOOR_EXIT_CLAMP_MIN_OPEN: f32 = 0.22;

const PH_IDLE: u8 = 0;
const PH_CLOSING: u8 = 1;
const PH_MOVING: u8 = 2;
const PH_OPENING: u8 = 3;

const DOOR_ANIM_SPEED: f32 = 2.35;
const MOVE_SPEED_MPS: f32 = 3.15;
pub const MAX_LEVEL: u32 = 19;
const FOOT_R: f32 = 0.22;
/// Must match `WALK_PROBE_DY` in `movement.rs` — used to recover feet Y from the walk probe.
const WALK_PROBE_DY: f32 = 1.05;
/// Keep in sync with `apps/client/src/game/fpElevatorConstants.ts` `CALL_RADIUS_XZ`.
const CALL_R_XZ: f32 = 1.78;
const CALL_Y_HALF: f32 = 2.2;
/// Keep in sync with client `LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M`.
const LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M: f32 = 0.5;

// --- Landing swing door (corridor side) — sync `apps/client/src/game/fpElevatorLandingExteriorDoor.ts` ---
/// Match client `EXTERIOR_DOOR_W_M`.
const EXT_DOOR_W: f32 = 1.86;
/// Match client `EXTERIOR_DOOR_H_M` (visual / interact height band uses `EXT_STRIP_Y1`).
#[allow(dead_code)]
const EXT_DOOR_H: f32 = 2.05;
const EXT_DOOR_ANIM_SPEED: f32 = 2.05;
/// Collision / block disabled above this swing (0..1).
const EXT_DOOR_COLLISION_OPEN_THRESH: f32 = 0.88;
/// **E** interact strip (plate-local, door normal). Must extend past the closed-door push-out. Sync client `EXTERIOR_INTERACT_*`.
const EXT_INTERACT_L0: f32 = -0.28;
const EXT_INTERACT_L1: f32 = 0.82;
const EXT_INTERACT_LZ_PAD: f32 = 0.08;
/// Closed-door **physics** slab. Sync client `EXTERIOR_COLLISION_*`.
const EXT_COLLISION_L0: f32 = -0.45;
const EXT_COLLISION_L1: f32 = 0.62;
const EXT_COLLISION_LZ_PAD: f32 = 0.08;
const EXT_STRIP_Y0: f32 = 0.05;
const EXT_STRIP_Y1: f32 = 2.25;
/// Hallway-side blocker for a mostly closed automatic cab door.
const CLOSED_CAB_OUTSIDE_SLAB_IN: f32 = 0.18;
const CLOSED_CAB_OUTSIDE_SLAB_OUT: f32 = 0.72;
const CLOSED_CAB_OUTSIDE_WIDTH_PAD: f32 = 0.18;

#[spacetimedb::table(public, accessor = elevator_landing_door)]
pub struct ElevatorLandingDoor {
    #[primary_key]
    pub row_key: String,
    pub shaft_key: String,
    pub level: u32,
    /// 0 = animate toward shut, 1 = toward open.
    pub desired_open: u8,
    pub swing_open_01: f32,
}

fn landing_door_row_key(shaft_key: &str, level: u32) -> String {
    format!("{shaft_key}|{level}")
}

/// True when a landing hail to `lv` would be redundant (cab already docked at that support height).
/// While `PH_MOVING`, cab Y passes intermediate floors so we only suppress on non-moving phases.
fn landing_hail_redundant_for_cab_pose(row: &ElevatorCar, lv: u32) -> bool {
    row.phase != PH_MOVING
        && (row.cab_floor_y - support_y(lv)).abs() < LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M
}

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
    seed_elevator_landing_doors(ctx);
}

/// One swing door per hoistway landing — starts **closed** (must open with E to pass).
pub fn seed_elevator_landing_doors(ctx: &ReducerContext) {
    for s in MAMUTH_ELEVATOR_SPECS {
        let shaft_key = s.shaft_key.to_string();
        for lv in 1..=MAX_LEVEL {
            let row_key = landing_door_row_key(&shaft_key, lv);
            if ctx.db.elevator_landing_door().row_key().find(&row_key).is_some() {
                continue;
            }
            let _ = ctx.db.elevator_landing_door().insert(ElevatorLandingDoor {
                row_key,
                shaft_key: shaft_key.clone(),
                level: lv,
                desired_open: 0,
                swing_open_01: 0.0,
            });
        }
    }
}

fn step_one_row(row: &mut ElevatorCar, dt: f32) {
    let dest = peek_dest(row);

    if row.phase == PH_IDLE {
        if dest.is_some_and(|d| d != row.current_level) && row.door_open_01 > 0.98 {
            row.phase = PH_CLOSING;
        } else if dest == Some(row.current_level) {
            // Rider hailed the floor we're already on (e.g. lobby) — open doors, don't no-op behind closed doors.
            if row.door_open_01 < 0.92 {
                row.phase = PH_OPENING;
            }
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
    seed_elevator_landing_doors(ctx);
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
    tick_landing_exterior_doors(ctx, dt);
}

fn tick_landing_exterior_doors(ctx: &ReducerContext, dt: f32) {
    let keys: Vec<String> = ctx
        .db
        .elevator_landing_door()
        .iter()
        .map(|r| r.row_key.clone())
        .collect();
    let tgt = dt * EXT_DOOR_ANIM_SPEED;
    for rk in keys {
        let Some(mut row) = ctx.db.elevator_landing_door().row_key().find(&rk) else {
            continue;
        };
        let goal = if row.desired_open != 0 { 1.0_f32 } else { 0.0_f32 };
        if row.swing_open_01 < goal - 1e-4 {
            row.swing_open_01 = (row.swing_open_01 + tgt).min(goal);
        } else if row.swing_open_01 > goal + 1e-4 {
            row.swing_open_01 = (row.swing_open_01 - tgt).max(goal);
        } else {
            row.swing_open_01 = goal;
        }
        ctx.db.elevator_landing_door().row_key().update(row);
    }
}

/// Merge moving cab floors into walk sampling (geometry top = feet support − skin).
///
/// When `prev_cars` is `Some`, cab support Y is linearly interpolated per car between the
/// tick-start snapshot and the current DB row (integration substeps). `alpha` in `(0, 1]` is
/// the fractional time through the tick (`(i + 1) / n_substeps`). When `prev_cars` is `None`,
/// uses end-of-tick cab positions only (`alpha` ignored).
pub fn merge_elevator_walk_top_lerped(
    ctx: &ReducerContext,
    x: f32,
    z: f32,
    probe_top_y: f32,
    step_up_margin: f32,
    mut best: f32,
    prev_cars: Option<&HashMap<String, ElevatorCar>>,
    alpha: f32,
) -> f32 {
    let fx0 = x - FOOT_R;
    let fx1 = x + FOOT_R;
    let fz0 = z - FOOT_R;
    let fz1 = z + FOOT_R;
    let (ihx, ihz) = elevator_layout::inner_half_xz();
    let iy = elevator_layout::inner_height();
    let a = alpha.clamp(0.0, 1.0);
    let feet_y = probe_top_y - WALK_PROBE_DY;

    for car in ctx.db.elevator_car().iter() {
        let cx = car.plate_x;
        let cz = car.plate_z;
        if fx1 < cx - ihx || fx0 > cx + ihx || fz1 < cz - ihz || fz0 > cz + ihz {
            continue;
        }
        let cab_y = match prev_cars.and_then(|m| m.get(&car.shaft_key)) {
            Some(prev) => prev.cab_floor_y + a * (car.cab_floor_y - prev.cab_floor_y),
            None => car.cab_floor_y,
        };
        // Match client `mergeWalkTop` vertical band (wider than `player_inside_cab`) so a rising
        // car / substep lag does not drop merge for one frame (fall-through).
        if feet_y < cab_y - RIDER_SNAP_FEET_BELOW_CAB_M
            || feet_y > cab_y + iy + RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M
        {
            continue;
        }
        let geom_top = cab_y - SKIN;
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

/// Extra meters past the inner cab AABB on the **door** side (matches client `fpElevatorDoorSideSlackM`).
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

/// Plate-local clamp AABB `(lx_min, lx_max, lz_min, lz_max)` — sync `fpElevatorPlateLocalClampBounds`.
fn cab_plate_local_clamp_bounds(car: &ElevatorCar) -> (f32, f32, f32, f32) {
    let (ihx, ihz) = elevator_layout::inner_half_xz();
    let ext = door_side_slack_m(car.door_open_01);
    let di = CAB_CLAMP_DOOR_AXIS_INNER_FRAC;
    let fc = CAB_CLAMP_FOOT_CLEAR_M;
    let lx_span = (ihx - fc).max(1e-4);
    let lz_span = (ihz - fc).max(1e-4);
    let door_giving_slack = ext > DOOR_SLACK_START + 1e-6;
    match door_face_from_u8(car.door_face) {
        DoorFace::E => {
            let door_cap = ihx * di + ext;
            let lx_max = if door_giving_slack {
                door_cap
            } else {
                door_cap.min(lx_span)
            };
            (-lx_span, lx_max, -lz_span, lz_span)
        }
        DoorFace::W => {
            let door_cap = ihx * di + ext;
            let lx_min = if door_giving_slack {
                -door_cap
            } else {
                (-door_cap).max(-lx_span)
            };
            (lx_min, lx_span, -lz_span, lz_span)
        }
        DoorFace::N => {
            let door_cap = ihz * di + ext;
            let lz_max = if door_giving_slack {
                door_cap
            } else {
                door_cap.min(lz_span)
            };
            (-lx_span, lx_span, -lz_span, lz_max)
        }
        DoorFace::S => {
            let door_cap = ihz * di + ext;
            let lz_min = if door_giving_slack {
                -door_cap
            } else {
                (-door_cap).max(-lz_span)
            };
            (-lx_span, lx_span, lz_min, lz_span)
        }
    }
}

/// Rider / clamp physics volume — matches client `fpElevatorPlateLocalInCabPhysicsVolume`.
fn player_rider_snap_grip(p: &PlayerPose, car: &ElevatorCar) -> bool {
    let lx = p.x - car.plate_x;
    let lz = p.z - car.plate_z;
    let iy = elevator_layout::inner_height();
    if p.y < car.cab_floor_y - RIDER_SNAP_FEET_BELOW_CAB_M
        || p.y > car.cab_floor_y + iy + RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M
    {
        return false;
    }
    let (lx_min, lx_max, lz_min, lz_max) = cab_plate_local_clamp_bounds(car);
    let pad = RIDER_PHYS_GATE_PAD_M;
    lx >= lx_min - pad && lx <= lx_max + pad && lz >= lz_min - pad && lz <= lz_max + pad
}

/// Hard-attach feet to the authoritative cab floor when inside the riding volume.
///
/// Walk merge + probe sampling can still miss for a tick (shaft geometry, long drops); this is the
/// safety net that prevents long falls through a moving car. Skipped while the player is clearly
/// jumping upward so we do not cancel `JUMP_SPEED`.
pub fn snap_inside_cab_feet_to_floor(ctx: &ReducerContext, p: &mut PlayerPose) {
    if p.vel_y > RIDER_LOCK_SKIP_UPWARD_VY_MPS {
        return;
    }
    for car in ctx.db.elevator_car().iter() {
        if !player_rider_snap_grip(p, &car) {
            continue;
        }
        p.y = car.cab_floor_y;
        p.vel_y = 0.0;
        p.grounded = 1;
        return;
    }
}

/// World-space vertical cab velocity (m/s) to add on jump when grounded inside a moving car
/// (matches client `jumpKinematicPlatformVyMps` intent).
pub fn elevator_jump_vertical_boost_mps(
    ctx: &ReducerContext,
    prev_by_key: &HashMap<String, ElevatorCar>,
    p: &PlayerPose,
    dt: f32,
) -> f32 {
    let h = dt.max(1e-4);
    let mut best = 0.0_f32;
    for car in ctx.db.elevator_car().iter() {
        if !player_inside_cab(p, &car) {
            continue;
        }
        let prev_y = prev_by_key
            .get(&car.shaft_key)
            .map(|c| c.cab_floor_y)
            .unwrap_or(car.cab_floor_y);
        best = best.max((car.cab_floor_y - prev_y) / h);
    }
    best
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

/// Plate-local: in padded rider volume but only past the hard AABB on the door-outward face.
/// See client `fpElevatorInDoorOutwardPadShellOnly`.
fn in_door_outward_pad_shell_only(
    door: DoorFace,
    lx: f32,
    lz: f32,
    lx_min: f32,
    lx_max: f32,
    lz_min: f32,
    lz_max: f32,
    pad: f32,
) -> bool {
    match door {
        DoorFace::E => lx > lx_max && lx <= lx_max + pad && lz >= lz_min && lz <= lz_max,
        DoorFace::W => lx < lx_min && lx >= lx_min - pad && lz >= lz_min && lz <= lz_max,
        DoorFace::N => lz > lz_max && lz <= lz_max + pad && lx >= lx_min && lx <= lx_max,
        DoorFace::S => lz < lz_min && lz >= lz_min - pad && lx >= lx_min && lx <= lx_max,
    }
}

/// Keep players from walking through cab shells; relax door side while doors are opening.
///
/// Volume matches `player_rider_snap_grip` / client `fpElevatorPlateLocalInCabPhysicsVolume`.
pub fn clamp_player_to_elevators(ctx: &ReducerContext, p: &mut PlayerPose) {
    for car in ctx.db.elevator_car().iter() {
        if !player_rider_snap_grip(p, &car) {
            continue;
        }
        let (lx_min, lx_max, lz_min, lz_max) = cab_plate_local_clamp_bounds(&car);
        let lx = p.x - car.plate_x;
        let lz = p.z - car.plate_z;
        let pad = RIDER_PHYS_GATE_PAD_M;
        let in_hard = lx >= lx_min && lx <= lx_max && lz >= lz_min && lz <= lz_max;
        if !in_hard
            && car.door_open_01 >= DOOR_EXIT_CLAMP_MIN_OPEN
            && in_door_outward_pad_shell_only(
                door_face_from_u8(car.door_face),
                lx,
                lz,
                lx_min,
                lx_max,
                lz_min,
                lz_max,
                pad,
            )
        {
            continue;
        }
        let xmin = car.plate_x + lx_min;
        let xmax = car.plate_x + lx_max;
        let zmin = car.plate_z + lz_min;
        let zmax = car.plate_z + lz_max;
        let px = p.x;
        let pz = p.z;
        p.x = p.x.clamp(xmin, xmax);
        p.z = p.z.clamp(zmin, zmax);
        if p.x > px && p.vel_x < 0.0 {
            p.vel_x = 0.0;
        }
        if p.x < px && p.vel_x > 0.0 {
            p.vel_x = 0.0;
        }
        if p.z > pz && p.vel_z < 0.0 {
            p.vel_z = 0.0;
        }
        if p.z < pz && p.vel_z > 0.0 {
            p.vel_z = 0.0;
        }
    }
}

fn exterior_plate_local_in_slab(
    door: DoorFace,
    hx: f32,
    hz: f32,
    lx: f32,
    lz: f32,
    py: f32,
    landing_feet_y: f32,
    l0: f32,
    l1: f32,
    lz_pad: f32,
) -> bool {
    let y0 = landing_feet_y + EXT_STRIP_Y0;
    let y1 = landing_feet_y + EXT_STRIP_Y1;
    if py < y0 || py > y1 {
        return false;
    }
    let zspan = EXT_DOOR_W * 0.5 + lz_pad;
    match door {
        DoorFace::E => {
            let lo = hx + l0;
            let hi = hx + l1;
            lx >= lo && lx <= hi && lz.abs() <= zspan
        }
        DoorFace::W => {
            let lo = -hx - l1;
            let hi = -hx - l0;
            lx >= lo && lx <= hi && lz.abs() <= zspan
        }
        DoorFace::N => {
            let lo = hz + l0;
            let hi = hz + l1;
            lz >= lo && lz <= hi && lx.abs() <= zspan
        }
        DoorFace::S => {
            let lo = -hz - l1;
            let hi = -hz - l0;
            lz >= lo && lz <= hi && lx.abs() <= zspan
        }
    }
}

#[inline]
fn exterior_interact_plate_local_ok(
    door: DoorFace,
    hx: f32,
    hz: f32,
    lx: f32,
    lz: f32,
    py: f32,
    landing_feet_y: f32,
) -> bool {
    exterior_plate_local_in_slab(
        door,
        hx,
        hz,
        lx,
        lz,
        py,
        landing_feet_y,
        EXT_INTERACT_L0,
        EXT_INTERACT_L1,
        EXT_INTERACT_LZ_PAD,
    )
}

#[inline]
fn exterior_collision_plate_local_ok(
    door: DoorFace,
    hx: f32,
    hz: f32,
    lx: f32,
    lz: f32,
    py: f32,
    landing_feet_y: f32,
) -> bool {
    exterior_plate_local_in_slab(
        door,
        hx,
        hz,
        lx,
        lz,
        py,
        landing_feet_y,
        EXT_COLLISION_L0,
        EXT_COLLISION_L1,
        EXT_COLLISION_LZ_PAD,
    )
}

fn near_exterior_door_toggle_pose(p: &PlayerPose, spec: &ElevShaftSpec, level: u32) -> bool {
    let (hx, hz) = elevator_layout::inner_half_xz();
    let lx = p.x - spec.plate_x;
    let lz = p.z - spec.plate_z;
    let fy = support_y(level);
    exterior_interact_plate_local_ok(spec.door, hx, hz, lx, lz, p.y, fy)
}

fn in_closed_cab_outside_door_slab(door: DoorFace, hx: f32, hz: f32, lx: f32, lz: f32) -> bool {
    let door_half = EXT_DOOR_W * 0.5 + CLOSED_CAB_OUTSIDE_WIDTH_PAD;
    match door {
        DoorFace::E => {
            lx >= hx - CLOSED_CAB_OUTSIDE_SLAB_IN
                && lx <= hx + CLOSED_CAB_OUTSIDE_SLAB_OUT
                && lz.abs() <= door_half
        }
        DoorFace::W => {
            lx <= -hx + CLOSED_CAB_OUTSIDE_SLAB_IN
                && lx >= -hx - CLOSED_CAB_OUTSIDE_SLAB_OUT
                && lz.abs() <= door_half
        }
        DoorFace::N => {
            lz >= hz - CLOSED_CAB_OUTSIDE_SLAB_IN
                && lz <= hz + CLOSED_CAB_OUTSIDE_SLAB_OUT
                && lx.abs() <= door_half
        }
        DoorFace::S => {
            lz <= -hz + CLOSED_CAB_OUTSIDE_SLAB_IN
                && lz >= -hz - CLOSED_CAB_OUTSIDE_SLAB_OUT
                && lx.abs() <= door_half
        }
    }
}

/// Solid threshold while the swing door is mostly closed — sync client `fpElevExteriorDoorBlocksAtPose`.
pub fn clamp_player_exterior_landing_doors(ctx: &ReducerContext, p: &mut PlayerPose) {
    let (hx, hz) = elevator_layout::inner_half_xz();
    for row in ctx.db.elevator_landing_door().iter() {
        if row.swing_open_01 >= EXT_DOOR_COLLISION_OPEN_THRESH {
            continue;
        }
        let Some(spec) = spec_for_key(&row.shaft_key) else {
            continue;
        };
        let fy = support_y(row.level);
        let y0 = fy + EXT_STRIP_Y0;
        let y1 = fy + EXT_STRIP_Y1;
        if p.y < y0 || p.y > y1 {
            continue;
        }
        let lx = p.x - spec.plate_x;
        let lz = p.z - spec.plate_z;
        let door = spec.door;
        let in_slab = exterior_collision_plate_local_ok(door, hx, hz, lx, lz, p.y, fy);
        if !in_slab {
            continue;
        }
        let px = p.x;
        let pz = p.z;
        match door {
            DoorFace::E => {
                let lo = spec.plate_x + hx + EXT_COLLISION_L0;
                let hi = spec.plate_x + hx + EXT_COLLISION_L1;
                let dl = p.x - lo;
                let dr = hi - p.x;
                p.x = if dl < dr { lo - 0.07 } else { hi + 0.08 };
            }
            DoorFace::W => {
                let lo = spec.plate_x - hx - EXT_COLLISION_L1;
                let hi = spec.plate_x - hx - EXT_COLLISION_L0;
                let dl = p.x - lo;
                let dr = hi - p.x;
                p.x = if dl < dr { lo - 0.08 } else { hi + 0.07 };
            }
            DoorFace::N => {
                let lo = spec.plate_z + hz + EXT_COLLISION_L0;
                let hi = spec.plate_z + hz + EXT_COLLISION_L1;
                let dl = p.z - lo;
                let dr = hi - p.z;
                p.z = if dl < dr { lo - 0.07 } else { hi + 0.08 };
            }
            DoorFace::S => {
                let lo = spec.plate_z - hz - EXT_COLLISION_L1;
                let hi = spec.plate_z - hz - EXT_COLLISION_L0;
                let dl = p.z - lo;
                let dr = hi - p.z;
                p.z = if dl < dr { lo - 0.08 } else { hi + 0.07 };
            }
        }
        if p.x > px && p.vel_x < 0.0 {
            p.vel_x = 0.0;
        }
        if p.x < px && p.vel_x > 0.0 {
            p.vel_x = 0.0;
        }
        if p.z > pz && p.vel_z < 0.0 {
            p.vel_z = 0.0;
        }
        if p.z < pz && p.vel_z > 0.0 {
            p.vel_z = 0.0;
        }
    }
}

/// Closed automatic cab doors block hallway-side entry as well as rider-side exit.
pub fn clamp_player_against_closed_cab_doors_from_outside(ctx: &ReducerContext, p: &mut PlayerPose) {
    let (hx, hz) = elevator_layout::inner_half_xz();
    let iy = elevator_layout::inner_height();
    for car in ctx.db.elevator_car().iter() {
        if car.door_open_01 >= DOOR_EXIT_CLAMP_MIN_OPEN {
            continue;
        }
        let y0 = car.cab_floor_y - 0.22;
        let y1 = car.cab_floor_y + iy + 0.38;
        if p.y < y0 || p.y > y1 {
            continue;
        }
        let lx = p.x - car.plate_x;
        let lz = p.z - car.plate_z;
        let door = door_face_from_u8(car.door_face);
        if !in_closed_cab_outside_door_slab(door, hx, hz, lx, lz) {
            continue;
        }
        let px = p.x;
        let pz = p.z;
        match door {
            DoorFace::E => p.x = car.plate_x + hx + CLOSED_CAB_OUTSIDE_SLAB_OUT + 0.08,
            DoorFace::W => p.x = car.plate_x - hx - CLOSED_CAB_OUTSIDE_SLAB_OUT - 0.08,
            DoorFace::N => p.z = car.plate_z + hz + CLOSED_CAB_OUTSIDE_SLAB_OUT + 0.08,
            DoorFace::S => p.z = car.plate_z - hz - CLOSED_CAB_OUTSIDE_SLAB_OUT - 0.08,
        }
        if p.x > px && p.vel_x < 0.0 {
            p.vel_x = 0.0;
        }
        if p.x < px && p.vel_x > 0.0 {
            p.vel_x = 0.0;
        }
        if p.z > pz && p.vel_z < 0.0 {
            p.vel_z = 0.0;
        }
        if p.z < pz && p.vel_z > 0.0 {
            p.vel_z = 0.0;
        }
    }
}

#[cfg(test)]
mod landing_hail_redundant_tests {
    use super::{landing_hail_redundant_for_cab_pose, support_y, ElevatorCar, PH_IDLE, PH_MOVING};

    fn sample_row(phase: u8, cab_floor_y: f32) -> ElevatorCar {
        ElevatorCar {
            shaft_key: "test_shaft".into(),
            current_level: 1,
            door_open_01: 1.0,
            phase,
            move_from_level: 1,
            move_to_level: 1,
            move_u: 0.0,
            dest_queue: Vec::new(),
            cab_floor_y,
            door_face: 0,
            plate_x: 0.0,
            plate_z: 0.0,
        }
    }

    #[test]
    fn redundant_when_idle_and_cab_y_matches_level_support() {
        let y1 = support_y(1);
        assert!(landing_hail_redundant_for_cab_pose(
            &sample_row(PH_IDLE, y1 + 0.1),
            1
        ));
    }

    #[test]
    fn not_redundant_while_moving_even_if_current_level_matches() {
        let y1 = support_y(1);
        assert!(!landing_hail_redundant_for_cab_pose(
            &sample_row(PH_MOVING, y1 + 0.1),
            1
        ));
    }

    #[test]
    fn not_redundant_when_cab_vertically_far_from_that_landing() {
        let y1 = support_y(1);
        assert!(!landing_hail_redundant_for_cab_pose(
            &sample_row(PH_IDLE, y1 + 3.0),
            1
        ));
    }
}

#[cfg(test)]
mod exterior_interact_tests {
    use super::{exterior_interact_plate_local_ok, support_y, EXT_INTERACT_L0, EXT_INTERACT_L1};
    use crate::elevator_layout::{inner_half_xz, DoorFace};

    #[test]
    fn east_mid_strip_accepted() {
        let (hx, hz) = inner_half_xz();
        let fy = support_y(1);
        let py = fy + 1.0;
        let lx = hx + (EXT_INTERACT_L0 + EXT_INTERACT_L1) * 0.5;
        assert!(exterior_interact_plate_local_ok(
            DoorFace::E, hx, hz, lx, 0.0, py, fy
        ));
    }

    #[test]
    fn east_far_along_z_rejected() {
        let (hx, hz) = inner_half_xz();
        let fy = support_y(1);
        let py = fy + 1.0;
        let lx = hx;
        assert!(!exterior_interact_plate_local_ok(DoorFace::E, hx, hz, lx, 2.0, py, fy));
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
    if landing_hail_redundant_for_cab_pose(&row, lv) {
        return;
    }
    enqueue_dest(&mut row, lv);
    ctx.db.elevator_car().shaft_key().update(row);
}

#[spacetimedb::reducer]
pub fn elevator_landing_exterior_door_toggle(ctx: &ReducerContext, shaft_key: String, level: u32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("elevator_landing_exterior_door_toggle blocked: {e}");
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
    if !near_exterior_door_toggle_pose(&pose, spec, lv) {
        return;
    }
    let rk = landing_door_row_key(&shaft_key, lv);
    let mut row = ctx
        .db
        .elevator_landing_door()
        .row_key()
        .find(&rk)
        .unwrap_or(ElevatorLandingDoor {
            row_key: rk.clone(),
            shaft_key: shaft_key.clone(),
            level: lv,
            desired_open: 0,
            swing_open_01: 0.0,
        });
    row.desired_open = if row.desired_open != 0 { 0 } else { 1 };
    if ctx.db.elevator_landing_door().row_key().find(&rk).is_some() {
        ctx.db.elevator_landing_door().row_key().update(row);
    } else {
        let _ = ctx.db.elevator_landing_door().insert(row);
    }
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

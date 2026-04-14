//! Authoritative elevator cars (shared state) + walk/collision hooks for the movement tick.

use std::collections::HashMap;

use spacetimedb::{ReducerContext, Table};

use crate::auth;
use crate::elevator_layout::{
    self, DoorFace, ElevShaftSpec, BUILDING_ORIGIN_Y, MAMUTH_ELEVATOR_SPECS, SKIN,
    STOREY_SPACING_M,
};
use crate::kinematic_support::{self, KinematicAttachment, KinematicSupportSurface};
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
/// Static exterior collision slab + `clamp_player_exterior_landing_doors` only while the swing
/// is essentially closed. Mid-swing the slab does not follow the mesh, so skip player collision.
const EXT_DOOR_SOLID_SLAB_MAX_SWING: f32 = 0.025;
/// **E** interact strip (plate-local, door normal). Must extend past the closed-door push-out. Sync client `EXTERIOR_INTERACT_*`.
#[allow(dead_code)]
const EXT_INTERACT_L0: f32 = -0.28;
#[allow(dead_code)]
const EXT_INTERACT_L1: f32 = 0.82;
#[allow(dead_code)]
const EXT_INTERACT_LZ_PAD: f32 = 0.08;
/// Closed-door **physics** slab. Sync client `EXTERIOR_COLLISION_*`.
const EXT_COLLISION_L0: f32 = -0.55;
const EXT_COLLISION_L1: f32 = 0.92;
const EXT_COLLISION_LZ_PAD: f32 = 0.18;
const EXT_STRIP_Y0: f32 = 0.05;
const EXT_STRIP_Y1: f32 = 2.25;
const EXT_INTERACT_WORLD_RADIUS_M: f32 = 1.6;
const EXT_INTERACT_WORLD_Y_HALF_M: f32 = 1.3;
/// Hallway-side blocker for a mostly closed automatic cab door.
const CLOSED_CAB_OUTSIDE_SLAB_IN: f32 = 0.28;
const CLOSED_CAB_OUTSIDE_SLAB_OUT: f32 = 1.05;
const CLOSED_CAB_OUTSIDE_WIDTH_PAD: f32 = 0.32;
const LANDING_FRONT_WALL_SLAB_IN: f32 = 0.2;
const LANDING_FRONT_WALL_SLAB_OUT: f32 = 0.34;
#[allow(dead_code)]
const LANDING_FRONT_WALL_PUSH_OUT: f32 = 0.08;
const LANDING_FRONT_PASSAGE_HALF_W: f32 = EXT_DOOR_W * 0.5 + 0.04;
const LANDING_PASSAGE_DOCK_Y_TOL_M: f32 = 0.5;
const PLAYER_HEIGHT_STAND_M: f32 = 1.78;
const PLAYER_HEIGHT_CROUCH_M: f32 = 1.2;
const COLLISION_EPS: f32 = 0.0015;
const STEP_IGNORE_BELOW_FEET_M: f32 = 0.2;

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
        && row.door_open_01 >= 0.92
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
pub fn sample_elevator_kinematic_support_surface_lerped(
    ctx: &ReducerContext,
    x: f32,
    z: f32,
    probe_top_y: f32,
    step_up_margin: f32,
    prev_cars: Option<&HashMap<String, ElevatorCar>>,
    alpha: f32,
    tick_dt: f32,
) -> Option<KinematicSupportSurface> {
    let fx0 = x - FOOT_R;
    let fx1 = x + FOOT_R;
    let fz0 = z - FOOT_R;
    let fz1 = z + FOOT_R;
    let (ihx, ihz) = elevator_layout::inner_half_xz();
    let iy = elevator_layout::inner_height();
    let a = alpha.clamp(0.0, 1.0);
    let feet_y = probe_top_y - WALK_PROBE_DY;
    let mut best_top = f32::NEG_INFINITY;
    let mut best_vy = 0.0_f32;
    let h = tick_dt.max(1e-4);

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
        let prev_y = prev_cars
            .and_then(|m| m.get(&car.shaft_key))
            .map(|prev| prev.cab_floor_y)
            .unwrap_or(car.cab_floor_y);
        // Match client `mergeWalkTop` vertical band (wider than `player_inside_cab`) so a rising
        // car / substep lag does not drop merge for one frame (fall-through).
        if feet_y < cab_y - RIDER_SNAP_FEET_BELOW_CAB_M
            || feet_y > cab_y + iy + RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M
        {
            continue;
        }
        let geom_top = cab_y - SKIN;
        if geom_top <= probe_top_y + step_up_margin {
            if geom_top > best_top + 1e-5 {
                best_top = geom_top;
                best_vy = (car.cab_floor_y - prev_y) / h;
            }
        }
    }
    if best_top == f32::NEG_INFINITY {
        None
    } else {
        Some(KinematicSupportSurface {
            top_y: best_top,
            vertical_velocity_mps: best_vy,
        })
    }
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

fn resolve_elevator_kinematic_attachment(
    p: &PlayerPose,
    car: &ElevatorCar,
) -> Option<KinematicAttachment> {
    if !player_rider_snap_grip(p, car) {
        return None;
    }
    let (lx_min, lx_max, lz_min, lz_max) = cab_plate_local_clamp_bounds(car);
    let lx = p.x - car.plate_x;
    let lz = p.z - car.plate_z;
    let pad = RIDER_PHYS_GATE_PAD_M;
    let in_hard = lx >= lx_min && lx <= lx_max && lz >= lz_min && lz <= lz_max;
    let clamp_bounds_xz = if !in_hard
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
        ) {
        None
    } else {
        Some((
            car.plate_x + lx_min,
            car.plate_x + lx_max,
            car.plate_z + lz_min,
            car.plate_z + lz_max,
        ))
    };
    Some(KinematicAttachment {
        support_y: car.cab_floor_y,
        clamp_bounds_xz,
    })
}

fn find_elevator_kinematic_attachment(
    ctx: &ReducerContext,
    p: &PlayerPose,
) -> Option<KinematicAttachment> {
    for car in ctx.db.elevator_car().iter() {
        if let Some(attachment) = resolve_elevator_kinematic_attachment(p, &car) {
            return Some(attachment);
        }
    }
    None
}

/// Hard-attach feet to the authoritative moving support when inside the elevator riding volume.
pub fn snap_player_to_elevator_kinematic_support(ctx: &ReducerContext, p: &mut PlayerPose) {
    let attachment = find_elevator_kinematic_attachment(ctx, p);
    let _ = kinematic_support::snap_attached_feet_to_support(
        p,
        attachment.as_ref(),
        RIDER_LOCK_SKIP_UPWARD_VY_MPS,
    );
}

/// Keep attached riders inside the hard cab bounds while still allowing clean doorway exits.
pub fn clamp_player_to_elevator_kinematic_support(ctx: &ReducerContext, p: &mut PlayerPose) {
    let attachment = find_elevator_kinematic_attachment(ctx, p);
    let _ = kinematic_support::clamp_attached_body_xz(p, attachment.as_ref());
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
    lateral_half: f32,
) -> bool {
    let y0 = landing_feet_y + EXT_STRIP_Y0;
    let y1 = landing_feet_y + EXT_STRIP_Y1;
    if py < y0 || py > y1 {
        return false;
    }
    match door {
        DoorFace::E => {
            let lo = hx + l0;
            let hi = hx + l1;
            lx >= lo && lx <= hi && lz.abs() <= lateral_half
        }
        DoorFace::W => {
            let lo = -hx - l1;
            let hi = -hx - l0;
            lx >= lo && lx <= hi && lz.abs() <= lateral_half
        }
        DoorFace::N => {
            let lo = hz + l0;
            let hi = hz + l1;
            lz >= lo && lz <= hi && lx.abs() <= lateral_half
        }
        DoorFace::S => {
            let lo = -hz - l1;
            let hi = -hz - l0;
            lz >= lo && lz <= hi && lx.abs() <= lateral_half
        }
    }
}

#[inline]
fn face_lateral_half(door: DoorFace, hx: f32, hz: f32) -> f32 {
    match door {
        DoorFace::E | DoorFace::W => hz,
        DoorFace::N | DoorFace::S => hx,
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
        EXT_DOOR_W * 0.5 + EXT_INTERACT_LZ_PAD,
    )
}

#[inline]
#[allow(dead_code)]
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
        face_lateral_half(door, hx, hz) + EXT_COLLISION_LZ_PAD,
    )
}

fn near_exterior_door_toggle_pose(p: &PlayerPose, spec: &ElevShaftSpec, level: u32) -> bool {
    let (hx, hz) = elevator_layout::inner_half_xz();
    let fy = support_y(level);
    let lx = p.x - spec.plate_x;
    let lz = p.z - spec.plate_z;
    if exterior_interact_plate_local_ok(spec.door, hx, hz, lx, lz, p.y, fy) {
        return true;
    }
    let cy = fy + 1.1;
    let (cx_out, cz_out, cx_in, cz_in) = match spec.door {
        DoorFace::E => (
            spec.plate_x + hx + 0.18,
            spec.plate_z,
            spec.plate_x + hx - 0.18,
            spec.plate_z,
        ),
        DoorFace::W => (
            spec.plate_x - hx - 0.18,
            spec.plate_z,
            spec.plate_x - hx + 0.18,
            spec.plate_z,
        ),
        DoorFace::N => (
            spec.plate_x,
            spec.plate_z + hz + 0.18,
            spec.plate_x,
            spec.plate_z + hz - 0.18,
        ),
        DoorFace::S => (
            spec.plate_x,
            spec.plate_z - hz - 0.18,
            spec.plate_x,
            spec.plate_z - hz + 0.18,
        ),
    };
    (((p.x - cx_out).hypot(p.z - cz_out) <= EXT_INTERACT_WORLD_RADIUS_M)
        || ((p.x - cx_in).hypot(p.z - cz_in) <= EXT_INTERACT_WORLD_RADIUS_M))
        && (p.y - cy).abs() <= EXT_INTERACT_WORLD_Y_HALF_M
}

fn exterior_door_toggle_pose_score(p: &PlayerPose, spec: &ElevShaftSpec, level: u32) -> f32 {
    let (hx, hz) = elevator_layout::inner_half_xz();
    let fy = support_y(level);
    let lx = p.x - spec.plate_x;
    let lz = p.z - spec.plate_z;
    let (cx_out, cz_out, cx_in, cz_in) = match spec.door {
        DoorFace::E => (
            spec.plate_x + hx + 0.18,
            spec.plate_z,
            spec.plate_x + hx - 0.18,
            spec.plate_z,
        ),
        DoorFace::W => (
            spec.plate_x - hx - 0.18,
            spec.plate_z,
            spec.plate_x - hx + 0.18,
            spec.plate_z,
        ),
        DoorFace::N => (
            spec.plate_x,
            spec.plate_z + hz + 0.18,
            spec.plate_x,
            spec.plate_z + hz - 0.18,
        ),
        DoorFace::S => (
            spec.plate_x,
            spec.plate_z - hz - 0.18,
            spec.plate_x,
            spec.plate_z - hz + 0.18,
        ),
    };
    let d_out = (p.x - cx_out).hypot(p.z - cz_out);
    let d_in = (p.x - cx_in).hypot(p.z - cz_in);
    if exterior_interact_plate_local_ok(spec.door, hx, hz, lx, lz, p.y, fy) {
        return d_out.min(d_in);
    }
    let cy = fy + 1.1;
    d_out.min(d_in) + (p.y - cy).abs() * 0.5
}

fn resolve_exterior_door_toggle_target(
    p: &PlayerPose,
    requested_shaft_key: &str,
    requested_level: u32,
) -> Option<(&'static ElevShaftSpec, u32)> {
    let requested_level = requested_level.clamp(1, MAX_LEVEL);
    if let Some(spec) = spec_for_key(requested_shaft_key) {
        if near_exterior_door_toggle_pose(p, spec, requested_level) {
            return Some((spec, requested_level));
        }
    }

    let mut best: Option<(&'static ElevShaftSpec, u32, f32)> = None;
    for spec in MAMUTH_ELEVATOR_SPECS {
        for level in 1..=MAX_LEVEL {
            if !near_exterior_door_toggle_pose(p, spec, level) {
                continue;
            }
            let score = exterior_door_toggle_pose_score(p, spec, level);
            if best.is_none_or(|(_, _, best_score)| score < best_score) {
                best = Some((spec, level, score));
            }
        }
    }
    best.map(|(spec, level, _)| (spec, level))
}

fn set_landing_exterior_door_desired_open(
    ctx: &ReducerContext,
    pose: &PlayerPose,
    requested_shaft_key: &str,
    requested_level: u32,
    desired_open: u8,
) {
    let Some((spec, lv)) =
        resolve_exterior_door_toggle_target(pose, requested_shaft_key, requested_level)
    else {
        return;
    };
    let target_shaft_key = spec.shaft_key.to_string();
    let Some(car) = ctx.db.elevator_car().shaft_key().find(&target_shaft_key) else {
        return;
    };
    if player_inside_cab(pose, &car) && car.phase == PH_MOVING {
        return;
    }
    // Do not use `current_level` alone: it can desync from `cab_floor_y` while the car is still
    // physically docked at this landing. Require cab feet alignment to the resolved landing.
    if player_inside_cab(pose, &car)
        && (car.cab_floor_y - support_y(lv)).abs() > LANDING_PASSAGE_DOCK_Y_TOL_M
    {
        return;
    }
    let rk = landing_door_row_key(&target_shaft_key, lv);
    let mut row = ctx
        .db
        .elevator_landing_door()
        .row_key()
        .find(&rk)
        .unwrap_or(ElevatorLandingDoor {
            row_key: rk.clone(),
            shaft_key: target_shaft_key.clone(),
            level: lv,
            desired_open: 0,
            swing_open_01: 0.0,
        });
    row.desired_open = if desired_open != 0 { 1 } else { 0 };
    if ctx.db.elevator_landing_door().row_key().find(&rk).is_some() {
        ctx.db.elevator_landing_door().row_key().update(row);
    } else {
        let _ = ctx.db.elevator_landing_door().insert(row);
    }
}

#[inline]
#[allow(dead_code)]
fn landing_front_face_local_ok(door: DoorFace, outer_hx: f32, outer_hz: f32, lx: f32, lz: f32) -> bool {
    match door {
        DoorFace::E => {
            lx >= outer_hx - LANDING_FRONT_WALL_SLAB_IN
                && lx <= outer_hx + LANDING_FRONT_WALL_SLAB_OUT
                && lz.abs() <= outer_hz
        }
        DoorFace::W => {
            lx <= -outer_hx + LANDING_FRONT_WALL_SLAB_IN
                && lx >= -outer_hx - LANDING_FRONT_WALL_SLAB_OUT
                && lz.abs() <= outer_hz
        }
        DoorFace::N => {
            lz >= outer_hz - LANDING_FRONT_WALL_SLAB_IN
                && lz <= outer_hz + LANDING_FRONT_WALL_SLAB_OUT
                && lx.abs() <= outer_hx
        }
        DoorFace::S => {
            lz <= -outer_hz + LANDING_FRONT_WALL_SLAB_IN
                && lz >= -outer_hz - LANDING_FRONT_WALL_SLAB_OUT
                && lx.abs() <= outer_hx
        }
    }
}

#[inline]
#[allow(dead_code)]
fn landing_front_door_lane_local_ok(
    door: DoorFace,
    outer_hx: f32,
    outer_hz: f32,
    lx: f32,
    lz: f32,
) -> bool {
    if !landing_front_face_local_ok(door, outer_hx, outer_hz, lx, lz) {
        return false;
    }
    match door {
        DoorFace::E | DoorFace::W => lz.abs() <= LANDING_FRONT_PASSAGE_HALF_W,
        DoorFace::N | DoorFace::S => lx.abs() <= LANDING_FRONT_PASSAGE_HALF_W,
    }
}

#[inline]
fn landing_front_passage_open(
    landing: &ElevatorLandingDoor,
    car: &ElevatorCar,
    landing_feet_y: f32,
) -> bool {
    landing.swing_open_01 >= EXT_DOOR_COLLISION_OPEN_THRESH
        && car.current_level == landing.level
        && (car.cab_floor_y - landing_feet_y).abs() <= LANDING_PASSAGE_DOCK_Y_TOL_M
        && car.door_open_01 >= DOOR_EXIT_CLAMP_MIN_OPEN
}

#[allow(dead_code)]
fn in_closed_cab_outside_door_slab(door: DoorFace, hx: f32, hz: f32, lx: f32, lz: f32) -> bool {
    let door_half = face_lateral_half(door, hx, hz) + CLOSED_CAB_OUTSIDE_WIDTH_PAD;
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

#[derive(Clone, Copy)]
struct CollisionAabb {
    min: [f32; 3],
    max: [f32; 3],
}

#[inline]
fn player_body_height(crouch: bool) -> f32 {
    if crouch {
        PLAYER_HEIGHT_CROUCH_M
    } else {
        PLAYER_HEIGHT_STAND_M
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
    top_y <= feet_y + 0.82 + 1e-4 && top_y >= feet_y - STEP_IGNORE_BELOW_FEET_M
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
        if car.door_open_01 >= DOOR_EXIT_CLAMP_MIN_OPEN {
            continue;
        }
        let door_half = face_lateral_half(door_face_from_u8(car.door_face), hx, hz) + CLOSED_CAB_OUTSIDE_WIDTH_PAD;
        let y0 = car.cab_floor_y - 0.22;
        let y1 = car.cab_floor_y + iy + 0.38;
        match door_face_from_u8(car.door_face) {
            DoorFace::E => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x + hx - CLOSED_CAB_OUTSIDE_SLAB_IN, y0, car.plate_z - door_half],
                [car.plate_x + hx + CLOSED_CAB_OUTSIDE_SLAB_OUT, y1, car.plate_z + door_half],
            ),
            DoorFace::W => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x - hx - CLOSED_CAB_OUTSIDE_SLAB_OUT, y0, car.plate_z - door_half],
                [car.plate_x - hx + CLOSED_CAB_OUTSIDE_SLAB_IN, y1, car.plate_z + door_half],
            ),
            DoorFace::N => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x - door_half, y0, car.plate_z + hz - CLOSED_CAB_OUTSIDE_SLAB_IN],
                [car.plate_x + door_half, y1, car.plate_z + hz + CLOSED_CAB_OUTSIDE_SLAB_OUT],
            ),
            DoorFace::S => push_query_overlapping_aabb(
                out,
                x0,
                x1,
                z0,
                z1,
                [car.plate_x - door_half, y0, car.plate_z - hz - CLOSED_CAB_OUTSIDE_SLAB_OUT],
                [car.plate_x + door_half, y1, car.plate_z - hz + CLOSED_CAB_OUTSIDE_SLAB_IN],
            ),
        }
    }

    for landing in ctx.db.elevator_landing_door().iter() {
        let Some(spec) = spec_for_key(&landing.shaft_key) else {
            continue;
        };
        let Some(car) = ctx.db.elevator_car().shaft_key().find(&landing.shaft_key) else {
            continue;
        };
        let fy = support_y(landing.level);
        let y0 = fy + EXT_STRIP_Y0;
        let y1 = fy + EXT_STRIP_Y1;
        if landing.swing_open_01 <= EXT_DOOR_SOLID_SLAB_MAX_SWING {
            match spec.door {
                DoorFace::E => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x + hx + EXT_COLLISION_L0, y0, spec.plate_z - (hz + EXT_COLLISION_LZ_PAD)],
                    [spec.plate_x + hx + EXT_COLLISION_L1, y1, spec.plate_z + (hz + EXT_COLLISION_LZ_PAD)],
                ),
                DoorFace::W => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x - hx - EXT_COLLISION_L1, y0, spec.plate_z - (hz + EXT_COLLISION_LZ_PAD)],
                    [spec.plate_x - hx - EXT_COLLISION_L0, y1, spec.plate_z + (hz + EXT_COLLISION_LZ_PAD)],
                ),
                DoorFace::N => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x - (hx + EXT_COLLISION_LZ_PAD), y0, spec.plate_z + hz + EXT_COLLISION_L0],
                    [spec.plate_x + (hx + EXT_COLLISION_LZ_PAD), y1, spec.plate_z + hz + EXT_COLLISION_L1],
                ),
                DoorFace::S => push_query_overlapping_aabb(
                    out,
                    x0,
                    x1,
                    z0,
                    z1,
                    [spec.plate_x - (hx + EXT_COLLISION_LZ_PAD), y0, spec.plate_z - hz - EXT_COLLISION_L1],
                    [spec.plate_x + (hx + EXT_COLLISION_LZ_PAD), y1, spec.plate_z - hz - EXT_COLLISION_L0],
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
                let min_x = spec.plate_x + outer_hx - LANDING_FRONT_WALL_SLAB_IN;
                let max_x = spec.plate_x + outer_hx + LANDING_FRONT_WALL_SLAB_OUT;
                if !passage_open || LANDING_FRONT_PASSAGE_HALF_W >= outer_hz {
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
                        [max_x, wall_y1, spec.plate_z - LANDING_FRONT_PASSAGE_HALF_W],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z + LANDING_FRONT_PASSAGE_HALF_W],
                        [max_x, wall_y1, spec.plate_z + outer_hz],
                    );
                }
            }
            DoorFace::W => {
                let min_x = spec.plate_x - outer_hx - LANDING_FRONT_WALL_SLAB_OUT;
                let max_x = spec.plate_x - outer_hx + LANDING_FRONT_WALL_SLAB_IN;
                if !passage_open || LANDING_FRONT_PASSAGE_HALF_W >= outer_hz {
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
                        [max_x, wall_y1, spec.plate_z - LANDING_FRONT_PASSAGE_HALF_W],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [min_x, wall_y0, spec.plate_z + LANDING_FRONT_PASSAGE_HALF_W],
                        [max_x, wall_y1, spec.plate_z + outer_hz],
                    );
                }
            }
            DoorFace::N => {
                let min_z = spec.plate_z + outer_hz - LANDING_FRONT_WALL_SLAB_IN;
                let max_z = spec.plate_z + outer_hz + LANDING_FRONT_WALL_SLAB_OUT;
                if !passage_open || LANDING_FRONT_PASSAGE_HALF_W >= outer_hx {
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
                        [spec.plate_x - LANDING_FRONT_PASSAGE_HALF_W, wall_y1, max_z],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x + LANDING_FRONT_PASSAGE_HALF_W, wall_y0, min_z],
                        [spec.plate_x + outer_hx, wall_y1, max_z],
                    );
                }
            }
            DoorFace::S => {
                let min_z = spec.plate_z - outer_hz - LANDING_FRONT_WALL_SLAB_OUT;
                let max_z = spec.plate_z - outer_hz + LANDING_FRONT_WALL_SLAB_IN;
                if !passage_open || LANDING_FRONT_PASSAGE_HALF_W >= outer_hx {
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
                        [spec.plate_x - LANDING_FRONT_PASSAGE_HALF_W, wall_y1, max_z],
                    );
                    push_query_overlapping_aabb(
                        out,
                        x0,
                        x1,
                        z0,
                        z1,
                        [spec.plate_x + LANDING_FRONT_PASSAGE_HALF_W, wall_y0, min_z],
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
    _prev_y: f32,
    prev_z: f32,
    crouch: bool,
) {
    let r = FOOT_R;
    let body_h = player_body_height(crouch);
    let mut aabbs = Vec::<CollisionAabb>::new();

    {
        let mut resolved_x = p.x;
        aabbs.clear();
        collect_generated_collision_aabbs(
            ctx,
            prev_x.min(p.x) - r - COLLISION_EPS,
            prev_x.max(p.x) + r + COLLISION_EPS,
            p.z - r - COLLISION_EPS,
            p.z + r + COLLISION_EPS,
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
            if prev_max <= aabb.min[0] + COLLISION_EPS {
                resolved_x = resolved_x.min(aabb.min[0] - r - COLLISION_EPS);
                if p.vel_x > 0.0 {
                    p.vel_x = 0.0;
                }
                continue;
            }
            if prev_min >= aabb.max[0] - COLLISION_EPS {
                resolved_x = resolved_x.max(aabb.max[0] + r + COLLISION_EPS);
                if p.vel_x < 0.0 {
                    p.vel_x = 0.0;
                }
                continue;
            }
            let push_lo = (body_max - aabb.min[0]).abs();
            let push_hi = (aabb.max[0] - body_min).abs();
            if push_lo <= push_hi {
                resolved_x = resolved_x.min(aabb.min[0] - r - COLLISION_EPS);
                if p.vel_x > 0.0 {
                    p.vel_x = 0.0;
                }
            } else {
                resolved_x = resolved_x.max(aabb.max[0] + r + COLLISION_EPS);
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
            p.x - r - COLLISION_EPS,
            p.x + r + COLLISION_EPS,
            prev_z.min(p.z) - r - COLLISION_EPS,
            prev_z.max(p.z) + r + COLLISION_EPS,
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
            if prev_max <= aabb.min[2] + COLLISION_EPS {
                resolved_z = resolved_z.min(aabb.min[2] - r - COLLISION_EPS);
                if p.vel_z > 0.0 {
                    p.vel_z = 0.0;
                }
                continue;
            }
            if prev_min >= aabb.max[2] - COLLISION_EPS {
                resolved_z = resolved_z.max(aabb.max[2] + r + COLLISION_EPS);
                if p.vel_z < 0.0 {
                    p.vel_z = 0.0;
                }
                continue;
            }
            let push_lo = (body_max - aabb.min[2]).abs();
            let push_hi = (aabb.max[2] - body_min).abs();
            if push_lo <= push_hi {
                resolved_z = resolved_z.min(aabb.min[2] - r - COLLISION_EPS);
                if p.vel_z > 0.0 {
                    p.vel_z = 0.0;
                }
            } else {
                resolved_z = resolved_z.max(aabb.max[2] + r + COLLISION_EPS);
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
            p.x - r - COLLISION_EPS,
            p.x + r + COLLISION_EPS,
            p.z - r - COLLISION_EPS,
            p.z + r + COLLISION_EPS,
            &mut aabbs,
        );
        let head = p.y + body_h;
        let mut best_feet = p.y;
        for aabb in &aabbs {
            if head <= aabb.min[1] + COLLISION_EPS {
                continue;
            }
            best_feet = best_feet.min(aabb.min[1] - body_h - COLLISION_EPS);
        }
        if best_feet < p.y {
            p.y = best_feet;
            if p.vel_y > 0.0 {
                p.vel_y = 0.0;
            }
        }
    }
}

/// Solid threshold while the swing door is mostly closed — sync client `fpElevExteriorDoorBlocksAtPose`.
#[allow(dead_code)]
pub fn clamp_player_exterior_landing_doors(ctx: &ReducerContext, p: &mut PlayerPose) {
    let (hx, hz) = elevator_layout::inner_half_xz();
    for row in ctx.db.elevator_landing_door().iter() {
        if row.swing_open_01 > EXT_DOOR_SOLID_SLAB_MAX_SWING {
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
        let mid = (EXT_COLLISION_L0 + EXT_COLLISION_L1) * 0.5;
        match door {
            DoorFace::E => {
                let lo = spec.plate_x + hx + EXT_COLLISION_L0;
                let hi = spec.plate_x + hx + EXT_COLLISION_L1;
                p.x = if p.x <= spec.plate_x + hx + mid { lo - 0.07 } else { hi + 0.08 };
            }
            DoorFace::W => {
                let lo = spec.plate_x - hx - EXT_COLLISION_L1;
                let hi = spec.plate_x - hx - EXT_COLLISION_L0;
                p.x = if p.x >= spec.plate_x - hx - mid { hi + 0.07 } else { lo - 0.08 };
            }
            DoorFace::N => {
                let lo = spec.plate_z + hz + EXT_COLLISION_L0;
                let hi = spec.plate_z + hz + EXT_COLLISION_L1;
                p.z = if p.z <= spec.plate_z + hz + mid { lo - 0.07 } else { hi + 0.08 };
            }
            DoorFace::S => {
                let lo = spec.plate_z - hz - EXT_COLLISION_L1;
                let hi = spec.plate_z - hz - EXT_COLLISION_L0;
                p.z = if p.z >= spec.plate_z - hz - mid { hi + 0.07 } else { lo - 0.08 };
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

/// Hallway-side blocker for the hoistway front wall and doorway. Prevents entering the shaft
/// through solid wall segments and only allows the doorway lane when both landing and cab doors
/// are open at the docked level.
#[allow(dead_code)]
pub fn clamp_player_landing_hoistway_front_walls(ctx: &ReducerContext, p: &mut PlayerPose) {
    let outer_hx = elevator_layout::SHAFT_SX * 0.5;
    let outer_hz = elevator_layout::SHAFT_SZ * 0.5;
    let iy = elevator_layout::inner_height();
    for landing in ctx.db.elevator_landing_door().iter() {
        let Some(spec) = spec_for_key(&landing.shaft_key) else {
            continue;
        };
        let Some(car) = ctx.db.elevator_car().shaft_key().find(&landing.shaft_key) else {
            continue;
        };
        let fy = support_y(landing.level);
        if p.y < fy - 0.22 || p.y > fy + iy + 0.38 {
            continue;
        }
        let lx = p.x - spec.plate_x;
        let lz = p.z - spec.plate_z;
        if !landing_front_face_local_ok(spec.door, outer_hx, outer_hz, lx, lz) {
            continue;
        }
        if landing_front_door_lane_local_ok(spec.door, outer_hx, outer_hz, lx, lz)
            && landing_front_passage_open(&landing, &car, fy)
        {
            continue;
        }
        let px = p.x;
        let pz = p.z;
        match spec.door {
            DoorFace::E => p.x = spec.plate_x + outer_hx + LANDING_FRONT_WALL_SLAB_OUT + LANDING_FRONT_WALL_PUSH_OUT,
            DoorFace::W => p.x = spec.plate_x - outer_hx - LANDING_FRONT_WALL_SLAB_OUT - LANDING_FRONT_WALL_PUSH_OUT,
            DoorFace::N => p.z = spec.plate_z + outer_hz + LANDING_FRONT_WALL_SLAB_OUT + LANDING_FRONT_WALL_PUSH_OUT,
            DoorFace::S => p.z = spec.plate_z - outer_hz - LANDING_FRONT_WALL_SLAB_OUT - LANDING_FRONT_WALL_PUSH_OUT,
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
#[allow(dead_code)]
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
    use super::{
        exterior_collision_plate_local_ok, exterior_interact_plate_local_ok,
        in_closed_cab_outside_door_slab, landing_front_door_lane_local_ok,
        landing_front_face_local_ok, landing_front_passage_open, near_exterior_door_toggle_pose,
        support_y, ElevatorCar, ElevatorLandingDoor, EXT_DOOR_COLLISION_OPEN_THRESH,
        EXT_DOOR_SOLID_SLAB_MAX_SWING, EXT_INTERACT_L0, EXT_INTERACT_L1, MAMUTH_ELEVATOR_SPECS,
        PH_IDLE,
    };
    use crate::elevator_layout::{inner_half_xz, DoorFace};
    use crate::elevator_layout::ElevShaftSpec;

    #[test]
    fn solid_slab_swing_threshold_sits_below_passage_open() {
        assert!(EXT_DOOR_SOLID_SLAB_MAX_SWING < EXT_DOOR_COLLISION_OPEN_THRESH);
    }

    #[test]
    fn near_toggle_accepts_mamutica_hub_east_interact_strip_level1() {
        let (hx, _) = inner_half_xz();
        let fy = support_y(1);
        let spec = MAMUTH_ELEVATOR_SPECS
            .iter()
            .find(|s| s.shaft_key == "-3.17,0")
            .expect("hub shaft");
        let lx = hx + (EXT_INTERACT_L0 + EXT_INTERACT_L1) * 0.5;
        let pose = crate::pose::PlayerPose {
            identity: spacetimedb::Identity::from_byte_array([0; 32]),
            x: spec.plate_x + lx,
            y: fy + 1.0,
            z: spec.plate_z,
            yaw: 0.0,
            seq: 0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            grounded: 1,
        };
        assert!(near_exterior_door_toggle_pose(&pose, spec, 1));
    }

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

    #[test]
    fn near_pose_accepts_inside_side_too() {
        let (hx, _) = inner_half_xz();
        let spec = ElevShaftSpec {
            shaft_key: "test",
            plate_x: 10.0,
            plate_z: 20.0,
            door: DoorFace::E,
        };
        let fy = support_y(1);
        let pose = crate::pose::PlayerPose {
            identity: spacetimedb::Identity::from_byte_array([0; 32]),
            x: spec.plate_x + hx - 0.2,
            y: fy + 1.0,
            z: spec.plate_z,
            yaw: 0.0,
            seq: 0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            grounded: 1,
        };
        assert!(near_exterior_door_toggle_pose(&pose, &spec, 1));
    }

    #[test]
    fn collision_blocks_full_frontage_not_only_leaf_width() {
        let (hx, hz) = inner_half_xz();
        let fy = support_y(1);
        assert!(exterior_collision_plate_local_ok(
            DoorFace::E,
            hx,
            hz,
            hx + 0.12,
            hz - 0.06,
            fy + 1.0,
            fy,
        ));
    }

    #[test]
    fn closed_cab_outside_slab_covers_side_lane_too() {
        let (hx, hz) = inner_half_xz();
        assert!(in_closed_cab_outside_door_slab(
            DoorFace::E,
            hx,
            hz,
            hx + 0.12,
            hz - 0.06,
        ));
    }

    #[test]
    fn landing_front_face_blocks_side_wall_segment() {
        assert!(landing_front_face_local_ok(DoorFace::E, 1.19, 2.0, 1.22, 1.6));
        assert!(!landing_front_door_lane_local_ok(DoorFace::E, 1.19, 2.0, 1.22, 1.6));
    }

    #[test]
    fn landing_front_passage_only_opens_when_both_doors_are_open_and_docked() {
        let fy = support_y(1);
        let landing = ElevatorLandingDoor {
            row_key: "shaft|1".into(),
            shaft_key: "shaft".into(),
            level: 1,
            desired_open: 1,
            swing_open_01: 1.0,
        };
        let car = ElevatorCar {
            shaft_key: "shaft".into(),
            current_level: 1,
            door_open_01: 1.0,
            phase: PH_IDLE,
            move_from_level: 1,
            move_to_level: 1,
            move_u: 0.0,
            dest_queue: Vec::new(),
            cab_floor_y: fy,
            door_face: DoorFace::E as u8,
            plate_x: 0.0,
            plate_z: 0.0,
        };
        assert!(landing_front_passage_open(&landing, &car, fy));
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
    let id = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    let Some((spec, lv)) = resolve_exterior_door_toggle_target(&pose, &shaft_key, level) else {
        return;
    };
    let target_shaft_key = spec.shaft_key.to_string();
    let rk = landing_door_row_key(&target_shaft_key, lv);
    let current_desired = ctx
        .db
        .elevator_landing_door()
        .row_key()
        .find(&rk)
        .map(|row| row.desired_open)
        .unwrap_or(0);
    let next_desired = if current_desired != 0 { 0 } else { 1 };
    set_landing_exterior_door_desired_open(ctx, &pose, &shaft_key, level, next_desired);
}

#[spacetimedb::reducer]
pub fn elevator_landing_exterior_door_set(
    ctx: &ReducerContext,
    shaft_key: String,
    level: u32,
    desired_open: u8,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("elevator_landing_exterior_door_set blocked: {e}");
        return;
    }
    let id = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    set_landing_exterior_door_desired_open(ctx, &pose, &shaft_key, level, desired_open);
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

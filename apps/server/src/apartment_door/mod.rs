//! Apartment unit entry swing doors — authoritative state, interaction, and hit-scan barriers.
//!
//! Locomotion is client-authored; this module does **not** resolve capsule-vs-door physics.
//! Shares the "corridor swing door" mechanics with [`crate::elevator`] landing doors:
//! the door anim, open/close sound kinds, interact radius, **closed-slab** geometry for
//! firearm LOS — expanded closed slab while nearly shut; **parked-open leaf** once passage clears
//! (aligned with `@the-mammoth/world` `swingDoorCollision.ts`), and the per-face yaw convention all come from the TSL-side
//! `@the-mammoth/world` `swingDoorCollision.ts` module. Shared formulas are covered by
//! `swingDoorCollision.test.ts` plus this module's unit tests.
//!
//! The door stock itself is codegen'd from floor JSON via
//! `scripts/gen-apartment-door-stock.ts` into `generated_apartment_doors.rs` (on the
//! server) and `generatedApartmentDoors.ts` (on the client). Rerun after editing any
//! floor doc.

use serde::Deserialize;
use spacetimedb::{ReducerContext, Table};

use crate::apartments::apartment_unit;
use crate::auth;
use crate::elevator_layout::{
    max_level, BUILDING_ORIGIN_Y, RESIDENTIAL_BAND_MIN_LEVEL, STOREY_SPACING_M,
};
use crate::generated_apartment_doors::{
    ApartmentDoorTemplate as GenTemplate, APARTMENT_DOOR_TEMPLATE_SETS,
};
use crate::pose::{player_pose, PlayerPose};
use crate::world_sound;

/// Must match `packages/world/src/swingDoorCollision.ts` `SWING_DOOR_ANIM_SPEED`.
const SWING_DOOR_ANIM_SPEED: f32 = 4.5;
/// Match `SWING_DOOR_CLOSED_SLAB_HALF_THICK_M`.
const SWING_DOOR_CLOSED_SLAB_HALF_THICK_M: f32 = 0.09;
/// Match `SWING_DOOR_INTERACT_RADIUS_M`.
const SWING_DOOR_INTERACT_RADIUS_M: f32 = 2.05;
/// Match `SWING_DOOR_INTERACT_FEET_BELOW_SLACK_M`.
const INTERACT_FEET_BELOW_SLACK_M: f32 = 10.0;
/// Match `SWING_DOOR_INTERACT_FEET_ABOVE_HEAD_SLACK_M`.
const INTERACT_FEET_ABOVE_HEAD_SLACK_M: f32 = 4.25;
/// Same walk-probe offset used when validating door interactions — recover feet Y from the head probe.
const WALK_PROBE_DY: f32 = 1.05;
/// Horizontal slack between replicated [`PlayerPose`] feet and the client's reported hint when
/// validating [`player_in_interact_range`] for apartment doors (deep units + predictor lead).
const APARTMENT_DOOR_CLIENT_FEET_HINT_MAX_SEP_M: f32 = 14.0;

/// Face code convention (matches `FACE_CODE` in `swingDoorCollision.ts`):
/// 0 = N, 1 = S, 2 = E, 3 = W.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum SwingDoorFace {
    N = 0,
    S = 1,
    E = 2,
    W = 3,
}

impl SwingDoorFace {
    #[inline]
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => SwingDoorFace::N,
            1 => SwingDoorFace::S,
            2 => SwingDoorFace::E,
            _ => SwingDoorFace::W,
        }
    }
}

#[spacetimedb::table(public, accessor = apartment_door)]
pub struct ApartmentDoor {
    #[primary_key]
    pub row_key: String,
    pub floor_doc_id: String,
    pub level: u32,
    pub template_id: String,
    /// Mirrors `SwingDoorFace` codes (0=N, 1=S, 2=E, 3=W).
    pub face: u8,
    pub hinge_x: f32,
    pub hinge_z: f32,
    pub feet_y: f32,
    pub panel_w_m: f32,
    pub panel_h_m: f32,
    /// 0 = animate toward shut, 1 = toward open.
    pub desired_open: u8,
    pub swing_open_01: f32,
}

fn row_key(floor_doc_id: &str, level: u32, template_id: &str) -> String {
    format!("{floor_doc_id}|{level}|{template_id}")
}

/// Maps a residential door row to `floor|level|unit_id` (first segment of `template_id`).
pub(crate) fn resident_unit_key_from_door_row(row: &ApartmentDoor) -> String {
    let uid = row.template_id.split('|').next().unwrap_or("");
    format!("{}|{}|{}", row.floor_doc_id, row.level, uid)
}

#[inline]
fn plate_world_y(level: u32) -> f32 {
    BUILDING_ORIGIN_Y + (level.max(1) as f32 - 1.0) * STOREY_SPACING_M
}

#[inline]
fn feet_world_y(level: u32, feet_y_offset: f32) -> f32 {
    plate_world_y(level) + feet_y_offset
}

/// True when replicated geometry already matches the codegen template (within epsilon).
fn apartment_door_row_matches_template(row: &ApartmentDoor, level: u32, t: &GenTemplate) -> bool {
    const EPS: f32 = 0.02;
    let want_feet = feet_world_y(level, t.feet_y_offset);
    row.face == t.face
        && (row.hinge_x - t.hinge_x).abs() <= EPS
        && (row.hinge_z - t.hinge_z).abs() <= EPS
        && (row.feet_y - want_feet).abs() <= EPS
        && (row.panel_w_m - t.panel_w_m).abs() <= EPS
        && (row.panel_h_m - t.panel_h_m).abs() <= EPS
}

/// Parse `content/building/mammoth.json` once and cache the floor-ref list
/// `(level_index, floor_doc_id)` so we can expand codegen templates into rows.
pub(crate) fn building_floor_refs() -> &'static [(u32, &'static str)] {
    use std::sync::OnceLock;
    static REFS: OnceLock<Vec<(u32, &'static str)>> = OnceLock::new();
    REFS.get_or_init(|| {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Doc {
            floor_refs: Vec<Ref>,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Ref {
            level_index: u32,
            floor_doc_id: String,
        }
        let doc: Doc = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../content/building/mammoth.json"
        )))
        .expect("building JSON must parse for apartment_door seeding");
        doc.floor_refs
            .into_iter()
            .map(|r| {
                let leaked: &'static str = Box::leak(r.floor_doc_id.into_boxed_str());
                (r.level_index, leaked as &str)
            })
            .collect()
    })
    .as_slice()
}

fn template_set_for(floor_doc_id: &str) -> &'static [GenTemplate] {
    for s in APARTMENT_DOOR_TEMPLATE_SETS {
        if s.floor_doc_id == floor_doc_id {
            return s.templates;
        }
    }
    &[]
}

/// First segment must be `unit_e_*` / `unit_w_*` for double-loaded corridor entries.
#[inline]
pub(crate) fn is_residential_corridor_unit_door(template_id: &str) -> bool {
    let uid = template_id.split('|').next().unwrap_or("");
    uid.starts_with("unit_e_") || uid.starts_with("unit_w_")
}

/// Podium (`mammoth.json` levelIndex 1) — keeps stair / manual corridor doors.
const APARTMENT_PR_LEVEL: u32 = 1;

/// Residential `unit_e_*` / `unit_w_*` on extraction storeys (display ≤ 16, levels 2–17) are omitted.
#[inline]
pub(crate) fn apartment_unit_entry_doors_enabled_for_level(level: u32) -> bool {
    if level == APARTMENT_PR_LEVEL {
        return true;
    }
    !(level > APARTMENT_PR_LEVEL && level < RESIDENTIAL_BAND_MIN_LEVEL)
}

/// Default openness for residential **unit** corridor doors (`unit_e_*`/`unit_w_*`). Other templates
/// (manual stair shafts, elevators) stay closed (`0`).
#[inline]
pub(crate) fn residential_unit_door_default_open01_for_level(level: u32) -> (u8, f32) {
    if level < RESIDENTIAL_BAND_MIN_LEVEL {
        (1, 1.0)
    } else {
        (0, 0.0)
    }
}

/// Aligns residential unit corridor doors with the abandoned-open vs lived-in-band policy.
/// **`init`** and **`on_connect`** both call this after seeding so stale `desired_open` rows (e.g. from
/// older modules) do not stay stuck open on levels `RESIDENTIAL_BAND_MIN_LEVEL`..`max_level()`.
/// Re-applies every reconnect — band doors return to authored defaults; owners can re-open from inside.
pub fn sync_residential_unit_door_band_presentations(ctx: &ReducerContext) {
    for mut d in ctx.db.apartment_door().iter() {
        if !is_residential_corridor_unit_door(&d.template_id) {
            continue;
        }
        let (want_open01, swing) = residential_unit_door_default_open01_for_level(d.level);
        if d.desired_open != want_open01 || (d.swing_open_01 - swing).abs() > 1e-4 {
            d.desired_open = want_open01;
            d.swing_open_01 = swing;
            ctx.db.apartment_door().row_key().update(d);
        }
    }
}

/// Idempotent: insert one row per `(floor_doc, level_index, template)` if missing.
pub fn seed_apartment_doors(ctx: &ReducerContext) {
    let refs = building_floor_refs();
    let max_lv = max_level();
    let mut seen = std::collections::HashSet::<String>::new();
    for (level, floor_doc_id) in refs.iter().copied() {
        if level < 1 || level > max_lv {
            continue;
        }
        let templates = template_set_for(floor_doc_id);
        if templates.is_empty() {
            continue;
        }
        for t in templates {
            let rk = row_key(floor_doc_id, level, t.template_id);
            if is_residential_corridor_unit_door(t.template_id)
                && !apartment_unit_entry_doors_enabled_for_level(level)
            {
                if ctx.db.apartment_door().row_key().find(&rk).is_some() {
                    ctx.db.apartment_door().row_key().delete(rk);
                }
                continue;
            }
            seen.insert(rk.clone());
            if let Some(mut row) = ctx.db.apartment_door().row_key().find(&rk) {
                let mut changed = false;
                if !apartment_door_row_matches_template(&row, level, t) {
                    row.hinge_x = t.hinge_x;
                    row.hinge_z = t.hinge_z;
                    row.face = t.face;
                    row.feet_y = feet_world_y(level, t.feet_y_offset);
                    row.panel_w_m = t.panel_w_m;
                    row.panel_h_m = t.panel_h_m;
                    changed = true;
                }
                // Re-apply abandoned-open vs lived-in-band policy on every seed (stale DB rows used to
                // stay `desired_open=1` from older `open_unclaimed_residential_doors` behavior).
                if is_residential_corridor_unit_door(t.template_id) {
                    let (want_open01, swing) =
                        residential_unit_door_default_open01_for_level(level);
                    if row.desired_open != want_open01 || (row.swing_open_01 - swing).abs() > 1e-4 {
                        row.desired_open = want_open01;
                        row.swing_open_01 = swing;
                        changed = true;
                    }
                }
                if changed {
                    let _ = ctx.db.apartment_door().row_key().update(row);
                }
                continue;
            }
            let (desired_open, swing_open_01) = if is_residential_corridor_unit_door(t.template_id)
            {
                residential_unit_door_default_open01_for_level(level)
            } else {
                (0, 0.0)
            };
            let _ = ctx.db.apartment_door().insert(ApartmentDoor {
                row_key: rk,
                floor_doc_id: floor_doc_id.to_string(),
                level,
                template_id: t.template_id.to_string(),
                face: t.face,
                hinge_x: t.hinge_x,
                hinge_z: t.hinge_z,
                feet_y: feet_world_y(level, t.feet_y_offset),
                panel_w_m: t.panel_w_m,
                panel_h_m: t.panel_h_m,
                desired_open,
                swing_open_01,
            });
        }
    }
    let stale_keys: Vec<String> = ctx
        .db
        .apartment_door()
        .iter()
        .filter(|d| !seen.contains(&d.row_key))
        .map(|d| d.row_key)
        .collect();
    for key in stale_keys {
        ctx.db.apartment_door().row_key().delete(key);
    }
}

/// Advance every apartment door `swing_open_01` toward `desired_open`. Call once per
/// physics tick from `movement::physics_tick_step`.
pub fn tick_apartment_doors(ctx: &ReducerContext, dt: f32) {
    let step = dt * SWING_DOOR_ANIM_SPEED;
    let keys: Vec<String> = ctx
        .db
        .apartment_door()
        .iter()
        .map(|r| r.row_key.clone())
        .collect();
    for rk in keys {
        let Some(mut row) = ctx.db.apartment_door().row_key().find(&rk) else {
            continue;
        };
        let goal = if row.desired_open != 0 {
            1.0_f32
        } else {
            0.0_f32
        };
        if row.swing_open_01 < goal - 1e-4 {
            row.swing_open_01 = (row.swing_open_01 + step).min(goal);
        } else if row.swing_open_01 > goal + 1e-4 {
            row.swing_open_01 = (row.swing_open_01 - step).max(goal);
        } else {
            row.swing_open_01 = goal;
        }
        ctx.db.apartment_door().row_key().update(row);
    }
}

// ---------------------------------------------------------------------------
// Geometry helpers (parity with `swingDoorCollision.ts`).
// ---------------------------------------------------------------------------

#[inline]
fn tangent_rest(face: SwingDoorFace) -> (f32, f32) {
    match face {
        SwingDoorFace::W | SwingDoorFace::E => (0.0, -1.0),
        SwingDoorFace::N | SwingDoorFace::S => (-1.0, 0.0),
    }
}

#[inline]
fn open_normal(face: SwingDoorFace) -> (f32, f32) {
    match face {
        SwingDoorFace::W => (-1.0, 0.0),
        SwingDoorFace::E => (1.0, 0.0),
        SwingDoorFace::N => (0.0, 1.0),
        SwingDoorFace::S => (0.0, -1.0),
    }
}

/// Closed-door collision slab (thin plate filling the doorway opening).
fn closed_slab_aabb(row: &ApartmentDoor) -> ([f32; 3], [f32; 3]) {
    let face = SwingDoorFace::from_u8(row.face);
    let (tx, tz) = tangent_rest(face);
    let tip_x = row.hinge_x + tx * row.panel_w_m;
    let tip_z = row.hinge_z + tz * row.panel_w_m;
    let t = SWING_DOOR_CLOSED_SLAB_HALF_THICK_M;
    let top_y = row.feet_y + row.panel_h_m;
    match face {
        SwingDoorFace::W | SwingDoorFace::E => {
            let z_min = row.hinge_z.min(tip_z);
            let z_max = row.hinge_z.max(tip_z);
            (
                [row.hinge_x - t, row.feet_y, z_min],
                [row.hinge_x + t, top_y, z_max],
            )
        }
        SwingDoorFace::N | SwingDoorFace::S => {
            let x_min = row.hinge_x.min(tip_x);
            let x_max = row.hinge_x.max(tip_x);
            (
                [x_min, row.feet_y, row.hinge_z - t],
                [x_max, top_y, row.hinge_z + t],
            )
        }
    }
}

/// Match `SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01`.
const SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01: f32 = 0.025;
/// Match `SWING_DOOR_PARKED_LEAF_MIN_OPEN_01`.
const SWING_DOOR_PARKED_LEAF_MIN_OPEN_01: f32 = 0.97;
/// Match `SWING_DOOR_DEFAULT_MAX_RAD`.
const SWING_DOOR_DEFAULT_MAX_RAD: f32 = 1.55;
/// Match `SWING_DOOR_OPEN_LEAF_HALF_THICK_M`.
const SWING_DOOR_OPEN_LEAF_HALF_THICK_M: f32 = 0.07;
/// Match `SWING_DOOR_OPEN_LEAF_XZ_PAD_M`.
const SWING_DOOR_OPEN_LEAF_XZ_PAD_M: f32 = 0.04;
/// Match `SWING_DOOR_FIREARM_PARKED_LEAF_UNIFORM_PAD_M`.
const SWING_DOOR_FIREARM_PARKED_LEAF_UNIFORM_PAD_M: f32 = 0.22;

#[inline]
fn apartment_door_swing_inward_for_template(_template_id: &str) -> bool {
    false
}

#[inline]
fn swing_door_base_yaw(face: SwingDoorFace) -> f32 {
    match face {
        SwingDoorFace::W | SwingDoorFace::E => 0.0,
        SwingDoorFace::N | SwingDoorFace::S => std::f32::consts::FRAC_PI_2,
    }
}

#[inline]
fn swing_door_swing_sign(face: SwingDoorFace) -> f32 {
    match face {
        SwingDoorFace::W | SwingDoorFace::N => 1.0,
        SwingDoorFace::E | SwingDoorFace::S => -1.0,
    }
}

fn swing_door_yaw_rad(face: SwingDoorFace, open01: f32, max_rad: f32, swing_inward: bool) -> f32 {
    let base = swing_door_base_yaw(face);
    let sign = swing_door_swing_sign(face);
    let effective = if swing_inward { -sign } else { sign };
    base + effective * open01 * max_rad
}

fn swinging_leaf_enclosing_aabb(row: &ApartmentDoor) -> ([f32; 3], [f32; 3]) {
    let face = SwingDoorFace::from_u8(row.face);
    let swing_inward = apartment_door_swing_inward_for_template(&row.template_id);
    let ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
    let pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    let yaw = swing_door_yaw_rad(
        face,
        row.swing_open_01,
        SWING_DOOR_DEFAULT_MAX_RAD,
        swing_inward,
    );
    let ux = -yaw.sin();
    let uz = -yaw.cos();
    let vx = -uz;
    let vz = ux;
    let hx = row.hinge_x;
    let hz = row.hinge_z;
    let pw = row.panel_w_m;
    let corners = [
        (hx + vx * ht, hz + vz * ht),
        (hx - vx * ht, hz - vz * ht),
        (hx + vx * ht + ux * pw, hz + vz * ht + uz * pw),
        (hx - vx * ht + ux * pw, hz - vz * ht + uz * pw),
    ];
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_z = f32::NEG_INFINITY;
    for (x, z) in corners {
        min_x = min_x.min(x - pad);
        max_x = max_x.max(x + pad);
        min_z = min_z.min(z - pad);
        max_z = max_z.max(z + pad);
    }
    let top_y = row.feet_y + row.panel_h_m;
    ([min_x, row.feet_y, min_z], [max_x, top_y, max_z])
}

#[inline]
fn tip_dir_at_full_open(face: SwingDoorFace, swing_inward: bool) -> (f32, f32) {
    let (nx, nz) = open_normal(face);
    if swing_inward {
        (-nx, -nz)
    } else {
        (nx, nz)
    }
}

/// Parity with `swingDoorParkedLeafAabb` (`manualApartmentDoorExtras` swing inward flags).
pub(crate) fn parked_leaf_world_aabb(row: &ApartmentDoor) -> ([f32; 3], [f32; 3]) {
    let face = SwingDoorFace::from_u8(row.face);
    let swing_inward = apartment_door_swing_inward_for_template(&row.template_id);
    let (tx, tz) = tip_dir_at_full_open(face, swing_inward);
    let tip_x = row.hinge_x + tx * row.panel_w_m;
    let tip_z = row.hinge_z + tz * row.panel_w_m;
    let ht = SWING_DOOR_OPEN_LEAF_HALF_THICK_M;
    let pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
    let top_y = row.feet_y + row.panel_h_m;
    match face {
        SwingDoorFace::W | SwingDoorFace::E => {
            let x_min = if tx > 0.0 { row.hinge_x } else { tip_x - pad };
            let x_max = if tx > 0.0 { tip_x + pad } else { row.hinge_x };
            (
                [x_min, row.feet_y, row.hinge_z - ht - pad],
                [x_max, top_y, row.hinge_z + ht + pad],
            )
        }
        SwingDoorFace::N | SwingDoorFace::S => {
            let z_min = if tz > 0.0 { row.hinge_z } else { tip_z - pad };
            let z_max = if tz > 0.0 { tip_z + pad } else { row.hinge_z };
            (
                [row.hinge_x - ht - pad, row.feet_y, z_min],
                [row.hinge_x + ht + pad, top_y, z_max],
            )
        }
    }
}

/// Locomotion capsule blocker — lockstep with `swingDoorMovementBlockingAabb` in `@the-mammoth/world`.
pub fn apartment_door_movement_blocking_aabb(row: &ApartmentDoor) -> Option<([f32; 3], [f32; 3])> {
    if row.swing_open_01 <= SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01 {
        return Some(closed_slab_aabb(row));
    }
    if row.swing_open_01 >= SWING_DOOR_PARKED_LEAF_MIN_OPEN_01 {
        return Some(parked_leaf_world_aabb(row));
    }
    Some(swinging_leaf_enclosing_aabb(row))
}

fn expanded_parked_leaf_firearm_barrier(row: &ApartmentDoor) -> ([f32; 3], [f32; 3]) {
    let (mut mn, mut mx) = parked_leaf_world_aabb(row);
    let e = SWING_DOOR_FIREARM_PARKED_LEAF_UNIFORM_PAD_M;
    let ey = 0.05_f32;
    mn[0] -= e;
    mn[1] -= ey;
    mn[2] -= e;
    mx[0] += e;
    mx[1] += ey;
    mx[2] += e;
    (mn, mx)
}

/// Match `packages/world/src/swingDoorCollision.ts` `SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M`.
const SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M: f32 = 0.6;
/// Match `SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M`.
const SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M: f32 = 0.035;
/// Match `SWING_DOOR_PASSAGE_OPEN_THRESH` — open door uses parked-leaf firearm volume at/above this.
const SWING_DOOR_PASSAGE_OPEN_THRESH_HITSCAN: f32 = 0.85;

fn expanded_closed_slab_firearm_barrier(row: &ApartmentDoor) -> ([f32; 3], [f32; 3]) {
    let (mut mn, mut mx) = closed_slab_aabb(row);
    let face = SwingDoorFace::from_u8(row.face);
    match face {
        SwingDoorFace::W | SwingDoorFace::E => {
            mn[2] -= SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M;
            mx[2] += SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M;
            mn[0] -= SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M;
            mx[0] += SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M;
        }
        SwingDoorFace::N | SwingDoorFace::S => {
            mn[0] -= SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M;
            mx[0] += SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M;
            mn[2] -= SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M;
            mx[2] += SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M;
        }
    }
    (mn, mx)
}

/// Hit-scan / LOS collider — lockstep with `swingDoorFirearmBarrierAabb` in `@the-mammoth/world`.
pub fn apartment_door_firearm_barrier_aabb(row: &ApartmentDoor) -> Option<([f32; 3], [f32; 3])> {
    if row.swing_open_01 <= SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01 {
        return Some(expanded_closed_slab_firearm_barrier(row));
    }
    if row.swing_open_01 >= SWING_DOOR_PASSAGE_OPEN_THRESH_HITSCAN {
        return Some(expanded_parked_leaf_firearm_barrier(row));
    }
    Some(expanded_closed_slab_firearm_barrier(row))
}

// ---------------------------------------------------------------------------
// Interaction reducers
// ---------------------------------------------------------------------------

fn resolve_interact_target(
    ctx: &ReducerContext,
    pose: &PlayerPose,
    requested_row_key: &str,
    client_feet_hint: Option<(f32, f32, f32)>,
    hint_sep_max_m: f32,
) -> Option<ApartmentDoor> {
    let row = ctx
        .db
        .apartment_door()
        .row_key()
        .find(&requested_row_key.to_string())?;
    let px = pose.x;
    let pz = pose.z;
    let feet_y_authoritative = pose.y - WALK_PROBE_DY;

    if player_in_interact_range(&row, px, feet_y_authoritative, pz) {
        return Some(row);
    }
    if let Some((hx, hy, hz)) = client_feet_hint {
        let sep_xz = ((hx - px).powi(2) + (hz - pz).powi(2)).sqrt();
        if sep_xz <= hint_sep_max_m && player_in_interact_range(&row, hx, hy, hz) {
            return Some(row);
        }
    }
    None
}

fn player_in_interact_range(row: &ApartmentDoor, px: f32, py: f32, pz: f32) -> bool {
    let dx = px - row.hinge_x;
    let dz = pz - row.hinge_z;
    let r = SWING_DOOR_INTERACT_RADIUS_M + row.panel_w_m * 0.5;
    if dx * dx + dz * dz > r * r {
        return false;
    }
    let y_lo = row.feet_y - INTERACT_FEET_BELOW_SLACK_M;
    let y_hi = row.feet_y + row.panel_h_m + INTERACT_FEET_ABOVE_HEAD_SLACK_M;
    py >= y_lo && py <= y_hi
}

fn sound_xyz_for_row(row: &ApartmentDoor) -> (f32, f32, f32) {
    let face = SwingDoorFace::from_u8(row.face);
    let (nx, nz) = open_normal(face);
    const PICK_OUT: f32 = 0.06;
    let cy = row.feet_y + row.panel_h_m * 0.5;
    (row.hinge_x + nx * PICK_OUT, cy, row.hinge_z + nz * PICK_OUT)
}

fn apply_desired_open(
    ctx: &ReducerContext,
    pose: &PlayerPose,
    requested_row_key: &str,
    desired_open: u8,
    client_feet_hint: Option<(f32, f32, f32)>,
) {
    let Some(mut row) = resolve_interact_target(
        ctx,
        pose,
        requested_row_key,
        client_feet_hint,
        APARTMENT_DOOR_CLIENT_FEET_HINT_MAX_SEP_M,
    ) else {
        log::info!(
            "apartment_door: reject not_eligible row_key={requested_row_key:?} identity={} pose=({:.3},{:.3},{:.3})",
            ctx.sender(),
            pose.x,
            pose.y,
            pose.z,
        );
        return;
    };
    let prev = row.desired_open;
    row.desired_open = if desired_open != 0 { 1 } else { 0 };
    let new_desired = row.desired_open;
    let (sx, sy, sz) = sound_xyz_for_row(&row);
    ctx.db.apartment_door().row_key().update(row);
    if prev != new_desired {
        let id = ctx.sender();
        if new_desired != 0 {
            world_sound::emit_landing_exterior_door_open_at(ctx, sx, sy, sz, id);
        } else {
            world_sound::emit_landing_exterior_door_close_at(ctx, sx, sy, sz, id);
        }
    }
}

/// East/west façade templates abut in Z (~0.6 m overlap): [`crate::apartments::unit_key_containing_feet`]
/// resolves ties by centroid distance and can disagree with toggling THIS door while feet still lie
/// in that hull. Fall back to hull membership for [`resident_unit_key_from_door_row`].
fn residential_client_feet_align_door_volume(
    ctx: &ReducerContext,
    door: &ApartmentDoor,
    fx: f32,
    fy: f32,
    fz: f32,
) -> bool {
    if !door.template_id.contains("unit_") {
        return true;
    }
    let uk_door = resident_unit_key_from_door_row(door);
    match crate::apartments::unit_key_containing_feet(ctx, fx, fy, fz) {
        Some(ref best_uk) if best_uk == &uk_door => true,
        Some(_) => ctx
            .db
            .apartment_unit()
            .unit_key()
            .find(&uk_door)
            .map(|unit| crate::apartments::feet_inside_unit(&unit, fx, fy, fz))
            .unwrap_or(false),
        None => true,
    }
}

#[spacetimedb::reducer]
pub fn apartment_door_toggle(
    ctx: &ReducerContext,
    row_key: String,
    client_feet_x: f32,
    client_feet_y: f32,
    client_feet_z: f32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::info!(
            "apartment_door_toggle: reject gameplay_locked identity={} ({e})",
            ctx.sender(),
        );
        return;
    }
    let id = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        log::info!("apartment_door_toggle: reject no_player_pose identity={id}");
        return;
    };
    let hint = Some((client_feet_x, client_feet_y, client_feet_z));
    let Some(dr) = ctx.db.apartment_door().row_key().find(&row_key) else {
        return;
    };
    if !residential_client_feet_align_door_volume(
        ctx,
        &dr,
        client_feet_x,
        client_feet_y,
        client_feet_z,
    ) {
        return;
    }
    if !crate::apartments::player_may_toggle_door(ctx, id, &dr) {
        return;
    }
    let current_desired = ctx
        .db
        .apartment_door()
        .row_key()
        .find(&row_key)
        .map(|r| r.desired_open)
        .unwrap_or(0);
    let next = if current_desired != 0 { 0 } else { 1 };
    apply_desired_open(ctx, &pose, &row_key, next, hint);
}

#[spacetimedb::reducer]
pub fn apartment_door_set(
    ctx: &ReducerContext,
    row_key: String,
    desired_open: u8,
    client_feet_x: f32,
    client_feet_y: f32,
    client_feet_z: f32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::info!(
            "apartment_door_set: reject gameplay_locked identity={} ({e})",
            ctx.sender(),
        );
        return;
    }
    let id = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        log::info!("apartment_door_set: reject no_player_pose identity={id}");
        return;
    };
    let Some(dr) = ctx.db.apartment_door().row_key().find(&row_key) else {
        return;
    };
    if !residential_client_feet_align_door_volume(
        ctx,
        &dr,
        client_feet_x,
        client_feet_y,
        client_feet_z,
    ) {
        return;
    }
    if !crate::apartments::player_may_toggle_door(ctx, id, &dr) {
        return;
    }
    apply_desired_open(
        ctx,
        &pose,
        &row_key,
        desired_open,
        Some((client_feet_x, client_feet_y, client_feet_z)),
    );
}

/// Test shim — delegates to production `parked_leaf_world_aabb`.
#[cfg(test)]
mod swing_door_parked_leaf_parity {
    use super::{parked_leaf_world_aabb, ApartmentDoor};
    pub(super) fn parked_leaf_aabb(row: &ApartmentDoor) -> ([f32; 3], [f32; 3]) {
        parked_leaf_world_aabb(row)
    }
}

#[cfg(test)]
mod tests {
    use super::swing_door_parked_leaf_parity::parked_leaf_aabb;
    use super::*;

    fn sample_row() -> ApartmentDoor {
        ApartmentDoor {
            row_key: "floor|2|unit_e_001|w".into(),
            floor_doc_id: "floor_mamutica_typical".into(),
            level: 2,
            template_id: "unit_e_001|w".into(),
            face: SwingDoorFace::W as u8,
            hinge_x: 1.925,
            hinge_z: -112.0825,
            feet_y: 3.4,
            panel_w_m: 1.26,
            panel_h_m: 2.06,
            desired_open: 0,
            swing_open_01: 0.0,
        }
    }

    #[test]
    fn extraction_band_omits_residential_unit_entry_doors_except_pr() {
        assert!(apartment_unit_entry_doors_enabled_for_level(APARTMENT_PR_LEVEL));
        assert!(!apartment_unit_entry_doors_enabled_for_level(2));
        assert!(!apartment_unit_entry_doors_enabled_for_level(
            RESIDENTIAL_BAND_MIN_LEVEL - 1
        ));
        assert!(apartment_unit_entry_doors_enabled_for_level(
            RESIDENTIAL_BAND_MIN_LEVEL
        ));
    }

    #[test]
    fn interact_range_hits_player_in_front_of_hinge() {
        let row = sample_row();
        assert!(player_in_interact_range(
            &row,
            row.hinge_x - 0.5,
            row.feet_y + 0.9,
            row.hinge_z - 0.3,
        ));
    }

    #[test]
    fn interact_range_rejects_player_far_away() {
        let row = sample_row();
        assert!(!player_in_interact_range(
            &row,
            row.hinge_x + 5.0,
            row.feet_y + 0.9,
            row.hinge_z,
        ));
    }

    #[test]
    fn interact_range_rejects_player_far_above_door_band() {
        let row = sample_row();
        assert!(!player_in_interact_range(
            &row,
            row.hinge_x - 0.3,
            row.feet_y + row.panel_h_m + INTERACT_FEET_ABOVE_HEAD_SLACK_M + 6.0,
            row.hinge_z - 0.3,
        ));
    }

    #[test]
    fn interact_range_rejects_player_far_below_door_band() {
        let row = sample_row();
        assert!(!player_in_interact_range(
            &row,
            row.hinge_x - 0.3,
            row.feet_y - INTERACT_FEET_BELOW_SLACK_M - 3.0,
            row.hinge_z - 0.3,
        ));
    }

    #[test]
    fn closed_slab_aabb_spans_opening_west_face() {
        let row = sample_row();
        let (mn, mx) = closed_slab_aabb(&row);
        assert!((mn[0] - (row.hinge_x - SWING_DOOR_CLOSED_SLAB_HALF_THICK_M)).abs() < 1e-4);
        assert!((mx[0] - (row.hinge_x + SWING_DOOR_CLOSED_SLAB_HALF_THICK_M)).abs() < 1e-4);
        let z_hi = mx[2];
        let z_lo = mn[2];
        assert!((z_hi - z_lo - row.panel_w_m).abs() < 1e-4);
        assert!((mx[1] - (row.feet_y + row.panel_h_m)).abs() < 1e-4);
    }

    /// Mamutica corridor apartment doors swing **outward** (`apartmentDoorSwingInwardForTemplateId`
    /// is currently always false): parked leaf reaches west (−X) from the hinge.
    #[test]
    fn parked_leaf_aabb_extends_into_corridor_for_outward_west_face() {
        let row = sample_row();
        let (mn, mx) = parked_leaf_aabb(&row);
        let pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
        let tip_x = row.hinge_x - row.panel_w_m;
        assert!((mx[0] - row.hinge_x).abs() < 1e-4);
        assert!((mn[0] - (tip_x - pad)).abs() < 1e-4);
        assert!(mn[0] < row.hinge_x - row.panel_w_m * 0.5);
        assert!(mx[1] > mn[1]);
        assert!(mx[2] > mn[2]);
    }

    /// Doorway centre (along opening tangent, near wall plane) stays outside the thin parked-leaf Z span.
    #[test]
    fn parked_leaf_aabb_clears_player_capsule_in_doorway() {
        let row = sample_row();
        let (mn, mx) = parked_leaf_aabb(&row);
        let radius = 0.32_f32;
        let mid_x = row.hinge_x; // wall plane
        let mid_z = row.hinge_z - 0.5 * row.panel_w_m; // mid-doorway
        let cap_min = [mid_x - radius, row.feet_y + 0.25, mid_z - radius];
        let cap_max = [mid_x + radius, row.feet_y + 1.72, mid_z + radius];
        let overlaps = cap_max[0] > mn[0]
            && cap_min[0] < mx[0]
            && cap_max[1] > mn[1]
            && cap_min[1] < mx[1]
            && cap_max[2] > mn[2]
            && cap_min[2] < mx[2];
        assert!(
            !overlaps,
            "parked leaf AABB must not block centre of doorway"
        );
    }

    /// Traffic **past** the parked leaf volume west along −X should stay collision-free in XZ with the leaf.
    #[test]
    fn parked_leaf_aabb_does_not_block_far_corridor_traffic() {
        let row = sample_row();
        let (mn, mx) = parked_leaf_aabb(&row);
        let radius = 0.22_f32;
        let cx = mn[0] - 0.45;
        let cz = row.hinge_z;
        let cap_min = [cx - radius, row.feet_y + 0.25, cz - radius];
        let cap_max = [cx + radius, row.feet_y + 1.72, cz + radius];
        let overlaps =
            cap_max[0] > mn[0] && cap_min[0] < mx[0] && cap_max[2] > mn[2] && cap_min[2] < mx[2];
        assert!(
            !overlaps,
            "parked leaf must not reach arbitrarily far into −X corridor traffic"
        );
    }

    #[test]
    fn firearm_barrier_returns_parked_leaf_when_fully_open() {
        let mut row = sample_row();
        row.swing_open_01 = 1.0;
        let aabb = apartment_door_firearm_barrier_aabb(&row).expect("expected firearm barrier");
        assert!(aabb.1[0] > aabb.0[0]);
        assert!(aabb.1[2] > aabb.0[2]);
    }
}

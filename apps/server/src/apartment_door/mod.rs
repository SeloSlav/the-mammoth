//! Apartment unit entry swing doors — authoritative state, interaction, and hit-scan barriers.
//!
//! Locomotion is client-authored; this module does **not** resolve capsule-vs-door physics.
//! Shares the "corridor swing door" mechanics with [`crate::elevator`] landing doors:
//! the door anim, open/close sound kinds, interact radius, **closed-slab** geometry for
//! firearm LOS when nearly shut (open doors rely on static doorway holes), and the per-face yaw convention all come from the TSL-side
//! `@the-mammoth/world` `swingDoorCollision.ts` module. Shared formulas are covered by
//! `swingDoorCollision.test.ts` plus this module's unit tests.
//!
//! The door stock itself is codegen'd from floor JSON via
//! `scripts/gen-apartment-door-stock.ts` into `generated_apartment_doors.rs` (on the
//! server) and `generatedApartmentDoors.ts` (on the client). Rerun after editing any
//! floor doc.

use serde::Deserialize;
use spacetimedb::{ReducerContext, Table};

use crate::auth;
use crate::elevator_layout::{max_level, BUILDING_ORIGIN_Y, STOREY_SPACING_M};
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
/// Match `SWING_DOOR_INTERACT_Y_HALF_M`.
const SWING_DOOR_INTERACT_Y_HALF_M: f32 = 1.55;
/// Same walk-probe offset used when validating door interactions — recover feet Y from the head probe.
const WALK_PROBE_DY: f32 = 1.05;
/// Allow the client's reported feet hint to lead the replicated pose by up to this much.
const CLIENT_FEET_HINT_MAX_SEP_M: f32 = 2.8;

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
            seen.insert(rk.clone());
            if let Some(mut row) = ctx.db.apartment_door().row_key().find(&rk) {
                if !apartment_door_row_matches_template(&row, level, t) {
                    row.hinge_x = t.hinge_x;
                    row.hinge_z = t.hinge_z;
                    row.face = t.face;
                    row.feet_y = feet_world_y(level, t.feet_y_offset);
                    row.panel_w_m = t.panel_w_m;
                    row.panel_h_m = t.panel_h_m;
                    let _ = ctx.db.apartment_door().row_key().update(row);
                }
                continue;
            }
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
                desired_open: 0,
                swing_open_01: 0.0,
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

/// Match `packages/world/src/swingDoorCollision.ts` `SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M`.
const SWING_DOOR_HITSCAN_CLOSED_TANGENT_PAD_M: f32 = 0.6;
/// Match `SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M`.
const SWING_DOOR_HITSCAN_CLOSED_NORMAL_HALF_EXTRA_M: f32 = 0.035;
/// Match `SWING_DOOR_PASSAGE_OPEN_THRESH` — LOS clears at/above this `swing_open_01`.
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

/// Hit-scan / LOS collider separate from capsule movement: widens trimmed jamb gaps; must stay in
/// lockstep with `swingDoorFirearmBarrierAabb` in `@the-mammoth/world`.
pub fn apartment_door_firearm_barrier_aabb(row: &ApartmentDoor) -> Option<([f32; 3], [f32; 3])> {
    if row.swing_open_01 >= SWING_DOOR_PASSAGE_OPEN_THRESH_HITSCAN {
        return None;
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
        if sep_xz <= CLIENT_FEET_HINT_MAX_SEP_M && player_in_interact_range(&row, hx, hy, hz) {
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
    let cy = row.feet_y + row.panel_h_m * 0.5;
    (py - cy).abs() <= SWING_DOOR_INTERACT_Y_HALF_M
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
    let Some(mut row) = resolve_interact_target(ctx, pose, requested_row_key, client_feet_hint)
    else {
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
    if let Some(containing_unit_key) = crate::apartments::unit_key_containing_feet(
        ctx,
        client_feet_x,
        client_feet_y,
        client_feet_z,
    ) {
        if crate::apartment_door::resident_unit_key_from_door_row(&dr) != containing_unit_key {
            return;
        }
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
    if let Some(containing_unit_key) = crate::apartments::unit_key_containing_feet(
        ctx,
        client_feet_x,
        client_feet_y,
        client_feet_z,
    ) {
        if crate::apartment_door::resident_unit_key_from_door_row(&dr) != containing_unit_key {
            return;
        }
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

/// Parity with `swingDoorParkedLeafAabb` — compile-time geometry only; capsule physics omits this volume.
#[cfg(test)]
mod swing_door_parked_leaf_parity {
    use super::{ApartmentDoor, SwingDoorFace};

    pub(super) const SWING_DOOR_OPEN_LEAF_HALF_THICK_M: f32 = 0.07;
    pub(super) const SWING_DOOR_OPEN_LEAF_XZ_PAD_M: f32 = 0.04;

    #[inline]
    fn open_normal(face: SwingDoorFace) -> (f32, f32) {
        match face {
            SwingDoorFace::W => (-1.0, 0.0),
            SwingDoorFace::E => (1.0, 0.0),
            SwingDoorFace::N => (0.0, 1.0),
            SwingDoorFace::S => (0.0, -1.0),
        }
    }

    /// Match `apartmentDoorSwingInwardForTemplateId` in `manualApartmentDoorExtras.ts`.
    #[inline]
    fn apartment_door_swing_inward(_template_id: &str) -> bool {
        false
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

    pub(super) fn parked_leaf_aabb(row: &ApartmentDoor) -> ([f32; 3], [f32; 3]) {
        let face = SwingDoorFace::from_u8(row.face);
        let (tx, tz) = tip_dir_at_full_open(face, apartment_door_swing_inward(&row.template_id));
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
}

#[cfg(test)]
mod tests {
    use super::swing_door_parked_leaf_parity::{
        parked_leaf_aabb, SWING_DOOR_OPEN_LEAF_XZ_PAD_M,
    };
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
    fn interact_range_rejects_player_on_wrong_floor() {
        let row = sample_row();
        assert!(!player_in_interact_range(
            &row,
            row.hinge_x - 0.3,
            row.feet_y + 4.5,
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

    /// Apartment doors swing INTO the unit. For a W-face door the unit is to the +X side of
    /// hinge (corridor is -X), so the parked leaf must extend in +X from the hinge — NOT into
    /// the corridor. The hinge-side AABB edge is flush with the wall plane (no padding across
    /// the threshold) so a door finishing its swing does not rubber-band a crossing player.
    #[test]
    fn parked_leaf_aabb_extends_into_unit_for_inward_west_face() {
        let row = sample_row();
        let (mn, mx) = parked_leaf_aabb(&row);
        let pad = SWING_DOOR_OPEN_LEAF_XZ_PAD_M;
        assert!(
            (mn[0] - row.hinge_x).abs() < 1e-4,
            "x_min flush with wall plane (no cross-threshold pad on hinge side)",
        );
        assert!(
            (mx[0] - (row.hinge_x + row.panel_w_m + pad)).abs() < 1e-4,
            "x_max extends INTO unit by panelWidth + pad (inward swing)",
        );
    }

    /// A player whose capsule straddles the wall plane right next to the hinge Z (where the
    /// leaf lives) must NOT be pushed west — i.e. the AABB must NOT reach across the wall
    /// into the corridor at all. Regression guard against the pre-fix "rubber-banding at
    /// the threshold" bug.
    #[test]
    fn parked_leaf_aabb_never_extends_into_corridor_for_inward_west_face() {
        let row = sample_row();
        let (mn, _mx) = parked_leaf_aabb(&row);
        assert!(
            mn[0] >= row.hinge_x - 1e-4,
            "AABB hinge-side must sit at or east of the wall plane (got {:.4}, wall {:.4})",
            mn[0],
            row.hinge_x,
        );
    }

    /// Player capsule walking through the centre of a parked-open (inward) doorway must NOT
    /// overlap the parked-leaf AABB — the leaf is inside the unit, corridor and doorway clear.
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

    /// Corridor-side traffic (the ORIGINAL bug: open door juts into corridor) is now clear.
    /// A player walking past the doorway on the corridor side at the hinge's z should NOT
    /// collide with the parked-leaf AABB because the leaf lives inside the unit.
    #[test]
    fn parked_leaf_aabb_does_not_block_corridor_past_doorway() {
        let row = sample_row();
        let (mn, mx) = parked_leaf_aabb(&row);
        let radius = 0.22_f32;
        // Player 0.3 m INTO the corridor (west of hinge) and at hinge z.
        let cx = row.hinge_x - 0.3;
        let cz = row.hinge_z;
        let cap_min = [cx - radius, row.feet_y + 0.25, cz - radius];
        let cap_max = [cx + radius, row.feet_y + 1.72, cz + radius];
        let overlaps =
            cap_max[0] > mn[0] && cap_min[0] < mx[0] && cap_max[2] > mn[2] && cap_min[2] < mx[2];
        assert!(!overlaps, "parked leaf must not block corridor traffic");
    }
}

//! Apartment units — claim, reinforcement pulse, stash push/pull, door gameplay keys.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::accounts::user;
use crate::apartment_door::{apartment_door, building_floor_refs, ApartmentDoor, SwingDoorFace};
use crate::apartment_stash_rules::{
    apartment_stash_accepts_def_id, apartment_stash_rejection_hint, apartment_stash_slot_count,
    apartment_stash_slot_index_valid,
};
use crate::auth;
use crate::crafting;
use crate::elevator_layout::max_level;
use crate::elevator_layout::{BUILDING_ORIGIN_Y, RESIDENTIAL_BAND_MIN_LEVEL, STOREY_SPACING_M};
use crate::feature_flags;
use crate::generated_apartment_doors::{
    ApartmentDoorTemplate as GenTemplate, APARTMENT_DOOR_TEMPLATE_SETS,
};
use crate::inventory::{
    self, find_item_in_hotbar_slot, find_item_in_inventory_slot, find_item_in_stash_slot,
    first_empty_player_carry_slot, inventory_item, NUM_PLAYER_HOTBAR_SLOTS,
    NUM_PLAYER_INVENTORY_SLOTS,
};
use crate::inventory_models::{
    apartment_stash_key, apartment_stash_key_decor, parse_apartment_stash_key_v2,
    HotbarLocationData, InventoryLocationData, ItemLocation, ParsedApartmentStashKey,
    StashLocationData, APARTMENT_STASH_KIND_FISH_TANK, APARTMENT_STASH_KIND_FOOTLOCKER,
    APARTMENT_STASH_KIND_FRIDGE, APARTMENT_STASH_KIND_GROW_TRAY, APARTMENT_STASH_KIND_STOVE,
    APARTMENT_STASH_KIND_WARDROBE, APARTMENT_STASH_KIND_WATER_TANK,
};
use crate::player_vitals;
use crate::pose::{player_pose, PlayerPose};
use crate::world_sound;

/// 0 open (unclaimed lootable), 1 claimed, 2 broken corridor state.
pub(crate) const UNIT_STATE_UNCLAIMED: u8 = 0;
pub(crate) const UNIT_STATE_CLAIMED: u8 = 1;
pub(crate) const UNIT_STATE_BROKEN: u8 = 2;
/// Occupied façade on the residential top band (`RESIDENTIAL_BAND_MIN_LEVEL` … `max_level`) — NPC
/// shell later; players cannot loot-claim (`door-lock`/`screwdriver` hold).
pub(crate) const UNIT_STATE_SHELL_OCCUPIED: u8 = 4;

pub(crate) const MAMUTICA_TYPICAL_FLOOR_DOC_ID: &str = "floor_mamutica_typical";

/// Roof-slab playable homes on **`floor_mamutica_typical`** (**`unit_e_003` first** — designated
/// east-wing corner penthouse spawn). Overflow slots prevent multi-player identity starvation in dev.
const HOME_BAND_UNIT_IDS: &[&str] = &["unit_e_003", "unit_w_003", "unit_e_014", "unit_w_014"];

const CLAIM_FULL_SECS: f32 = if feature_flags::APARTMENT_CLAIM_FAST_FOR_TESTING {
    1.0
} else {
    30.0
};
const REINFORCE_HOLD_SECS: f32 = 22.0;
/// Horizontal radius² (m²) per built-in stash anchor — feet pose is compared on **XZ** against the
/// authored column; vertical tolerance is separate (`pose_feet_vertical_ok_for_interact`). Keep
/// `r = sqrt(r_sq)` aligned with `apartmentBuiltinStashInteractRadiusM` in `fpApartmentGameplay.ts`.
#[inline]
fn stash_interact_radius_sq(stash_kind: &str) -> f32 {
    let r = match stash_kind {
        APARTMENT_STASH_KIND_WARDROBE => 1.27,
        APARTMENT_STASH_KIND_FRIDGE => 1.30,
        APARTMENT_STASH_KIND_STOVE => 1.14,
        APARTMENT_STASH_KIND_WATER_TANK => 1.08,
        APARTMENT_STASH_KIND_FISH_TANK => 1.50,
        APARTMENT_STASH_KIND_FOOTLOCKER => 1.10,
        _ => 1.10,
    };
    r * r
}

const INTERACT_FEET_Y_BELOW_SLACK_M: f32 = 0.55;
const INTERACT_FEET_Y_ABOVE_SLACK_M: f32 = 2.85;

#[inline]
fn pose_feet_vertical_ok_for_interact(unit_floor_y: f32, pose_y: f32) -> bool {
    pose_y >= unit_floor_y - INTERACT_FEET_Y_BELOW_SLACK_M
        && pose_y <= unit_floor_y + INTERACT_FEET_Y_ABOVE_SLACK_M
}

/// Horizontal cylinder (+ vertical slab) around an interact anchor — matches client
/// `nearWardrobe` / `nearFootlocker` (`fpApartmentGameplay.ts`).
#[inline]
fn pose_near_horizontal_marker(
    pose_x: f32,
    pose_y: f32,
    pose_z: f32,
    ax: f32,
    az: f32,
    unit_floor_y: f32,
    interact_r_sq: f32,
) -> bool {
    let dx = pose_x - ax;
    let dz = pose_z - az;
    if dx * dx + dz * dz > interact_r_sq {
        return false;
    }
    pose_feet_vertical_ok_for_interact(unit_floor_y, pose_y)
}

fn cancel_other_active_claims_for_player(
    ctx: &ReducerContext,
    sender: Identity,
    except_unit_key: &str,
) {
    for mut u in ctx.db.apartment_unit().iter() {
        if u.unit_key == except_unit_key {
            continue;
        }
        if u.claim_started_by == Some(sender) {
            u.claim_progress_secs = 0.0;
            u.claim_started_by = None;
            u.last_claim_pulse_micros = 0;
            ctx.db.apartment_unit().unit_key().update(u);
        }
    }
}

/// Human-facing label for HUD notices / logs (`unit_w_005` → "Floor 3, West 5").
fn format_apartment_public_label(level: u32, unit_id: &str) -> String {
    let residential_floor = level.saturating_sub(1).max(1);
    if let Some(rest) = unit_id.strip_prefix("unit_w_") {
        if let Ok(n) = rest.parse::<u32>() {
            return format!("Floor {residential_floor}, West {n}");
        }
    }
    if let Some(rest) = unit_id.strip_prefix("unit_e_") {
        if let Ok(n) = rest.parse::<u32>() {
            return format!("Floor {residential_floor}, East {n}");
        }
    }
    format!("Floor {level}, {unit_id}")
}

#[spacetimedb::table(public, accessor = apartment_unit)]
pub struct ApartmentUnit {
    #[primary_key]
    pub unit_key: String,
    pub floor_doc_id: String,
    pub level: u32,
    pub unit_id: String,
    pub state: u8,
    pub owner: Option<Identity>,
    pub claim_progress_secs: f32,
    pub claim_started_by: Option<Identity>,
    pub last_claim_pulse_micros: i64,
    pub reinforce_progress_secs: f32,
    pub reinforce_by: Option<Identity>,
    pub reinforced: u8,
    pub bed_x: f32,
    pub bed_y: f32,
    pub bed_z: f32,
    pub bed_yaw: f32,
    pub foot_x: f32,
    pub foot_y: f32,
    pub foot_z: f32,
    pub wardrobe_x: f32,
    pub wardrobe_z: f32,
    pub stove_x: f32,
    pub stove_z: f32,
    pub bound_min_x: f32,
    pub bound_max_x: f32,
    pub bound_min_z: f32,
    pub bound_max_z: f32,
    pub bound_min_y: f32,
    pub bound_max_y: f32,
}

#[inline]
pub(crate) fn is_home_candidate_unit_row(u: &ApartmentUnit, max_lv: u32) -> bool {
    u.floor_doc_id == MAMUTICA_TYPICAL_FLOOR_DOC_ID
        && u.level == max_lv
        && HOME_BAND_UNIT_IDS.contains(&u.unit_id.as_str())
}

/// Idle home slots on the roof slab — omit from procedural apartment-floor loot churn.
#[inline]
pub(crate) fn is_vacant_home_pool_unit_row(u: &ApartmentUnit) -> bool {
    let max_lv = max_level();
    u.state == UNIT_STATE_UNCLAIMED && is_home_candidate_unit_row(u, max_lv)
}

#[spacetimedb::table(public, accessor = apartment_door_gameplay)]
pub struct ApartmentDoorGameplay {
    #[primary_key]
    pub row_key: String,
    pub door_hp: f32,
    pub breached: u8,
}

#[spacetimedb::table(public, accessor = flashlight_charge)]
pub struct FlashlightCharge {
    #[primary_key]
    pub item_instance_id: u64,
    pub charge: f32,
}

/// Player-placed decor models inside a **claimed** apartment — see `add_apartment_unit_decor` / reducers.
#[spacetimedb::table(public, accessor = apartment_unit_decor)]
pub struct ApartmentUnitDecor {
    #[primary_key]
    #[auto_inc]
    pub decor_id: u64,
    pub unit_key: String,
    /// Repo-relative under site root, e.g. `static/models/objects/chair.glb` or `.obj` (validated server-side).
    pub model_rel_path: String,
    pub pos_x: f32,
    pub pos_y: f32,
    pub pos_z: f32,
    pub yaw_rad: f32,
    /// Tilt around local X after yaw (`YXZ` euler — matches Three.js decor roots).
    pub pitch_rad: f32,
    /// Roll around local Z after pitch/yaw (`YXZ` euler — matches Three.js decor roots).
    pub roll_rad: f32,
    pub uniform_scale: f32,
    /// `0` plain decor; `1` bed (spawn anchor); `2` wardrobe (claim + stash); `3` footlocker stash; `4` stove stash; `5` fridge stash; `6` water tank stash.
    pub item_kind: u8,
}

/// Keep in sync with `@the-mammoth/schemas` `APARTMENT_UNIT_DECOR_ITEM_KIND_*`.
pub(crate) const APARTMENT_DECOR_ITEM_KIND_PLAIN: u8 = 0;
pub(crate) const APARTMENT_DECOR_ITEM_KIND_BED: u8 = 1;
pub(crate) const APARTMENT_DECOR_ITEM_KIND_WARDROBE: u8 = 2;
pub(crate) const APARTMENT_DECOR_ITEM_KIND_FOOTLOCKER: u8 = 3;
pub(crate) const APARTMENT_DECOR_ITEM_KIND_STOVE: u8 = 4;
pub(crate) const APARTMENT_DECOR_ITEM_KIND_FRIDGE: u8 = 5;
pub(crate) const APARTMENT_DECOR_ITEM_KIND_WATER_TANK: u8 = 6;
pub(crate) const APARTMENT_DECOR_ITEM_KIND_FISH_TANK: u8 = 7;

/// `set_owned_apartment_piece_pose(..., piece, ...)`.
pub(crate) const APARTMENT_LAYOUT_PIECE_BED: u8 = 0;
pub(crate) const APARTMENT_LAYOUT_PIECE_WARDROBE: u8 = 1;
pub(crate) const APARTMENT_LAYOUT_PIECE_FOOTLOCKER: u8 = 2;
pub(crate) const APARTMENT_LAYOUT_PIECE_STOVE: u8 = 3;

const APARTMENT_LAYOUT_BED_XZ_INSET_M: f32 = 2.95;
const APARTMENT_LAYOUT_WARDROBE_XZ_INSET_M: f32 = 0.48;
const APARTMENT_LAYOUT_FOOTLOCKER_XZ_INSET_M: f32 = 0.42;
const APARTMENT_LAYOUT_STOVE_XZ_INSET_M: f32 = 0.42;
/// Keep authored decor away from façade / hull — looser than built-ins.
const APARTMENT_DECOR_BOUND_INSET_XZ_M: f32 = 0.18;

const APARTMENT_DECOR_COUNT_CAP: usize = 48;
const APARTMENT_DECOR_MODEL_EXTENSIONS: &[&str] = &[".glb", ".obj"];
/// Keep in sync with `OWNED_APARTMENT_DECOR_PITCH_RAD_MAX` in `@the-mammoth/schemas`.
const APARTMENT_DECOR_PITCH_LIMIT_RAD: f32 = 1.4;
/// Keep in sync with `OWNED_APARTMENT_DECOR_ROLL_RAD_MAX` in `@the-mammoth/schemas`.
const APARTMENT_DECOR_ROLL_LIMIT_RAD: f32 = 1.4;
/// Keep in sync with `OWNED_APARTMENT_DECOR_UNIFORM_SCALE_MIN` in `@the-mammoth/schemas`.
const APARTMENT_DECOR_UNIFORM_SCALE_MIN: f32 = 0.02;
/// Keep in sync with decor `uniformScale` max in `@the-mammoth/schemas`.
const APARTMENT_DECOR_UNIFORM_SCALE_MAX: f32 = 5.5;

fn clear_apartment_decor_for_unit(ctx: &ReducerContext, unit_key: &str) {
    let ids: Vec<u64> = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| d.unit_key.as_str() == unit_key)
        .map(|d| d.decor_id)
        .collect();
    let decor_table = ctx.db.apartment_unit_decor();
    for id in ids {
        decor_table.decor_id().delete(id);
    }
}

fn decor_model_rel_path_ok(s: &str) -> bool {
    let t = s.trim();
    let t = t.trim_start_matches('/');
    if !(12..=200).contains(&t.len()) {
        return false;
    }
    if t.contains("..") {
        return false;
    }
    let lower = t.to_ascii_lowercase();
    let supported_ext = APARTMENT_DECOR_MODEL_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(ext));
    if !t.starts_with("static/models/") || !supported_ext {
        return false;
    }
    t.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '.'))
}

fn wrap_angle_rad(mut a: f32) -> f32 {
    use std::f32::consts::PI;
    let two_pi = 2.0 * PI;
    while a > PI {
        a -= two_pi;
    }
    while a < -PI {
        a += two_pi;
    }
    a
}

fn xz_insets_for_piece(piece: u8) -> Option<f32> {
    match piece {
        APARTMENT_LAYOUT_PIECE_BED => Some(APARTMENT_LAYOUT_BED_XZ_INSET_M),
        APARTMENT_LAYOUT_PIECE_WARDROBE => Some(APARTMENT_LAYOUT_WARDROBE_XZ_INSET_M),
        APARTMENT_LAYOUT_PIECE_FOOTLOCKER => Some(APARTMENT_LAYOUT_FOOTLOCKER_XZ_INSET_M),
        APARTMENT_LAYOUT_PIECE_STOVE => Some(APARTMENT_LAYOUT_STOVE_XZ_INSET_M),
        _ => None,
    }
}

fn clamp_piece_world_xz(unit: &ApartmentUnit, piece: u8, x: f32, z: f32) -> Option<(f32, f32)> {
    let inset = xz_insets_for_piece(piece)?;
    let min_x = unit.bound_min_x + inset;
    let max_x = unit.bound_max_x - inset;
    let min_z = unit.bound_min_z + inset;
    let max_z = unit.bound_max_z - inset;
    if min_x > max_x || min_z > max_z {
        return None;
    }
    Some((x.clamp(min_x, max_x), z.clamp(min_z, max_z)))
}

#[inline]
fn clamp_bed_world_y(unit: &ApartmentUnit, y: f32) -> f32 {
    let lo = unit.bound_min_y + 0.004;
    let hi = unit.bound_min_y + 3.05;
    y.clamp(lo, hi)
}

fn clamp_decor_pose(
    unit: &ApartmentUnit,
    mut x: f32,
    mut y: f32,
    mut z: f32,
    yaw: f32,
    pitch: f32,
    roll: f32,
    scale: f32,
) -> (f32, f32, f32, f32, f32, f32, f32) {
    let inset = APARTMENT_DECOR_BOUND_INSET_XZ_M;
    let min_x = unit.bound_min_x + inset;
    let max_x = unit.bound_max_x - inset;
    let min_z = unit.bound_min_z + inset;
    let max_z = unit.bound_max_z - inset;
    x = x.clamp(min_x, max_x);
    z = z.clamp(min_z, max_z);
    let y_lo = unit.bound_min_y + 0.008;
    let y_hi = unit.bound_max_y + 2.75;
    y = y.clamp(y_lo, y_hi);
    let scale_clamped = scale.clamp(
        APARTMENT_DECOR_UNIFORM_SCALE_MIN,
        APARTMENT_DECOR_UNIFORM_SCALE_MAX,
    );
    let pitch_clamped = pitch.clamp(
        -APARTMENT_DECOR_PITCH_LIMIT_RAD,
        APARTMENT_DECOR_PITCH_LIMIT_RAD,
    );
    let roll_clamped = roll.clamp(
        -APARTMENT_DECOR_ROLL_LIMIT_RAD,
        APARTMENT_DECOR_ROLL_LIMIT_RAD,
    );
    (
        x,
        y,
        z,
        wrap_angle_rad(yaw),
        pitch_clamped,
        roll_clamped,
        scale_clamped,
    )
}

fn player_may_layout_owned_apartment(
    ctx: &ReducerContext,
    unit_key: &str,
    require_inside: bool,
) -> Option<ApartmentUnit> {
    let sender = ctx.sender();
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())?;
    if unit.owner != Some(sender) || unit.state != UNIT_STATE_CLAIMED {
        return None;
    }
    if require_inside {
        let pose = ctx.db.player_pose().identity().find(&sender)?;
        if !feet_inside_unit(&unit, pose.x, pose.y, pose.z) {
            return None;
        }
    }
    Some(unit)
}

fn authorize_apartment_decor_row(
    ctx: &ReducerContext,
    decor_id: u64,
) -> Option<(ApartmentUnit, ApartmentUnitDecor)> {
    let decor = ctx.db.apartment_unit_decor().decor_id().find(decor_id)?;
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(decor.unit_key.clone())?;
    if unit.owner != Some(ctx.sender()) || unit.state != UNIT_STATE_CLAIMED {
        return None;
    }
    Some((unit, decor))
}

fn infer_decor_item_kind_from_model_rel_path(model_rel_path: &str) -> u8 {
    let p = model_rel_path.trim().trim_start_matches('/');
    if p.ends_with("objects/water-tank.glb") {
        return APARTMENT_DECOR_ITEM_KIND_WATER_TANK;
    }
    if p.ends_with("objects/fridge.glb") {
        return APARTMENT_DECOR_ITEM_KIND_FRIDGE;
    }
    if p.ends_with("objects/stove.glb") {
        return APARTMENT_DECOR_ITEM_KIND_STOVE;
    }
    if p.ends_with("objects/footlocker.glb") {
        return APARTMENT_DECOR_ITEM_KIND_FOOTLOCKER;
    }
    if p.ends_with("objects/wardrobe-closet.glb") {
        return APARTMENT_DECOR_ITEM_KIND_WARDROBE;
    }
    if p.ends_with("objects/bed.glb") {
        return APARTMENT_DECOR_ITEM_KIND_BED;
    }
    if p.ends_with("objects/fish-tank.glb") {
        return APARTMENT_DECOR_ITEM_KIND_FISH_TANK;
    }
    APARTMENT_DECOR_ITEM_KIND_PLAIN
}

/// Replica `item_kind` with GLB fallback when rows were saved as plain décor.
pub(crate) fn effective_decor_item_kind(item_kind: u8, model_rel_path: &str) -> u8 {
    if item_kind != APARTMENT_DECOR_ITEM_KIND_PLAIN {
        return item_kind;
    }
    infer_decor_item_kind_from_model_rel_path(model_rel_path)
}

fn decor_stash_radius_kind(item_kind: u8) -> &'static str {
    match item_kind {
        APARTMENT_DECOR_ITEM_KIND_WARDROBE => APARTMENT_STASH_KIND_WARDROBE,
        APARTMENT_DECOR_ITEM_KIND_STOVE => APARTMENT_STASH_KIND_STOVE,
        APARTMENT_DECOR_ITEM_KIND_FRIDGE => APARTMENT_STASH_KIND_FRIDGE,
        APARTMENT_DECOR_ITEM_KIND_WATER_TANK => APARTMENT_STASH_KIND_WATER_TANK,
        APARTMENT_DECOR_ITEM_KIND_FISH_TANK => APARTMENT_STASH_KIND_FISH_TANK,
        _ => APARTMENT_STASH_KIND_FOOTLOCKER,
    }
}

fn decor_stash_radius_kind_for_row(item_kind: u8, model_rel_path: &str) -> &'static str {
    decor_stash_radius_kind(effective_decor_item_kind(item_kind, model_rel_path))
}

fn decor_stash_display_name_static(item_kind: u8) -> &'static str {
    match item_kind {
        APARTMENT_DECOR_ITEM_KIND_WARDROBE => "wardrobe",
        APARTMENT_DECOR_ITEM_KIND_STOVE => "stove",
        APARTMENT_DECOR_ITEM_KIND_FRIDGE => "fridge",
        APARTMENT_DECOR_ITEM_KIND_WATER_TANK => "water tank",
        APARTMENT_DECOR_ITEM_KIND_FISH_TANK => "fish tank",
        _ => "footlocker",
    }
}

fn decor_stash_display_name_for_row(item_kind: u8, model_rel_path: &str) -> &'static str {
    decor_stash_display_name_static(effective_decor_item_kind(item_kind, model_rel_path))
}

fn sync_apartment_unit_columns_from_decor(ctx: &ReducerContext, unit_key: &str) {
    let Some(mut unit) = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
    else {
        return;
    };
    let rows: Vec<ApartmentUnitDecor> = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| d.unit_key.as_str() == unit_key)
        .collect();

    if let Some(b) = rows
        .iter()
        .filter(|d| d.item_kind == APARTMENT_DECOR_ITEM_KIND_BED)
        .min_by_key(|d| d.decor_id)
    {
        unit.bed_x = b.pos_x;
        unit.bed_y = b.pos_y;
        unit.bed_z = b.pos_z;
        unit.bed_yaw = b.yaw_rad;
    }
    if let Some(w) = rows
        .iter()
        .filter(|d| d.item_kind == APARTMENT_DECOR_ITEM_KIND_WARDROBE)
        .min_by_key(|d| d.decor_id)
    {
        unit.wardrobe_x = w.pos_x;
        unit.wardrobe_z = w.pos_z;
    }
    if let Some(f) = rows
        .iter()
        .filter(|d| d.item_kind == APARTMENT_DECOR_ITEM_KIND_FOOTLOCKER)
        .min_by_key(|d| d.decor_id)
    {
        unit.foot_x = f.pos_x;
        unit.foot_z = f.pos_z;
    }
    if let Some(s) = rows
        .iter()
        .filter(|d| d.item_kind == APARTMENT_DECOR_ITEM_KIND_STOVE)
        .min_by_key(|d| d.decor_id)
    {
        unit.stove_x = s.pos_x;
        unit.stove_z = s.pos_z;
    }
    ctx.db.apartment_unit().unit_key().update(unit);
}

pub(crate) fn primary_bed_row_for_unit_key(
    ctx: &ReducerContext,
    unit_key: &str,
) -> Option<ApartmentUnitDecor> {
    ctx.db
        .apartment_unit_decor()
        .iter()
        .filter(|d| d.unit_key.as_str() == unit_key && d.item_kind == APARTMENT_DECOR_ITEM_KIND_BED)
        .min_by_key(|d| d.decor_id)
}

fn player_near_any_wardrobe_decor(
    ctx: &ReducerContext,
    unit: &ApartmentUnit,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    for d in ctx.db.apartment_unit_decor().iter() {
        if d.unit_key.as_str() != unit.unit_key.as_str() {
            continue;
        }
        if d.item_kind != APARTMENT_DECOR_ITEM_KIND_WARDROBE {
            continue;
        }
        if feet_inside_unit(unit, x, y, z)
            && pose_near_horizontal_marker(
                x,
                y,
                z,
                d.pos_x,
                d.pos_z,
                unit.foot_y,
                stash_interact_radius_sq(APARTMENT_STASH_KIND_WARDROBE),
            )
        {
            return true;
        }
    }
    false
}

#[inline]
fn plate_world_y(level: u32) -> f32 {
    BUILDING_ORIGIN_Y + (level.max(1) as f32 - 1.0) * STOREY_SPACING_M
}

fn feet_world_y(level: u32, feet_y_offset: f32) -> f32 {
    plate_world_y(level) + feet_y_offset
}

fn unit_key_parts(floor_doc_id: &str, level: u32, unit_id: &str) -> String {
    format!("{floor_doc_id}|{level}|{unit_id}")
}

/// Matches `RESIDENTIAL_UNIT_BALCONY_OVERHANG_M` in `packages/world/src/residentialUnitBalcony.ts`.
fn residential_unit_balcony_overhang_m(unit_id: &str) -> f32 {
    const OVERHANG: f32 = 2.5;
    if unit_id.starts_with("unit_e_") || unit_id.starts_with("unit_w_") {
        OVERHANG
    } else {
        0.0
    }
}

fn derive_bounds(t: &GenTemplate, level: u32) -> ([f32; 3], [f32; 3]) {
    let feet_y = feet_world_y(level, t.feet_y_offset);
    let top_y = feet_y + 3.0;
    let face = SwingDoorFace::from_u8(t.face);
    let balcony = residential_unit_balcony_overhang_m(&t.unit_id);
    const DEPTH: f32 = 13.0;
    const HALF_WIDTH: f32 = 3.3;
    // Template depth terminates on the façade plane; playable volume ends short of exterior glass.
    const RESIDENTIAL_FAR_WALL_X_INSET_M: f32 = 1.38;
    match face {
        SwingDoorFace::W => (
            [t.hinge_x + 0.08, feet_y - 0.06, t.hinge_z - HALF_WIDTH],
            [
                t.hinge_x + DEPTH - RESIDENTIAL_FAR_WALL_X_INSET_M + balcony,
                top_y,
                t.hinge_z + HALF_WIDTH,
            ],
        ),
        SwingDoorFace::E => (
            [
                t.hinge_x - DEPTH + RESIDENTIAL_FAR_WALL_X_INSET_M - balcony,
                feet_y - 0.06,
                t.hinge_z - HALF_WIDTH,
            ],
            [t.hinge_x - 0.08, top_y, t.hinge_z + HALF_WIDTH],
        ),
        _ => (
            [t.hinge_x - HALF_WIDTH, feet_y - 0.06, t.hinge_z - DEPTH],
            [t.hinge_x + HALF_WIDTH, top_y, t.hinge_z + HALF_WIDTH],
        ),
    }
}

pub(crate) fn feet_inside_unit(unit: &ApartmentUnit, x: f32, y: f32, z: f32) -> bool {
    x >= unit.bound_min_x
        && x <= unit.bound_max_x
        && z >= unit.bound_min_z
        && z <= unit.bound_max_z
        && y >= unit.bound_min_y - 0.05
        && y <= unit.bound_max_y + 2.45
}

pub(crate) fn unit_key_containing_feet(
    ctx: &ReducerContext,
    x: f32,
    y: f32,
    z: f32,
) -> Option<String> {
    let mut best: Option<(String, f32)> = None;
    for u in ctx.db.apartment_unit().iter() {
        if !feet_inside_unit(&u, x, y, z) {
            continue;
        }
        let cx = (u.bound_min_x + u.bound_max_x) * 0.5;
        let cz = (u.bound_min_z + u.bound_max_z) * 0.5;
        let d = (x - cx).powi(2) + (z - cz).powi(2);
        if best.as_ref().map(|(_, bd)| d < *bd).unwrap_or(true) {
            best = Some((u.unit_key.clone(), d));
        }
    }
    best.map(|(unit_key, _)| unit_key)
}

fn refresh_residential_band_unit_states(ctx: &ReducerContext) {
    let max_lv = max_level();
    for mut u in ctx.db.apartment_unit().iter() {
        if !u.unit_id.starts_with("unit_e_") && !u.unit_id.starts_with("unit_w_") {
            continue;
        }
        if u.state == UNIT_STATE_BROKEN {
            continue;
        }
        let in_band = u.level >= RESIDENTIAL_BAND_MIN_LEVEL && u.level <= max_lv;
        let home_slot = is_home_candidate_unit_row(&u, max_lv);

        if !in_band {
            if u.state == UNIT_STATE_SHELL_OCCUPIED {
                clear_apartment_decor_for_unit(ctx, &u.unit_key);
                u.state = UNIT_STATE_UNCLAIMED;
                u.owner = None;
                u.claim_started_by = None;
                u.claim_progress_secs = 0.0;
                u.last_claim_pulse_micros = 0;
                ctx.db.apartment_unit().unit_key().update(u);
            }
            continue;
        }

        if u.state == UNIT_STATE_CLAIMED {
            continue;
        }

        if home_slot {
            if u.state == UNIT_STATE_SHELL_OCCUPIED {
                clear_apartment_decor_for_unit(ctx, &u.unit_key);
                u.state = UNIT_STATE_UNCLAIMED;
                u.owner = None;
                u.claim_started_by = None;
                u.claim_progress_secs = 0.0;
                u.last_claim_pulse_micros = 0;
                ctx.db.apartment_unit().unit_key().update(u);
            }
            continue;
        }

        if u.state != UNIT_STATE_SHELL_OCCUPIED {
            clear_apartment_decor_for_unit(ctx, &u.unit_key);
            u.state = UNIT_STATE_SHELL_OCCUPIED;
            u.owner = None;
            u.claim_started_by = None;
            u.claim_progress_secs = 0.0;
            u.last_claim_pulse_micros = 0;
            ctx.db.apartment_unit().unit_key().update(u);
        }
    }
}

/// Auto-grant the first free roof-slab corner home from [`HOME_BAND_UNIT_IDS`] (`max_level`, typical floor).
pub(crate) fn ensure_player_home_apartment(ctx: &ReducerContext, id: Identity) {
    for u in ctx.db.apartment_unit().iter() {
        if u.owner == Some(id) && u.state == UNIT_STATE_CLAIMED {
            return;
        }
    }
    let max_lv = max_level();
    for stub_id in HOME_BAND_UNIT_IDS {
        let uk = unit_key_parts(MAMUTICA_TYPICAL_FLOOR_DOC_ID, max_lv, stub_id);
        let Some(mut u) = ctx.db.apartment_unit().unit_key().find(&uk) else {
            continue;
        };
        if u.state != UNIT_STATE_UNCLAIMED {
            continue;
        }
        u.state = UNIT_STATE_CLAIMED;
        u.owner = Some(id);
        u.claim_progress_secs = 0.0;
        u.claim_started_by = None;
        u.last_claim_pulse_micros = 0;
        ctx.db.apartment_unit().unit_key().update(u);
        return;
    }
    log::warn!("ensure_player_home_apartment: no vacant home slab slot remaining");
}

pub fn seed_apartment_units(ctx: &ReducerContext) {
    const BED_FRAC_X: f32 = 0.62;
    const BED_FRAC_Z: f32 = 0.48;
    const BED_EDGE_MARGIN: f32 = 0.85;

    let refs = building_floor_refs();
    let max_lv = max_level();
    let mut seen = std::collections::HashSet::<String>::new();
    for (level, floor_doc_id) in refs.iter().copied() {
        if level < 1 || level > max_lv {
            continue;
        }
        let templates = template_set_for_floor(floor_doc_id);
        for t in templates {
            if !(t.unit_id.starts_with("unit_e_") || t.unit_id.starts_with("unit_w_")) {
                continue;
            }
            let uk = unit_key_parts(floor_doc_id, level, t.unit_id);
            if !seen.insert(uk.clone()) {
                continue;
            }
            let existing = ctx.db.apartment_unit().unit_key().find(&uk);
            let (mn, mx) = derive_bounds(t, level);
            let sx = mx[0] - mn[0];
            let sz = mx[2] - mn[2];
            let face = SwingDoorFace::from_u8(t.face);

            let (bed_x, bed_z, bed_yaw, foot_x, foot_z, wardrobe_x, wardrobe_z, stove_x, stove_z) =
                if let Some(seed) =
                    crate::apartment_interior_anchors::east_west_interior_furniture_seed(
                        &mn, &mx, t.hinge_x, t.hinge_z, face,
                    )
                {
                    (
                        seed.bed_x,
                        seed.bed_z,
                        seed.bed_yaw,
                        seed.foot_x,
                        seed.foot_z,
                        seed.wardrobe_x,
                        seed.wardrobe_z,
                        seed.stove_x,
                        seed.stove_z,
                    )
                } else {
                    let bed_x_frac = (mn[0] + BED_FRAC_X * sx)
                        .clamp(mn[0] + BED_EDGE_MARGIN, mx[0] - BED_EDGE_MARGIN);
                    let bed_z_frac = (mn[2] + BED_FRAC_Z * sz)
                        .clamp(mn[2] + BED_EDGE_MARGIN, mx[2] - BED_EDGE_MARGIN);
                    let bed_yaw_legacy = match face {
                        SwingDoorFace::W => std::f32::consts::FRAC_PI_2,
                        SwingDoorFace::E => -std::f32::consts::FRAC_PI_2,
                        _ => 0.0,
                    };
                    let (wardrobe_xz, foot_xz) =
                        crate::apartment_interior_anchors::wardrobe_and_footlocker_xz_for_unit_seed(
                            mn[0], mx[0], mn[2], mx[2], t.hinge_x, t.hinge_z, t.face,
                        );
                    let (stove_x, stove_z) =
                        crate::apartment_interior_anchors::stove_corner_seed_xz(&mn, &mx);
                    (
                        bed_x_frac,
                        bed_z_frac,
                        bed_yaw_legacy,
                        foot_xz[0],
                        foot_xz[1],
                        wardrobe_xz[0],
                        wardrobe_xz[1],
                        stove_x,
                        stove_z,
                    )
                };
            if let Some(mut row) = existing {
                let changed = row.floor_doc_id != floor_doc_id
                    || row.level != level
                    || row.unit_id != t.unit_id
                    || (row.bed_x - bed_x).abs() > 1e-4
                    || (row.bed_y - (mn[1] + 0.01)).abs() > 1e-4
                    || (row.bed_z - bed_z).abs() > 1e-4
                    || (row.bed_yaw - bed_yaw).abs() > 1e-4
                    || (row.foot_x - foot_x).abs() > 1e-4
                    || (row.foot_y - mn[1]).abs() > 1e-4
                    || (row.foot_z - foot_z).abs() > 1e-4
                    || (row.wardrobe_x - wardrobe_x).abs() > 1e-4
                    || (row.wardrobe_z - wardrobe_z).abs() > 1e-4
                    || (row.stove_x - stove_x).abs() > 1e-4
                    || (row.stove_z - stove_z).abs() > 1e-4
                    || (row.bound_min_x - mn[0]).abs() > 1e-4
                    || (row.bound_max_x - mx[0]).abs() > 1e-4
                    || (row.bound_min_z - mn[2]).abs() > 1e-4
                    || (row.bound_max_z - mx[2]).abs() > 1e-4
                    || (row.bound_min_y - mn[1]).abs() > 1e-4
                    || (row.bound_max_y - mx[1]).abs() > 1e-4;
                if changed {
                    row.floor_doc_id = floor_doc_id.to_string();
                    row.level = level;
                    row.unit_id = t.unit_id.to_string();
                    row.bed_x = bed_x;
                    row.bed_y = mn[1] + 0.01;
                    row.bed_z = bed_z;
                    row.bed_yaw = bed_yaw;
                    row.foot_x = foot_x;
                    row.foot_y = mn[1];
                    row.foot_z = foot_z;
                    row.wardrobe_x = wardrobe_x;
                    row.wardrobe_z = wardrobe_z;
                    row.stove_x = stove_x;
                    row.stove_z = stove_z;
                    row.bound_min_x = mn[0];
                    row.bound_max_x = mx[0];
                    row.bound_min_z = mn[2];
                    row.bound_max_z = mx[2];
                    row.bound_min_y = mn[1];
                    row.bound_max_y = mx[1];
                    ctx.db.apartment_unit().unit_key().update(row);
                }
                continue;
            }
            let _ = ctx.db.apartment_unit().insert(ApartmentUnit {
                unit_key: uk,
                floor_doc_id: floor_doc_id.to_string(),
                level,
                unit_id: t.unit_id.to_string(),
                state: UNIT_STATE_UNCLAIMED,
                owner: None,
                claim_progress_secs: 0.0,
                claim_started_by: None,
                last_claim_pulse_micros: 0,
                reinforce_progress_secs: 0.0,
                reinforce_by: None,
                reinforced: 0,
                bed_x,
                bed_y: mn[1] + 0.01,
                bed_z,
                bed_yaw,
                foot_x,
                foot_y: mn[1],
                foot_z,
                wardrobe_x,
                wardrobe_z,
                stove_x,
                stove_z,
                bound_min_x: mn[0],
                bound_max_x: mx[0],
                bound_min_z: mn[2],
                bound_max_z: mx[2],
                bound_min_y: mn[1],
                bound_max_y: mx[1],
            });
        }
    }
    let stale_keys: Vec<String> = ctx
        .db
        .apartment_unit()
        .iter()
        .filter(|u| !seen.contains(&u.unit_key))
        .map(|u| u.unit_key)
        .collect();
    for key in stale_keys {
        clear_apartment_decor_for_unit(ctx, &key);
        ctx.db.apartment_unit().unit_key().delete(key);
    }
    refresh_residential_band_unit_states(ctx);
}

fn template_set_for_floor(floor_doc_id: &str) -> &'static [GenTemplate] {
    for s in APARTMENT_DOOR_TEMPLATE_SETS {
        if s.floor_doc_id == floor_doc_id {
            return s.templates;
        }
    }
    &[]
}

pub(crate) fn spawn_pose_owned_bed(ctx: &ReducerContext, owner: Identity) -> Option<PlayerPose> {
    let pose_row = ctx.db.player_pose().identity().find(&owner)?;
    ctx.db.apartment_unit().iter().find_map(|u| {
        if u.owner != Some(owner) || u.state != UNIT_STATE_CLAIMED {
            return None;
        }
        let (bx, by, bz, byaw) = replicated_bed_spawn_anchor(ctx, &u);
        Some(PlayerPose {
            identity: owner,
            x: bx,
            y: by + 0.92,
            z: bz,
            yaw: byaw,
            seq: pose_row.seq,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            grounded: 1,
            melee_presentation_seq: 0,
            firearm_presentation_seq: 0,
        })
    })
}

/// Claimed apartment `unit_key` for `owner`, if any.
pub(crate) fn claimed_unit_key_for_owner(ctx: &ReducerContext, owner: Identity) -> Option<String> {
    ctx.db.apartment_unit().iter().find_map(|u| {
        if u.owner == Some(owner) && u.state == UNIT_STATE_CLAIMED {
            Some(u.unit_key.clone())
        } else {
            None
        }
    })
}

/// Stash location key for the unit footlocker — `{unit_key}#d{decor_id}` when replicated, else `{unit_key}#footlocker`.
pub(crate) fn footlocker_stash_location_key(ctx: &ReducerContext, unit_key: &str) -> String {
    apartment_decor_stash_location_key(
        ctx,
        unit_key,
        APARTMENT_DECOR_ITEM_KIND_FOOTLOCKER,
        "objects/footlocker.glb",
        APARTMENT_STASH_KIND_FOOTLOCKER,
    )
}

/// Stash location key for the unit fridge — `{unit_key}#d{decor_id}` when replicated, else `{unit_key}#fridge`.
pub(crate) fn fridge_stash_location_key(ctx: &ReducerContext, unit_key: &str) -> String {
    apartment_decor_stash_location_key(
        ctx,
        unit_key,
        APARTMENT_DECOR_ITEM_KIND_FRIDGE,
        "objects/fridge.glb",
        APARTMENT_STASH_KIND_FRIDGE,
    )
}

fn apartment_decor_stash_location_key(
    ctx: &ReducerContext,
    unit_key: &str,
    item_kind: u8,
    model_suffix: &str,
    stash_kind: &str,
) -> String {
    use crate::inventory_models::{apartment_stash_key, apartment_stash_key_decor};

    if let Some(d) = ctx.db.apartment_unit_decor().iter().find(|d| {
        d.unit_key.as_str() == unit_key
            && (d.item_kind == item_kind || d.model_rel_path.ends_with(model_suffix))
    }) {
        return apartment_stash_key_decor(unit_key, d.decor_id);
    }

    apartment_stash_key(unit_key, stash_kind)
}

/// Stash location key for the unit water tank — `{unit_key}#d{decor_id}` when replicated, else `{unit_key}#water_tank`.
pub(crate) fn water_tank_stash_location_key(ctx: &ReducerContext, unit_key: &str) -> String {
    apartment_decor_stash_location_key(
        ctx,
        unit_key,
        APARTMENT_DECOR_ITEM_KIND_WATER_TANK,
        "objects/water-tank.glb",
        APARTMENT_STASH_KIND_WATER_TANK,
    )
}

/// One-time water-tank reservoir row for the player's claimed apartment.
pub(crate) fn ensure_starter_apartment_water_tank(ctx: &ReducerContext, owner: Identity) {
    let Some(unit_key) = claimed_unit_key_for_owner(ctx, owner) else {
        return;
    };
    crate::water_container::ensure_starter_apartment_water_tank(ctx, unit_key.as_str());
}

/// Default fish tank in `owned_apartment_builtins.json` — keep in sync with client layout doc.
const AUTHORED_FISH_TANK_FX: f32 = 0.578_635_23;
const AUTHORED_FISH_TANK_FZ: f32 = 0.578_048_38;
const AUTHORED_FISH_TANK_DY: f32 = 0.904_784_48;
const AUTHORED_FISH_TANK_UNIFORM_SCALE: f32 = 0.240_045_06;
const AUTHORED_FISH_TANK_MODEL: &str = "static/models/objects/fish-tank.glb";
const CONTENT_DECOR_DEDUPE_XZ_M: f32 = 0.4;

fn authored_fish_tank_world_pose(unit: &ApartmentUnit) -> (f32, f32, f32) {
    let (x, z) = authored_placed_item_world_xz(unit, AUTHORED_FISH_TANK_FX, AUTHORED_FISH_TANK_FZ);
    let y = unit.bound_min_y + AUTHORED_FISH_TANK_DY;
    (x, y, z)
}

fn fish_tank_decor_covers_authored_slot(unit: &ApartmentUnit, decor: &ApartmentUnitDecor) -> bool {
    if effective_decor_item_kind(decor.item_kind, decor.model_rel_path.as_str())
        != APARTMENT_DECOR_ITEM_KIND_FISH_TANK
    {
        return false;
    }
    let (ax, _ay, az) = authored_fish_tank_world_pose(unit);
    let dx = decor.pos_x - ax;
    let dz = decor.pos_z - az;
    dx * dx + dz * dz <= CONTENT_DECOR_DEDUPE_XZ_M * CONTENT_DECOR_DEDUPE_XZ_M
}

fn migrate_legacy_fish_tank_stash_to_decor(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
    decor_id: u64,
) {
    let legacy_key = apartment_stash_key(unit_key, APARTMENT_STASH_KIND_FISH_TANK);
    let decor_key = apartment_stash_key_decor(unit_key, decor_id);
    let inv = ctx.db.inventory_item();
    for mut row in inv.iter().collect::<Vec<_>>() {
        let ItemLocation::Stash(s) = &row.location else {
            continue;
        };
        if s.owner_identity != owner || s.unit_key.as_str() != legacy_key.as_str() {
            continue;
        }
        row.location = ItemLocation::Stash(StashLocationData {
            owner_identity: owner,
            unit_key: decor_key.clone(),
            slot_index: s.slot_index,
        });
        inv.instance_id().update(row);
    }
}

fn ensure_authored_fish_tank_decor_for_unit(ctx: &ReducerContext, owner: Identity, unit_key: &str) {
    let Some(unit) = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
    else {
        return;
    };
    if unit.state != UNIT_STATE_CLAIMED || unit.owner != Some(owner) {
        return;
    }

    let decor_id = if let Some(existing) = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| {
            d.unit_key.as_str() == unit_key && fish_tank_decor_covers_authored_slot(&unit, d)
        })
        .min_by_key(|d| d.decor_id)
    {
        existing.decor_id
    } else {
        let (px, py, pz) = authored_fish_tank_world_pose(&unit);
        let (px, py, pz, yw, ph, rl, sc) = clamp_decor_pose(
            &unit,
            px,
            py,
            pz,
            0.0,
            0.0,
            0.0,
            AUTHORED_FISH_TANK_UNIFORM_SCALE,
        );
        ctx.db
            .apartment_unit_decor()
            .insert(ApartmentUnitDecor {
                decor_id: 0,
                unit_key: unit_key.to_string(),
                model_rel_path: AUTHORED_FISH_TANK_MODEL.to_string(),
                pos_x: px,
                pos_y: py,
                pos_z: pz,
                yaw_rad: yw,
                pitch_rad: ph,
                roll_rad: rl,
                uniform_scale: sc,
                item_kind: APARTMENT_DECOR_ITEM_KIND_FISH_TANK,
            })
            .decor_id
    };

    migrate_legacy_fish_tank_stash_to_decor(ctx, owner, unit_key, decor_id);
}

/// Ensures the layout fish tank has a per-decor stash row (`{unit}#d{id}`), not legacy `{unit}#fish_tank`.
pub(crate) fn ensure_authored_fish_tank_decor_for_owner(ctx: &ReducerContext, owner: Identity) {
    let Some(unit_key) = claimed_unit_key_for_owner(ctx, owner) else {
        return;
    };
    ensure_authored_fish_tank_decor_for_unit(ctx, owner, unit_key.as_str());
}

/// Idempotent backfill for authored stash decor rows (fish tank today; more stash props later).
#[spacetimedb::reducer]
pub fn sync_owned_apartment_stash_decor(ctx: &ReducerContext) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("sync_owned_apartment_stash_decor blocked: {e}");
        return;
    }
    if player_vitals::is_player_dead(ctx, ctx.sender()) {
        return;
    }
    let sender = ctx.sender();
    for unit in ctx.db.apartment_unit().iter() {
        if unit.state != UNIT_STATE_CLAIMED || unit.owner != Some(sender) {
            continue;
        }
        ensure_authored_fish_tank_decor_for_unit(ctx, sender, unit.unit_key.as_str());
    }
}

/// First join before a `player_pose` row exists — uses `seq = 0` (movement will align on first intent).
pub(crate) fn join_pose_from_owned_bed(
    ctx: &ReducerContext,
    owner: Identity,
) -> Option<PlayerPose> {
    ctx.db.apartment_unit().iter().find_map(|u| {
        if u.owner != Some(owner) || u.state != UNIT_STATE_CLAIMED {
            return None;
        }
        let (bx, by, bz, byaw) = replicated_bed_spawn_anchor(ctx, &u);
        Some(PlayerPose {
            identity: owner,
            x: bx,
            y: by + 0.92,
            z: bz,
            yaw: byaw,
            seq: 0,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            grounded: 1,
            melee_presentation_seq: 0,
            firearm_presentation_seq: 0,
        })
    })
}

pub(crate) fn lock_owned_residential_doors(ctx: &ReducerContext, owner: Identity) {
    for u in ctx.db.apartment_unit().iter() {
        if u.owner != Some(owner) || u.state != UNIT_STATE_CLAIMED {
            continue;
        }
        let uk = u.unit_key.clone();
        for mut d in ctx.db.apartment_door().iter() {
            if crate::apartment_door::resident_unit_key_from_door_row(&d) != uk {
                continue;
            }
            if !d.template_id.contains("unit_") {
                continue;
            }
            d.desired_open = 0;
            ctx.db.apartment_door().row_key().update(d);
        }
    }
}

fn claim_pulse_cap_secs() -> f32 {
    1.05
}

fn reinforce_pulse_dt_secs() -> f32 {
    0.45
}

fn inventory_has_pair(ctx: &ReducerContext, owner: Identity, a: &str, b: &str) -> bool {
    inventory_has(ctx, owner, a, 1) && inventory_has(ctx, owner, b, 1)
}

fn location_owned_by_player(row: &inventory::InventoryItem, owner: Identity) -> bool {
    match &row.location {
        ItemLocation::Inventory(d) => d.owner_id == owner,
        ItemLocation::Hotbar(d) => d.owner_id == owner,
        _ => false,
    }
}

fn inventory_has(ctx: &ReducerContext, owner: Identity, def: &str, min: u32) -> bool {
    let mut sum = 0u32;
    for row in ctx.db.inventory_item().iter() {
        if !location_owned_by_player(&row, owner) {
            continue;
        }
        if row.def_id == def {
            sum += row.quantity;
            if sum >= min {
                return true;
            }
        }
    }
    false
}

fn consume_first_matching_stack(ctx: &ReducerContext, owner: Identity, def: &str) {
    for row in ctx.db.inventory_item().iter() {
        if !location_owned_by_player(&row, owner) {
            continue;
        }
        if row.def_id == def && row.quantity >= 1 {
            let _ = inventory::remove_player_item_quantity(ctx, row.instance_id, 1);
            return;
        }
    }
}

fn consume_scrap_metal_many(ctx: &ReducerContext, owner: Identity, mut need: u32) {
    for row in ctx.db.inventory_item().iter() {
        if need == 0 {
            break;
        }
        if !location_owned_by_player(&row, owner) || row.def_id != "scrap-metal" {
            continue;
        }
        let take = need.min(row.quantity);
        let _ = inventory::remove_player_item_quantity(ctx, row.instance_id, take);
        need -= take;
    }
}

fn force_unit_primary_door_open(ctx: &ReducerContext, uk: &str) {
    for mut row in ctx.db.apartment_door().iter() {
        if crate::apartment_door::resident_unit_key_from_door_row(&row) == uk {
            row.desired_open = 1;
            ctx.db.apartment_door().row_key().update(row);
            break;
        }
    }
}

#[spacetimedb::reducer]
pub fn claim_apartment_pulse(ctx: &ReducerContext, unit_key: String) {
    if let Err(e) = auth::ensure_apartment_claim_allowed(ctx) {
        log::debug!("claim_apartment_pulse blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    if player_vitals::is_player_dead(ctx, sender) {
        return;
    }
    let Some(mut unit) = ctx.db.apartment_unit().unit_key().find(&unit_key) else {
        return;
    };
    if unit.state != UNIT_STATE_UNCLAIMED {
        return;
    }
    let Some(pose) = ctx.db.player_pose().identity().find(&sender) else {
        return;
    };
    let near_claim = feet_inside_unit(&unit, pose.x, pose.y, pose.z)
        && (player_near_any_wardrobe_decor(ctx, &unit, pose.x, pose.y, pose.z)
            || pose_near_horizontal_marker(
                pose.x,
                pose.y,
                pose.z,
                unit.wardrobe_x,
                unit.wardrobe_z,
                unit.foot_y,
                stash_interact_radius_sq(APARTMENT_STASH_KIND_WARDROBE),
            ));
    if !near_claim {
        unit.claim_progress_secs = 0.0;
        unit.claim_started_by = None;
        ctx.db.apartment_unit().unit_key().update(unit);
        return;
    }
    if !inventory_has_pair(ctx, sender, "door-lock", "screwdriver") {
        return;
    }

    cancel_other_active_claims_for_player(ctx, sender, &unit_key);

    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let dt = if unit.last_claim_pulse_micros > 0 {
        ((now_us - unit.last_claim_pulse_micros).max(0) as f32 / 1_000_000.0)
            .min(claim_pulse_cap_secs())
    } else {
        0.35
    };
    unit.last_claim_pulse_micros = now_us;

    if unit
        .claim_started_by
        .map(|id| id != sender)
        .unwrap_or(false)
    {
        unit.claim_progress_secs = 0.0;
    }
    unit.claim_started_by = Some(sender);

    let first_pulse = unit.claim_progress_secs < 1e-4;
    unit.claim_progress_secs += dt;

    if first_pulse {
        if let Some(urow) = ctx.db.user().identity().find(&sender) {
            let dn = crate::auth::display_name_for(&urow);
            let label = format_apartment_public_label(unit.level, &unit.unit_id);
            crafting::emit_hud_notice(ctx, sender, format!("{dn} is claiming apartment {label}"));
        }
    }

    if unit.claim_progress_secs >= CLAIM_FULL_SECS {
        consume_first_matching_stack(ctx, sender, "door-lock");
        let unit_label = format_apartment_public_label(unit.level, &unit.unit_id);
        unit.state = UNIT_STATE_CLAIMED;
        unit.owner = Some(sender);
        unit.claim_started_by = None;
        unit.claim_progress_secs = CLAIM_FULL_SECS;
        ctx.db.apartment_unit().unit_key().update(unit);
        crafting::emit_hud_notice(
            ctx,
            sender,
            format!("Claim complete — {unit_label} is now occupied."),
        );
        ensure_authored_fish_tank_decor_for_unit(ctx, sender, unit_key.as_str());
        force_unit_primary_door_open(ctx, &unit_key);
        return;
    }

    ctx.db.apartment_unit().unit_key().update(unit);
}

#[spacetimedb::reducer]
pub fn set_owned_apartment_piece_pose(
    ctx: &ReducerContext,
    unit_key: String,
    piece: u8,
    world_x: f32,
    world_z: f32,
    yaw_rad: f32,
    bed_floor_world_y: f32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("set_owned_apartment_piece_pose blocked: {e}");
        return;
    }
    if player_vitals::is_player_dead(ctx, ctx.sender()) {
        return;
    }
    let Some(mut unit) = player_may_layout_owned_apartment(ctx, &unit_key, true) else {
        return;
    };
    let yz = wrap_angle_rad(yaw_rad);

    match piece {
        APARTMENT_LAYOUT_PIECE_BED => {
            let Some((cx, cz)) = clamp_piece_world_xz(&unit, piece, world_x, world_z) else {
                return;
            };
            unit.bed_x = cx;
            unit.bed_z = cz;
            unit.bed_yaw = yz;
            unit.bed_y = clamp_bed_world_y(&unit, bed_floor_world_y);
            ctx.db.apartment_unit().unit_key().update(unit);
        }
        APARTMENT_LAYOUT_PIECE_WARDROBE => {
            let Some((cx, cz)) = clamp_piece_world_xz(&unit, piece, world_x, world_z) else {
                return;
            };
            unit.wardrobe_x = cx;
            unit.wardrobe_z = cz;
            unit.bed_yaw = yz;
            ctx.db.apartment_unit().unit_key().update(unit);
        }
        APARTMENT_LAYOUT_PIECE_FOOTLOCKER => {
            let Some((cx, cz)) = clamp_piece_world_xz(&unit, piece, world_x, world_z) else {
                return;
            };
            unit.foot_x = cx;
            unit.foot_z = cz;
            unit.bed_yaw = yz;
            ctx.db.apartment_unit().unit_key().update(unit);
        }
        APARTMENT_LAYOUT_PIECE_STOVE => {
            let Some((cx, cz)) = clamp_piece_world_xz(&unit, piece, world_x, world_z) else {
                return;
            };
            unit.stove_x = cx;
            unit.stove_z = cz;
            unit.bed_yaw = yz;
            ctx.db.apartment_unit().unit_key().update(unit);
        }
        _ => log::warn!("set_owned_apartment_piece_pose: bad piece {piece}"),
    }
}

#[spacetimedb::reducer]
pub fn add_apartment_unit_decor(
    ctx: &ReducerContext,
    unit_key: String,
    model_rel_path: String,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    yaw_rad: f32,
    pitch_rad: f32,
    roll_rad: f32,
    uniform_scale: f32,
    item_kind: u8,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("add_apartment_unit_decor blocked: {e}");
        return;
    }
    if player_vitals::is_player_dead(ctx, ctx.sender()) {
        return;
    }
    if item_kind > APARTMENT_DECOR_ITEM_KIND_FISH_TANK {
        log::debug!("add_apartment_unit_decor: bad item_kind");
        return;
    }
    if !decor_model_rel_path_ok(&model_rel_path) {
        log::debug!("add_apartment_unit_decor: rejected model_rel_path");
        return;
    }
    let Some(unit) = player_may_layout_owned_apartment(ctx, &unit_key, true) else {
        return;
    };
    let n = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| d.unit_key.as_str() == unit_key.as_str())
        .count();
    if n >= APARTMENT_DECOR_COUNT_CAP {
        log::warn!("add_apartment_unit_decor: unit at cap ({APARTMENT_DECOR_COUNT_CAP})");
        return;
    }
    let (px, py, pz, yw, ph, rl, sc) = clamp_decor_pose(
        &unit,
        pos_x,
        pos_y,
        pos_z,
        yaw_rad,
        pitch_rad,
        roll_rad,
        uniform_scale,
    );
    let _ = ctx.db.apartment_unit_decor().insert(ApartmentUnitDecor {
        decor_id: 0,
        unit_key: unit_key.clone(),
        model_rel_path: model_rel_path.trim().trim_start_matches('/').to_string(),
        pos_x: px,
        pos_y: py,
        pos_z: pz,
        yaw_rad: yw,
        pitch_rad: ph,
        roll_rad: rl,
        uniform_scale: sc,
        item_kind,
    });
    sync_apartment_unit_columns_from_decor(ctx, &unit_key);
}

#[spacetimedb::reducer]
pub fn update_apartment_unit_decor(
    ctx: &ReducerContext,
    decor_id: u64,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    yaw_rad: f32,
    pitch_rad: f32,
    roll_rad: f32,
    uniform_scale: f32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("update_apartment_unit_decor blocked: {e}");
        return;
    }
    if player_vitals::is_player_dead(ctx, ctx.sender()) {
        return;
    }
    let Some((unit, mut row)) = authorize_apartment_decor_row(ctx, decor_id) else {
        return;
    };
    if player_may_layout_owned_apartment(ctx, &unit.unit_key, true).is_none() {
        return;
    }
    let (px, py, pz, yw, ph, rl, sc) = clamp_decor_pose(
        &unit,
        pos_x,
        pos_y,
        pos_z,
        yaw_rad,
        pitch_rad,
        roll_rad,
        uniform_scale,
    );
    row.pos_x = px;
    row.pos_y = py;
    row.pos_z = pz;
    row.yaw_rad = yw;
    row.pitch_rad = ph;
    row.roll_rad = rl;
    row.uniform_scale = sc;
    ctx.db.apartment_unit_decor().decor_id().update(row);
    sync_apartment_unit_columns_from_decor(ctx, &unit.unit_key);
}

#[spacetimedb::reducer]
pub fn delete_apartment_unit_decor(ctx: &ReducerContext, decor_id: u64) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("delete_apartment_unit_decor blocked: {e}");
        return;
    }
    if player_vitals::is_player_dead(ctx, ctx.sender()) {
        return;
    }
    let Some((unit, _row)) = authorize_apartment_decor_row(ctx, decor_id) else {
        return;
    };
    if player_may_layout_owned_apartment(ctx, &unit.unit_key, true).is_none() {
        return;
    }
    ctx.db.apartment_unit_decor().decor_id().delete(decor_id);
    sync_apartment_unit_columns_from_decor(ctx, &unit.unit_key);
}

#[spacetimedb::reducer]
pub fn reinforce_apartment_pulse(ctx: &ReducerContext, door_row_key: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("reinforce_apartment_pulse blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    let Some(ad) = ctx.db.apartment_door().row_key().find(&door_row_key) else {
        return;
    };
    let uk = crate::apartment_door::resident_unit_key_from_door_row(&ad);
    let Some(mut unit) = ctx.db.apartment_unit().unit_key().find(&uk) else {
        return;
    };
    if unit.owner != Some(sender) || unit.state != UNIT_STATE_CLAIMED || unit.reinforced != 0 {
        return;
    }
    if !inventory_has(ctx, sender, "screwdriver", 1)
        || !inventory_has(ctx, sender, "scrap-metal", 10)
    {
        return;
    }
    let Some(pose) = ctx.db.player_pose().identity().find(&sender) else {
        return;
    };
    let dx = pose.x - ad.hinge_x;
    let dz = pose.z - ad.hinge_z;
    if dx * dx + dz * dz > (7.5_f32).powi(2) {
        return;
    }

    unit.reinforce_progress_secs += reinforce_pulse_dt_secs();
    unit.reinforce_by = Some(sender);

    if unit.reinforce_progress_secs >= REINFORCE_HOLD_SECS {
        consume_scrap_metal_many(ctx, sender, 10);
        unit.reinforced = 1;
        unit.reinforce_progress_secs = REINFORCE_HOLD_SECS;
        ctx.db.apartment_unit().unit_key().update(unit);
        world_sound::emit_reinforcement_noise_at(
            ctx,
            ad.hinge_x,
            ad.feet_y + 1.2,
            ad.hinge_z,
            sender,
        );
    } else {
        ctx.db.apartment_unit().unit_key().update(unit);
    }
}

/// Layout fraction → world X — keep aligned with `mapOwnedApartmentLayoutFractionToWorldX` in
/// `packages/world/src/residentialUnitBalcony.ts`.
fn map_owned_apartment_layout_fraction_to_world_x(
    bound_min_x: f32,
    bound_max_x: f32,
    unit_id: &str,
    fx: f32,
) -> f32 {
    let span_x = bound_max_x - bound_min_x;
    let overhang = residential_unit_balcony_overhang_m(unit_id);
    if overhang <= 0.0 {
        return bound_min_x + fx * span_x;
    }
    let living_span_x = span_x - overhang;
    if unit_id.starts_with("unit_e_") {
        bound_min_x + fx * living_span_x
    } else if unit_id.starts_with("unit_w_") {
        bound_min_x + overhang + fx * living_span_x
    } else {
        bound_min_x + fx * span_x
    }
}

/// World XZ for props authored in `owned_apartment_builtins.json` layout fractions.
pub(crate) fn authored_placed_item_world_xz(unit: &ApartmentUnit, fx: f32, fz: f32) -> (f32, f32) {
    authored_content_stash_anchor_xz(unit, fx, fz)
}

/// `mammoth_builtin_bed` in `content/apartment/owned_apartment_builtins.json` — keep in sync with client
/// `resolveApartmentDecorPoses`.
const AUTHORED_BED_FX: f32 = 0.654_638_93;
const AUTHORED_BED_FZ: f32 = 0.013_169_777;
const AUTHORED_BED_DY: f32 = 0.531_484_7;
const BED_SLEEP_INTERACT_RADIUS_M: f32 = 2.25;

#[inline]
pub(crate) fn bed_sleep_interact_radius_sq() -> f32 {
    BED_SLEEP_INTERACT_RADIUS_M * BED_SLEEP_INTERACT_RADIUS_M
}

fn authored_content_bed_world_xyz(unit: &ApartmentUnit) -> (f32, f32, f32) {
    let (ax, az) = authored_placed_item_world_xz(unit, AUTHORED_BED_FX, AUTHORED_BED_FZ);
    let ay = unit.bound_min_y + AUTHORED_BED_DY;
    (ax, ay, az)
}

/// Join / respawn feet anchor — replicated decor row when present, else seeded `ApartmentUnit.bed_*`.
fn replicated_bed_spawn_anchor(ctx: &ReducerContext, unit: &ApartmentUnit) -> (f32, f32, f32, f32) {
    if let Some(b) = primary_bed_row_for_unit_key(ctx, unit.unit_key.as_str()) {
        (b.pos_x, b.pos_y, b.pos_z, b.yaw_rad)
    } else {
        (unit.bed_x, unit.bed_y, unit.bed_z, unit.bed_yaw)
    }
}

/// Sleep proximity + interact checks — authored layout when no decor row (matches client builtins).
pub(crate) fn bed_world_anchor_xyz(ctx: &ReducerContext, unit: &ApartmentUnit) -> (f32, f32, f32) {
    if let Some(b) = primary_bed_row_for_unit_key(ctx, unit.unit_key.as_str()) {
        (b.pos_x, b.pos_y, b.pos_z)
    } else {
        authored_content_bed_world_xyz(unit)
    }
}

pub(crate) fn player_pose_near_unit_bed(
    ctx: &ReducerContext,
    unit: &ApartmentUnit,
    pose_x: f32,
    pose_y: f32,
    pose_z: f32,
) -> bool {
    if !feet_inside_unit(unit, pose_x, pose_y, pose_z) {
        return false;
    }
    let (bx, _by, bz) = bed_world_anchor_xyz(ctx, unit);
    pose_near_horizontal_marker(
        pose_x,
        pose_y,
        pose_z,
        bx,
        bz,
        unit.foot_y,
        bed_sleep_interact_radius_sq(),
    )
}

/// World XZ for stash props authored in `content/apartment/owned_apartment_builtins.json`.
fn authored_content_stash_anchor_xz(unit: &ApartmentUnit, fx: f32, fz: f32) -> (f32, f32) {
    let span_z = unit.bound_max_z - unit.bound_min_z;
    let x = map_owned_apartment_layout_fraction_to_world_x(
        unit.bound_min_x,
        unit.bound_max_x,
        unit.unit_id.as_str(),
        fx,
    );
    let z = unit.bound_min_z + fz * span_z;
    (x, z)
}

/// Fallback when no `apartment_unit_decor` row exists — fractions from
/// `content/apartment/owned_apartment_builtins.json` `placedItems` (keep in sync with client
/// `resolveApartmentStashAnchorXZ`).
fn pose_near_authored_content_stash_anchor(
    unit: &ApartmentUnit,
    stash_kind: &str,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    let (fx, fz) = match stash_kind {
        APARTMENT_STASH_KIND_WARDROBE => (0.474_748_12, 0.030_580_157),
        APARTMENT_STASH_KIND_FOOTLOCKER => (0.755_258_6, 0.193_950_26),
        APARTMENT_STASH_KIND_STOVE => (0.328_545_44, -0.047_004_23),
        APARTMENT_STASH_KIND_FRIDGE => (0.387_564_86, 0.183_102_12),
        APARTMENT_STASH_KIND_WATER_TANK => (0.073_722_71, 0.823_220_47),
        APARTMENT_STASH_KIND_FISH_TANK => (0.578_635_23, 0.578_435_87),
        _ => return false,
    };
    let (ax, az) = authored_content_stash_anchor_xz(unit, fx, fz);
    feet_inside_unit(unit, x, y, z)
        && pose_near_horizontal_marker(
            x,
            y,
            z,
            ax,
            az,
            unit.foot_y,
            stash_interact_radius_sq(stash_kind),
        )
}

fn pose_near_decor_stash_or_fallback(
    ctx: &ReducerContext,
    unit: &ApartmentUnit,
    stash_kind: &str,
    decor_item_kind: u8,
    fallback_x: f32,
    fallback_z: f32,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    if !feet_inside_unit(unit, x, y, z) {
        return false;
    }
    let radius_sq = stash_interact_radius_sq(stash_kind);
    if let Some(decor) = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| {
            d.unit_key.as_str() == unit.unit_key.as_str()
                && effective_decor_item_kind(d.item_kind, d.model_rel_path.as_str())
                    == decor_item_kind
        })
        .min_by_key(|d| d.decor_id)
    {
        return pose_near_horizontal_marker(
            x,
            y,
            z,
            decor.pos_x,
            decor.pos_z,
            unit.foot_y,
            radius_sq,
        );
    }
    if pose_near_authored_content_stash_anchor(unit, stash_kind, x, y, z) {
        return true;
    }
    pose_near_horizontal_marker(x, y, z, fallback_x, fallback_z, unit.foot_y, radius_sq)
}

fn pose_near_named_apartment_stash_anchor(
    ctx: &ReducerContext,
    unit: &ApartmentUnit,
    stash_kind: &str,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    match stash_kind {
        APARTMENT_STASH_KIND_WARDROBE => pose_near_decor_stash_or_fallback(
            ctx,
            unit,
            stash_kind,
            APARTMENT_DECOR_ITEM_KIND_WARDROBE,
            unit.wardrobe_x,
            unit.wardrobe_z,
            x,
            y,
            z,
        ),
        APARTMENT_STASH_KIND_STOVE => pose_near_decor_stash_or_fallback(
            ctx,
            unit,
            stash_kind,
            APARTMENT_DECOR_ITEM_KIND_STOVE,
            unit.stove_x,
            unit.stove_z,
            x,
            y,
            z,
        ),
        APARTMENT_STASH_KIND_FRIDGE => {
            if let Some(fridge) = ctx
                .db
                .apartment_unit_decor()
                .iter()
                .filter(|d| {
                    d.unit_key.as_str() == unit.unit_key.as_str()
                        && effective_decor_item_kind(d.item_kind, d.model_rel_path.as_str())
                            == APARTMENT_DECOR_ITEM_KIND_FRIDGE
                })
                .min_by_key(|d| d.decor_id)
            {
                return feet_inside_unit(unit, x, y, z)
                    && pose_near_horizontal_marker(
                        x,
                        y,
                        z,
                        fridge.pos_x,
                        fridge.pos_z,
                        unit.foot_y,
                        stash_interact_radius_sq(APARTMENT_STASH_KIND_FRIDGE),
                    );
            }
            pose_near_authored_content_stash_anchor(unit, stash_kind, x, y, z)
        }
        APARTMENT_STASH_KIND_WATER_TANK => {
            if let Some(tank) = ctx
                .db
                .apartment_unit_decor()
                .iter()
                .filter(|d| {
                    d.unit_key.as_str() == unit.unit_key.as_str()
                        && effective_decor_item_kind(d.item_kind, d.model_rel_path.as_str())
                            == APARTMENT_DECOR_ITEM_KIND_WATER_TANK
                })
                .min_by_key(|d| d.decor_id)
            {
                return feet_inside_unit(unit, x, y, z)
                    && pose_near_horizontal_marker(
                        x,
                        y,
                        z,
                        tank.pos_x,
                        tank.pos_z,
                        unit.foot_y,
                        stash_interact_radius_sq(APARTMENT_STASH_KIND_WATER_TANK),
                    );
            }
            pose_near_authored_content_stash_anchor(unit, stash_kind, x, y, z)
        }
        APARTMENT_STASH_KIND_FISH_TANK => {
            if let Some(tank) = ctx
                .db
                .apartment_unit_decor()
                .iter()
                .filter(|d| {
                    d.unit_key.as_str() == unit.unit_key.as_str()
                        && effective_decor_item_kind(d.item_kind, d.model_rel_path.as_str())
                            == APARTMENT_DECOR_ITEM_KIND_FISH_TANK
                })
                .min_by_key(|d| d.decor_id)
            {
                return feet_inside_unit(unit, x, y, z)
                    && pose_near_horizontal_marker(
                        x,
                        y,
                        z,
                        tank.pos_x,
                        tank.pos_z,
                        unit.foot_y,
                        stash_interact_radius_sq(APARTMENT_STASH_KIND_FISH_TANK),
                    );
            }
            false
        }
        APARTMENT_STASH_KIND_FOOTLOCKER | _ => pose_near_decor_stash_or_fallback(
            ctx,
            unit,
            APARTMENT_STASH_KIND_FOOTLOCKER,
            APARTMENT_DECOR_ITEM_KIND_FOOTLOCKER,
            unit.foot_x,
            unit.foot_z,
            x,
            y,
            z,
        ),
    }
}

fn apartment_stash_kind_for_stash_key(
    ctx: &ReducerContext,
    stash_key: &str,
) -> Option<&'static str> {
    match parse_apartment_stash_key_v2(stash_key) {
        ParsedApartmentStashKey::DecorInstance { unit_key, decor_id } => {
            let decor = ctx.db.apartment_unit_decor().decor_id().find(decor_id)?;
            if decor.unit_key.as_str() != unit_key {
                return None;
            }
            Some(decor_stash_radius_kind_for_row(
                decor.item_kind,
                decor.model_rel_path.as_str(),
            ))
        }
        ParsedApartmentStashKey::LegacyComposite { kind, .. } => Some(kind),
        ParsedApartmentStashKey::BareUnitKey(_) => Some(APARTMENT_STASH_KIND_FOOTLOCKER),
        ParsedApartmentStashKey::GrowTray { .. } => Some(APARTMENT_STASH_KIND_GROW_TRAY),
    }
}

fn first_empty_stash_slot(
    ctx: &ReducerContext,
    stash_owner: Identity,
    stash_key: &str,
) -> Option<u16> {
    let stash_kind = apartment_stash_kind_for_stash_key(ctx, stash_key)?;
    for s in 0..apartment_stash_slot_count(stash_kind) {
        if find_item_in_stash_slot(ctx, stash_owner, stash_key, s).is_none() {
            return Some(s);
        }
    }
    None
}

pub(crate) fn apartment_stash_owner_near_sender(
    ctx: &ReducerContext,
    stash_key: &str,
) -> Option<(Identity, String, &'static str)> {
    let sender = ctx.sender();
    match parse_apartment_stash_key_v2(stash_key) {
        ParsedApartmentStashKey::DecorInstance { unit_key, decor_id } => {
            let unit = ctx
                .db
                .apartment_unit()
                .unit_key()
                .find(&unit_key.to_string())?;
            let decor = ctx.db.apartment_unit_decor().decor_id().find(decor_id)?;
            if decor.unit_key.as_str() != unit_key {
                return None;
            }
            let owner_id = unit.owner?;
            let pose = ctx.db.player_pose().identity().find(&sender)?;
            let rk =
                decor_stash_radius_kind_for_row(decor.item_kind, decor.model_rel_path.as_str());
            if !pose_near_horizontal_marker(
                pose.x,
                pose.y,
                pose.z,
                decor.pos_x,
                decor.pos_z,
                unit.foot_y,
                stash_interact_radius_sq(rk),
            ) {
                return None;
            }
            Some((
                owner_id,
                unit_key.to_string(),
                decor_stash_radius_kind_for_row(decor.item_kind, decor.model_rel_path.as_str()),
            ))
        }
        ParsedApartmentStashKey::LegacyComposite { unit_key, kind } => {
            if kind == APARTMENT_STASH_KIND_FISH_TANK {
                return None;
            }
            let unit = ctx
                .db
                .apartment_unit()
                .unit_key()
                .find(&unit_key.to_string())?;
            let owner_id = unit.owner?;
            let pose = ctx.db.player_pose().identity().find(&sender)?;
            if !pose_near_named_apartment_stash_anchor(ctx, &unit, kind, pose.x, pose.y, pose.z) {
                return None;
            }
            Some((owner_id, unit_key.to_string(), kind))
        }
        ParsedApartmentStashKey::BareUnitKey(unit_key) => {
            let unit = ctx
                .db
                .apartment_unit()
                .unit_key()
                .find(&unit_key.to_string())?;
            let owner_id = unit.owner?;
            let pose = ctx.db.player_pose().identity().find(&sender)?;
            if !pose_near_named_apartment_stash_anchor(
                ctx,
                &unit,
                APARTMENT_STASH_KIND_FOOTLOCKER,
                pose.x,
                pose.y,
                pose.z,
            ) {
                return None;
            }
            Some((
                owner_id,
                unit_key.to_string(),
                APARTMENT_STASH_KIND_FOOTLOCKER,
            ))
        }
        ParsedApartmentStashKey::GrowTray { unit_key, tray_id } => {
            let stash_key = crate::balcony_grow::grow_tray_stash_key(unit_key, tray_id);
            let (owner_id, uk) =
                crate::balcony_grow::grow_tray_stash_near_sender(ctx, stash_key.as_str())?;
            Some((owner_id, uk, APARTMENT_STASH_KIND_GROW_TRAY))
        }
    }
}

fn owned_apartment_stash_owner_near_sender(
    ctx: &ReducerContext,
    stash_key: &str,
) -> Option<(Identity, String, &'static str)> {
    let (owner_id, unit_key, stash_kind) = apartment_stash_owner_near_sender(ctx, stash_key)?;
    if owner_id != ctx.sender() {
        return None;
    }
    Some((owner_id, unit_key, stash_kind))
}

fn stash_item_for_unit(
    ctx: &ReducerContext,
    item_instance_id: u64,
    stash_key: &str,
    owner_id: Identity,
) -> Option<inventory::InventoryItem> {
    let row = ctx
        .db
        .inventory_item()
        .instance_id()
        .find(item_instance_id)?;
    match &row.location {
        ItemLocation::Stash(s)
            if crate::apartment_stash_location_match::apartment_stash_locations_match(
                ctx,
                &s.unit_key,
                stash_key,
            ) && s.owner_identity == owner_id =>
        {
            Some(row)
        }
        _ => None,
    }
}

fn move_inventory_row_to_location(
    ctx: &ReducerContext,
    item_instance_id: u64,
    dest: ItemLocation,
    target_opt: Option<inventory::InventoryItem>,
    quantity_to_move: u32,
) -> Result<(), String> {
    inventory::transfer_inventory_row_quantity(
        ctx,
        item_instance_id,
        dest,
        target_opt,
        quantity_to_move,
    )
}

pub(crate) fn notify_stash_reducer_failure(ctx: &ReducerContext, message: String) {
    log::warn!("{message}");
    crafting::emit_hud_notice(ctx, ctx.sender(), message);
}

#[spacetimedb::reducer]
pub fn stash_push_item(ctx: &ReducerContext, item_instance_id: u64, unit_key: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_push blocked: {e}");
        return;
    }
    let Some((owner_id, _, _)) = owned_apartment_stash_owner_near_sender(ctx, &unit_key) else {
        return;
    };
    let Some(slot) = first_empty_stash_slot(ctx, owner_id, &unit_key) else {
        return;
    };
    if let Err(e) = stash_push_item_to_slot_impl(ctx, item_instance_id, &unit_key, slot, 0) {
        notify_stash_reducer_failure(ctx, e);
    }
}

fn stash_push_item_to_slot_impl(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: &str,
    target_stash_slot: u16,
    quantity_to_move: u32,
) -> Result<(), String> {
    let stash_kind = apartment_stash_kind_for_stash_key(ctx, unit_key)
        .ok_or_else(|| "unknown stash".to_string())?;
    if !apartment_stash_slot_index_valid(stash_kind, target_stash_slot) {
        return Err("bad stash slot".to_string());
    }
    let (owner_id, _, _) = owned_apartment_stash_owner_near_sender(ctx, unit_key)
        .ok_or_else(|| "Move closer to this storage.".to_string())?;
    let row = inventory::get_player_item(ctx, item_instance_id)?;
    if !apartment_stash_accepts_def_id(stash_kind, row.def_id.as_str()) {
        return Err(apartment_stash_rejection_hint(stash_kind).to_string());
    }
    let target_opt = find_item_in_stash_slot(ctx, owner_id, unit_key, target_stash_slot);
    move_inventory_row_to_location(
        ctx,
        item_instance_id,
        ItemLocation::Stash(StashLocationData {
            owner_identity: owner_id,
            unit_key: unit_key.to_string(),
            slot_index: target_stash_slot,
        }),
        target_opt,
        quantity_to_move,
    )
    .map_err(|e| format!("{stash_kind} stash: {e}"))
}

#[spacetimedb::reducer]
pub fn stash_push_item_to_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_stash_slot: u16,
    quantity_to_move: u32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_push_to_slot blocked: {e}");
        return;
    }
    if let Err(e) = stash_push_item_to_slot_impl(
        ctx,
        item_instance_id,
        &unit_key,
        target_stash_slot,
        quantity_to_move,
    ) {
        notify_stash_reducer_failure(ctx, e);
    }
}

fn stash_pull_item_to_inventory_slot_impl(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: &str,
    target_inventory_slot: u16,
    quantity_to_move: u32,
) -> Result<(), String> {
    if target_inventory_slot >= NUM_PLAYER_INVENTORY_SLOTS {
        return Err("bad inventory slot".to_string());
    }
    let sender = ctx.sender();
    let (owner_id, _, stash_kind) = apartment_stash_owner_near_sender(ctx, unit_key)
        .ok_or_else(|| "caller may not pull from stash".to_string())?;
    let _row = stash_item_for_unit(ctx, item_instance_id, unit_key, owner_id)
        .ok_or_else(|| "item is not in this stash".to_string())?;
    let target_opt = find_item_in_inventory_slot(ctx, sender, target_inventory_slot);
    move_inventory_row_to_location(
        ctx,
        item_instance_id,
        ItemLocation::Inventory(InventoryLocationData {
            owner_id: sender,
            slot_index: target_inventory_slot,
        }),
        target_opt,
        quantity_to_move,
    )
    .map_err(|e| format!("{stash_kind} stash: {e}"))
}

#[spacetimedb::reducer]
pub fn stash_pull_item_to_inventory_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_inventory_slot: u16,
    quantity_to_move: u32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_pull_to_inventory_slot blocked: {e}");
        return;
    }
    if let Err(e) = stash_pull_item_to_inventory_slot_impl(
        ctx,
        item_instance_id,
        &unit_key,
        target_inventory_slot,
        quantity_to_move,
    ) {
        notify_stash_reducer_failure(ctx, e);
    }
}

fn stash_pull_item_to_hotbar_slot_impl(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: &str,
    target_hotbar_slot: u8,
    quantity_to_move: u32,
) -> Result<(), String> {
    if target_hotbar_slot >= NUM_PLAYER_HOTBAR_SLOTS {
        return Err("bad hotbar slot".to_string());
    }
    let sender = ctx.sender();
    let (owner_id, _, stash_kind) = apartment_stash_owner_near_sender(ctx, unit_key)
        .ok_or_else(|| "caller may not pull from stash".to_string())?;
    let _row = stash_item_for_unit(ctx, item_instance_id, unit_key, owner_id)
        .ok_or_else(|| "item is not in this stash".to_string())?;
    let target_opt = find_item_in_hotbar_slot(ctx, sender, target_hotbar_slot);
    move_inventory_row_to_location(
        ctx,
        item_instance_id,
        ItemLocation::Hotbar(HotbarLocationData {
            owner_id: sender,
            slot_index: target_hotbar_slot,
        }),
        target_opt,
        quantity_to_move,
    )
    .map_err(|e| format!("{stash_kind} stash: {e}"))
}

#[spacetimedb::reducer]
pub fn stash_pull_item_to_hotbar_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_hotbar_slot: u8,
    quantity_to_move: u32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_pull_to_hotbar_slot blocked: {e}");
        return;
    }
    if let Err(e) = stash_pull_item_to_hotbar_slot_impl(
        ctx,
        item_instance_id,
        &unit_key,
        target_hotbar_slot,
        quantity_to_move,
    ) {
        notify_stash_reducer_failure(ctx, e);
    }
}

#[spacetimedb::reducer]
pub fn stash_move_item_to_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_stash_slot: u16,
    quantity_to_move: u32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_move_to_slot blocked: {e}");
        return;
    }
    let Some(stash_kind) = apartment_stash_kind_for_stash_key(ctx, &unit_key) else {
        notify_stash_reducer_failure(ctx, "Could not open that storage.".to_string());
        return;
    };
    if !apartment_stash_slot_index_valid(stash_kind, target_stash_slot) {
        notify_stash_reducer_failure(ctx, "That storage slot is invalid.".to_string());
        return;
    }
    let Some((owner_id, _, _)) = apartment_stash_owner_near_sender(ctx, &unit_key) else {
        return;
    };
    if stash_item_for_unit(ctx, item_instance_id, &unit_key, owner_id).is_none() {
        return;
    }
    let target_opt = find_item_in_stash_slot(ctx, owner_id, &unit_key, target_stash_slot);
    if let Err(e) = move_inventory_row_to_location(
        ctx,
        item_instance_id,
        ItemLocation::Stash(StashLocationData {
            owner_identity: owner_id,
            unit_key: unit_key.clone(),
            slot_index: target_stash_slot,
        }),
        target_opt,
        quantity_to_move,
    ) {
        notify_stash_reducer_failure(ctx, e);
    }
}

#[spacetimedb::reducer]
pub fn stash_pull_item(ctx: &ReducerContext, item_instance_id: u64, unit_key: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_pull blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    let Some((owner_id, _, _)) = apartment_stash_owner_near_sender(ctx, &unit_key) else {
        return;
    };
    if stash_item_for_unit(ctx, item_instance_id, &unit_key, owner_id).is_none() {
        return;
    };
    let Some(dest) = first_empty_player_carry_slot(ctx, sender) else {
        return;
    };
    let pull_result = match dest {
        ItemLocation::Hotbar(d) => {
            stash_pull_item_to_hotbar_slot_impl(ctx, item_instance_id, &unit_key, d.slot_index, 0)
        }
        ItemLocation::Inventory(d) => stash_pull_item_to_inventory_slot_impl(
            ctx,
            item_instance_id,
            &unit_key,
            d.slot_index,
            0,
        ),
        _ => return,
    };
    if let Err(e) = pull_result {
        notify_stash_reducer_failure(ctx, e);
    }
}

pub(crate) fn on_player_killed_cancel_claim(ctx: &ReducerContext, victim: Identity) {
    for mut u in ctx.db.apartment_unit().iter() {
        if u.claim_started_by == Some(victim) {
            u.claim_progress_secs = 0.0;
            u.claim_started_by = None;
            ctx.db.apartment_unit().unit_key().update(u);
        }
    }
}

pub(crate) fn ensure_door_gp(ctx: &ReducerContext, row_key: &str) -> ApartmentDoorGameplay {
    if let Some(g) = ctx
        .db
        .apartment_door_gameplay()
        .row_key()
        .find(&row_key.to_string())
    {
        return g;
    }
    let _ = ctx
        .db
        .apartment_door_gameplay()
        .insert(ApartmentDoorGameplay {
            row_key: row_key.to_string(),
            door_hp: 100.0,
            breached: 0,
        });
    ctx.db
        .apartment_door_gameplay()
        .row_key()
        .find(&row_key.to_string())
        .expect("just inserted door_gp")
}

pub(crate) fn door_breached(ctx: &ReducerContext, row_key: &str) -> bool {
    ctx.db
        .apartment_door_gameplay()
        .row_key()
        .find(&row_key.to_string())
        .map(|g| g.breached != 0)
        .unwrap_or(false)
}

pub(crate) fn player_may_toggle_door(
    ctx: &ReducerContext,
    actor: Identity,
    door: &ApartmentDoor,
) -> bool {
    if door_breached(ctx, &door.row_key) {
        return false;
    }
    let uk = crate::apartment_door::resident_unit_key_from_door_row(door);
    let Some(unit) = ctx.db.apartment_unit().unit_key().find(&uk) else {
        return true;
    };
    match unit.state {
        UNIT_STATE_UNCLAIMED => false,
        UNIT_STATE_CLAIMED => unit.owner == Some(actor),
        UNIT_STATE_BROKEN => false,
        UNIT_STATE_SHELL_OCCUPIED => false,
        _ => false,
    }
}

/// Breach / damage the nearest residential swing door in front of the attacker (no player hit).
pub(crate) fn apply_forward_melee_door_damage(
    ctx: &ReducerContext,
    _attacker: Identity,
    pose: &PlayerPose,
    forward_yaw: f32,
    dmg: f32,
) {
    if dmg <= 0.5 {
        return;
    }
    const REACH: f32 = 2.15;
    let fx = -forward_yaw.sin();
    let fz = -forward_yaw.cos();
    let mut best_key: Option<String> = None;
    let mut best_d2 = 1e15_f32;
    for d in ctx.db.apartment_door().iter() {
        if !d.template_id.contains("unit_") {
            continue;
        }
        let dx = d.hinge_x - pose.x;
        let dz = d.hinge_z - pose.z;
        let planar = dx * fx + dz * fz;
        if planar < 0.15 || planar > REACH {
            continue;
        }
        let lateral = (-dx * fz + dz * fx).abs();
        if lateral > 1.25 {
            continue;
        }
        let dsq = dx * dx + dz * dz;
        if dsq > REACH * REACH || dsq >= best_d2 {
            continue;
        }
        best_d2 = dsq;
        best_key = Some(d.row_key.clone());
    }
    let Some(rk) = best_key else {
        return;
    };
    let mut door = ctx.db.apartment_door().row_key().find(&rk).unwrap();

    let mut gp = ensure_door_gp(ctx, &door.row_key);
    gp.door_hp = (gp.door_hp - dmg).max(0.0);
    if gp.door_hp <= 1e-2 {
        gp.breached = 1;
        door.desired_open = 1;
        door.swing_open_01 = 1.0;
        let uk = crate::apartment_door::resident_unit_key_from_door_row(&door);
        if let Some(mut u) = ctx.db.apartment_unit().unit_key().find(&uk) {
            if u.state != UNIT_STATE_UNCLAIMED {
                u.state = UNIT_STATE_BROKEN;
                ctx.db.apartment_unit().unit_key().update(u);
            }
        }
    }
    ctx.db.apartment_door_gameplay().row_key().update(gp);
    ctx.db.apartment_door().row_key().update(door);
}

#[cfg(test)]
mod authored_bed_anchor_tests {
    use super::{authored_placed_item_world_xz, AUTHORED_BED_FX, AUTHORED_BED_FZ};

    fn sample_unit() -> super::ApartmentUnit {
        super::ApartmentUnit {
            unit_key: "floor_mamutica_typical|18|unit_e_004".to_string(),
            floor_doc_id: "floor_mamutica_typical".to_string(),
            level: 18,
            unit_id: "unit_e_004".to_string(),
            state: super::UNIT_STATE_CLAIMED,
            owner: None,
            claim_started_by: None,
            claim_progress_secs: 0.0,
            last_claim_pulse_micros: 0,
            reinforce_progress_secs: 0.0,
            reinforce_by: None,
            reinforced: 0,
            bound_min_x: 10.0,
            bound_max_x: 18.0,
            bound_min_y: 50.0,
            bound_max_y: 53.0,
            bound_min_z: -120.0,
            bound_max_z: -115.0,
            bed_x: 14.0,
            bed_y: 50.01,
            bed_z: -117.6,
            bed_yaw: 0.0,
            wardrobe_x: 11.0,
            wardrobe_z: -119.0,
            foot_x: 15.0,
            foot_y: 50.0,
            foot_z: -118.0,
            stove_x: 10.5,
            stove_z: -119.5,
        }
    }

    #[test]
    fn authored_bed_anchor_uses_layout_fractions_not_legacy_seed() {
        let unit = sample_unit();
        let (ax, az) = authored_placed_item_world_xz(&unit, AUTHORED_BED_FX, AUTHORED_BED_FZ);
        let legacy_fz = 0.48;
        let legacy_z = unit.bound_min_z + legacy_fz * (unit.bound_max_z - unit.bound_min_z);
        assert!(
            (az - legacy_z).abs() > 1.0,
            "authored bed Z should differ from legacy 0.48 seed"
        );
        assert!((ax - unit.bed_x).abs() > 0.05 || (az - unit.bed_z).abs() > 0.5);
    }
}

#[cfg(test)]
mod decor_model_rel_path_ok_tests {
    use super::decor_model_rel_path_ok;

    #[test]
    fn accepts_glb_under_static_models() {
        assert!(decor_model_rel_path_ok("static/models/objects/chair.glb"));
    }

    #[test]
    fn accepts_obj_under_static_models() {
        assert!(decor_model_rel_path_ok("static/models/objects/chair.obj"));
    }

    #[test]
    fn rejects_unsupported_extensions() {
        assert!(!decor_model_rel_path_ok("static/models/objects/chair.fbx"));
    }

    #[test]
    fn rejects_parent_segments() {
        assert!(!decor_model_rel_path_ok("static/models/../chair.obj"));
    }
}

#[cfg(test)]
mod format_apartment_public_label_tests {
    use super::format_apartment_public_label;

    #[test]
    fn west_zero_padded() {
        assert_eq!(
            format_apartment_public_label(12, "unit_w_005"),
            "Floor 11, West 5"
        );
    }

    #[test]
    fn east_large_index() {
        assert_eq!(
            format_apartment_public_label(2, "unit_e_008"),
            "Floor 1, East 8"
        );
    }

    #[test]
    fn fallback_nonstandard_id() {
        assert_eq!(
            format_apartment_public_label(1, "loft_A"),
            "Floor 1, loft_A"
        );
    }
}

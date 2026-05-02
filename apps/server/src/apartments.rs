//! Apartment units — claim, reinforcement pulse, stash push/pull, door gameplay keys.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::accounts::user;
use crate::apartment_door::{apartment_door, building_floor_refs, ApartmentDoor, SwingDoorFace};
use crate::auth;
use crate::chat;
use crate::elevator_layout::max_level;
use crate::elevator_layout::{BUILDING_ORIGIN_Y, STOREY_SPACING_M};
use crate::feature_flags;
use crate::generated_apartment_doors::{
    ApartmentDoorTemplate as GenTemplate, APARTMENT_DOOR_TEMPLATE_SETS,
};
use crate::inventory::{
    self, find_item_in_hotbar_slot, find_item_in_inventory_slot, find_item_in_stash_slot,
    inventory_item, NUM_PLAYER_HOTBAR_SLOTS, NUM_PLAYER_INVENTORY_SLOTS, NUM_STASH_SLOTS,
};
use crate::inventory_models::{
    HotbarLocationData, InventoryLocationData, ItemLocation, StashLocationData,
};
use crate::items_catalog;
use crate::player_vitals;
use crate::pose::{player_pose, PlayerPose};
use crate::world_sound;

/// 0 open (unclaimed lootable), 1 claimed, 2 broken corridor state.
pub(crate) const UNIT_STATE_UNCLAIMED: u8 = 0;
pub(crate) const UNIT_STATE_CLAIMED: u8 = 1;
pub(crate) const UNIT_STATE_BROKEN: u8 = 2;

const CLAIM_FULL_SECS: f32 = if feature_flags::APARTMENT_CLAIM_FAST_FOR_TESTING {
    1.0
} else {
    30.0
};
const REINFORCE_HOLD_SECS: f32 = 22.0;
/// Horizontal radius² (m²) for wardrobe / footlocker — feet pose is compared on **XZ**
/// against anchor columns; vertical tolerance is separate (`pose_feet_vertical_ok_for_interact`).
const STASH_INTERACT_SQ: f32 = 3.5 * 3.5;

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
) -> bool {
    let dx = pose_x - ax;
    let dz = pose_z - az;
    if dx * dx + dz * dz > STASH_INTERACT_SQ {
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

/// Human-facing label for chat / logs (`unit_w_005` → "Floor 3, West 5").
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
    pub bound_min_x: f32,
    pub bound_max_x: f32,
    pub bound_min_z: f32,
    pub bound_max_z: f32,
    pub bound_min_y: f32,
    pub bound_max_y: f32,
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

fn derive_bounds(t: &GenTemplate, level: u32) -> ([f32; 3], [f32; 3]) {
    let feet_y = feet_world_y(level, t.feet_y_offset);
    let top_y = feet_y + 3.0;
    let face = SwingDoorFace::from_u8(t.face);
    const DEPTH: f32 = 13.0;
    const HALF_WIDTH: f32 = 3.3;
    // Template depth terminates on the façade plane; playable volume ends short of exterior glass.
    const RESIDENTIAL_FAR_WALL_X_INSET_M: f32 = 1.38;
    match face {
        SwingDoorFace::W => (
            [t.hinge_x + 0.08, feet_y - 0.06, t.hinge_z - HALF_WIDTH],
            [
                t.hinge_x + DEPTH - RESIDENTIAL_FAR_WALL_X_INSET_M,
                top_y,
                t.hinge_z + HALF_WIDTH,
            ],
        ),
        SwingDoorFace::E => (
            [
                t.hinge_x - DEPTH + RESIDENTIAL_FAR_WALL_X_INSET_M,
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

fn feet_inside_unit(unit: &ApartmentUnit, x: f32, y: f32, z: f32) -> bool {
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

            let (bed_x, bed_z, bed_yaw, foot_x, foot_z, wardrobe_x, wardrobe_z) =
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
                    (
                        bed_x_frac,
                        bed_z_frac,
                        bed_yaw_legacy,
                        foot_xz[0],
                        foot_xz[1],
                        wardrobe_xz[0],
                        wardrobe_xz[1],
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
                bound_min_x: mn[0],
                bound_max_x: mx[0],
                bound_min_z: mn[2],
                bound_max_z: mx[2],
                bound_min_y: mn[1],
                bound_max_y: mx[1],
            });
        }
    }
}

fn template_set_for_floor(floor_doc_id: &str) -> &'static [GenTemplate] {
    for s in APARTMENT_DOOR_TEMPLATE_SETS {
        if s.floor_doc_id == floor_doc_id {
            return s.templates;
        }
    }
    &[]
}

fn pose_near_apartment_stash_anchor(
    _ctx: &ReducerContext,
    unit: &ApartmentUnit,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    feet_inside_unit(unit, x, y, z)
        && pose_near_horizontal_marker(x, y, z, unit.foot_x, unit.foot_z, unit.foot_y)
}

pub(crate) fn spawn_pose_owned_bed(ctx: &ReducerContext, owner: Identity) -> Option<PlayerPose> {
    let pose_row = ctx.db.player_pose().identity().find(&owner)?;
    ctx.db.apartment_unit().iter().find_map(|u| {
        if u.owner != Some(owner) || u.state != UNIT_STATE_CLAIMED {
            return None;
        }
        Some(PlayerPose {
            identity: owner,
            x: u.bed_x,
            y: u.bed_y + 0.92,
            z: u.bed_z,
            yaw: u.bed_yaw,
            seq: pose_row.seq,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            grounded: 1,
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
        && pose_near_horizontal_marker(
            pose.x,
            pose.y,
            pose.z,
            unit.wardrobe_x,
            unit.wardrobe_z,
            unit.foot_y,
        );
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
            chat::post_system_message(ctx, format!("{dn} is claiming apartment {label}"));
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
        chat::post_system_message(
            ctx,
            format!("Claim complete — {unit_label} is now occupied."),
        );
        force_unit_primary_door_open(ctx, &unit_key);
        return;
    }

    ctx.db.apartment_unit().unit_key().update(unit);
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
    if !inventory_has(ctx, sender, "claw-hammer", 1) || !inventory_has(ctx, sender, "scrap-metal", 10) {
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

fn first_empty_stash_slot(
    ctx: &ReducerContext,
    stash_owner: Identity,
    unit_key: &str,
) -> Option<u16> {
    for s in 0..NUM_STASH_SLOTS {
        if find_item_in_stash_slot(ctx, stash_owner, unit_key, s).is_none() {
            return Some(s);
        }
    }
    None
}

fn apartment_stash_owner_near_sender(ctx: &ReducerContext, unit_key: &str) -> Option<Identity> {
    let sender = ctx.sender();
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())?;
    let owner_id = unit.owner?;
    let pose = ctx.db.player_pose().identity().find(&sender)?;
    if !pose_near_apartment_stash_anchor(ctx, &unit, pose.x, pose.y, pose.z) {
        return None;
    }
    Some(owner_id)
}

fn owned_apartment_stash_owner_near_sender(
    ctx: &ReducerContext,
    unit_key: &str,
) -> Option<Identity> {
    let owner_id = apartment_stash_owner_near_sender(ctx, unit_key)?;
    if owner_id != ctx.sender() {
        return None;
    }
    Some(owner_id)
}

fn stash_item_for_unit(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: &str,
    owner_id: Identity,
) -> Option<inventory::InventoryItem> {
    let row = ctx
        .db
        .inventory_item()
        .instance_id()
        .find(item_instance_id)?;
    match &row.location {
        ItemLocation::Stash(s) if s.unit_key == unit_key && s.owner_identity == owner_id => {
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
) -> Result<(), String> {
    let inv = ctx.db.inventory_item();
    let item_to_move = inv
        .instance_id()
        .find(item_instance_id)
        .ok_or_else(|| format!("item instance {item_instance_id} not found"))?;
    let max_stack = items_catalog::max_stack_for(&item_to_move.def_id)
        .ok_or_else(|| format!("unknown def_id {}", item_to_move.def_id))?;
    let original_location = item_to_move.location.clone();

    if let Some(target_item) = target_opt {
        if target_item.instance_id == item_instance_id {
            let mut mv = inv
                .instance_id()
                .find(item_instance_id)
                .ok_or_else(|| "same-slot move: item row missing".to_string())?;
            mv.location = dest;
            inv.instance_id().update(mv);
            return Ok(());
        }

        match inventory::try_merge_into(&item_to_move, &target_item, max_stack) {
            Ok((new_source_qty, new_target_qty, delete_source)) => {
                let mut tgt = inv
                    .instance_id()
                    .find(target_item.instance_id)
                    .ok_or_else(|| "stash merge: target row missing".to_string())?;
                tgt.quantity = new_target_qty;
                inv.instance_id().update(tgt);

                if delete_source {
                    let mut del = inv
                        .instance_id()
                        .find(item_instance_id)
                        .ok_or_else(|| "stash merge: source row missing".to_string())?;
                    del.location = ItemLocation::Unknown;
                    inv.instance_id().update(del);
                    inv.instance_id().delete(item_instance_id);
                } else {
                    let mut src = inv
                        .instance_id()
                        .find(item_instance_id)
                        .ok_or_else(|| "stash merge: source row missing".to_string())?;
                    src.quantity = new_source_qty;
                    src.location = original_location;
                    inv.instance_id().update(src);
                }
            }
            Err(()) => {
                let mut occ = inv
                    .instance_id()
                    .find(target_item.instance_id)
                    .ok_or_else(|| "stash swap: target row missing".to_string())?;
                occ.location = original_location;
                inv.instance_id().update(occ);

                let mut mv = inv
                    .instance_id()
                    .find(item_instance_id)
                    .ok_or_else(|| "stash swap: source row missing".to_string())?;
                mv.location = dest;
                inv.instance_id().update(mv);
            }
        }
    } else {
        let mut mv = inv
            .instance_id()
            .find(item_instance_id)
            .ok_or_else(|| "stash place: item row missing".to_string())?;
        mv.location = dest;
        inv.instance_id().update(mv);
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn stash_push_item(ctx: &ReducerContext, item_instance_id: u64, unit_key: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_push blocked: {e}");
        return;
    }
    let Some(owner_id) = owned_apartment_stash_owner_near_sender(ctx, &unit_key) else {
        return;
    };
    let Some(slot) = first_empty_stash_slot(ctx, owner_id, &unit_key) else {
        return;
    };
    if let Err(e) = stash_push_item_to_slot_impl(ctx, item_instance_id, &unit_key, slot) {
        log::warn!("stash_push: {e}");
    }
}

fn stash_push_item_to_slot_impl(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: &str,
    target_stash_slot: u16,
) -> Result<(), String> {
    if target_stash_slot >= NUM_STASH_SLOTS {
        return Err("bad stash slot".to_string());
    }
    let owner_id = owned_apartment_stash_owner_near_sender(ctx, unit_key)
        .ok_or_else(|| "caller may not push to stash".to_string())?;
    let _row = inventory::get_player_item(ctx, item_instance_id)?;
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
    )
}

#[spacetimedb::reducer]
pub fn stash_push_item_to_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_stash_slot: u16,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_push_to_slot blocked: {e}");
        return;
    }
    if let Err(e) =
        stash_push_item_to_slot_impl(ctx, item_instance_id, &unit_key, target_stash_slot)
    {
        log::warn!("stash_push_to_slot: {e}");
    }
}

fn stash_pull_item_to_inventory_slot_impl(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: &str,
    target_inventory_slot: u16,
) -> Result<(), String> {
    if target_inventory_slot >= NUM_PLAYER_INVENTORY_SLOTS {
        return Err("bad inventory slot".to_string());
    }
    let sender = ctx.sender();
    let owner_id = apartment_stash_owner_near_sender(ctx, unit_key)
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
    )
}

#[spacetimedb::reducer]
pub fn stash_pull_item_to_inventory_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_inventory_slot: u16,
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
    ) {
        log::warn!("stash_pull_to_inventory_slot: {e}");
    }
}

fn stash_pull_item_to_hotbar_slot_impl(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: &str,
    target_hotbar_slot: u8,
) -> Result<(), String> {
    if target_hotbar_slot >= NUM_PLAYER_HOTBAR_SLOTS {
        return Err("bad hotbar slot".to_string());
    }
    let sender = ctx.sender();
    let owner_id = apartment_stash_owner_near_sender(ctx, unit_key)
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
    )
}

#[spacetimedb::reducer]
pub fn stash_pull_item_to_hotbar_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_hotbar_slot: u8,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_pull_to_hotbar_slot blocked: {e}");
        return;
    }
    if let Err(e) =
        stash_pull_item_to_hotbar_slot_impl(ctx, item_instance_id, &unit_key, target_hotbar_slot)
    {
        log::warn!("stash_pull_to_hotbar_slot: {e}");
    }
}

#[spacetimedb::reducer]
pub fn stash_move_item_to_slot(
    ctx: &ReducerContext,
    item_instance_id: u64,
    unit_key: String,
    target_stash_slot: u16,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_move_to_slot blocked: {e}");
        return;
    }
    if target_stash_slot >= NUM_STASH_SLOTS {
        log::warn!("stash_move_to_slot: bad stash slot");
        return;
    }
    let Some(owner_id) = apartment_stash_owner_near_sender(ctx, &unit_key) else {
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
    ) {
        log::warn!("stash_move_to_slot: {e}");
    }
}

#[spacetimedb::reducer]
pub fn stash_pull_item(ctx: &ReducerContext, item_instance_id: u64, unit_key: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("stash_pull blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    let Some(owner_id) = apartment_stash_owner_near_sender(ctx, &unit_key) else {
        return;
    };
    if stash_item_for_unit(ctx, item_instance_id, &unit_key, owner_id).is_none() {
        return;
    };
    let Some(empty_inv) = (0..NUM_PLAYER_INVENTORY_SLOTS)
        .find(|s| find_item_in_inventory_slot(ctx, sender, *s).is_none())
    else {
        return;
    };
    if let Err(e) =
        stash_pull_item_to_inventory_slot_impl(ctx, item_instance_id, &unit_key, empty_inv)
    {
        log::warn!("stash_pull: {e}");
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
        _ => false,
    }
}

/// Breach / damage the nearest residential swing door in front of the attacker (no player hit).
pub(crate) fn apply_forward_melee_door_damage(
    ctx: &ReducerContext,
    _attacker: Identity,
    pose: &PlayerPose,
    dmg: f32,
) {
    if dmg <= 0.5 {
        return;
    }
    const REACH: f32 = 2.15;
    let fx = -pose.yaw.sin();
    let fz = -pose.yaw.cos();
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

/// Open unclaimed corridor doors visually (desired_open = 1, swing snapped open).
pub fn open_unclaimed_residential_doors(ctx: &ReducerContext) {
    for mut d in ctx.db.apartment_door().iter() {
        if !d.template_id.contains("unit_") {
            continue;
        }
        let uk = crate::apartment_door::resident_unit_key_from_door_row(&d);
        if let Some(unit) = ctx.db.apartment_unit().unit_key().find(&uk) {
            if unit.state == UNIT_STATE_UNCLAIMED {
                d.desired_open = 1;
                d.swing_open_01 = 1.0;
                ctx.db.apartment_door().row_key().update(d);
            }
        }
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

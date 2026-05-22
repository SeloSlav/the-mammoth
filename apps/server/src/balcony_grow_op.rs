//! Balcony grow-op: tray plants, water patches, fertilizer stash, scheduled growth tick.
//! Keep constants in sync with `packages/schemas/src/balconyGrowOp.ts`.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::apartments::{self, apartment_unit, apartment_unit_decor, ApartmentUnitDecor};
use crate::auth;
use crate::crafting::emit_hud_notice;
use crate::inventory::{
    self, find_item_in_hotbar_slot, find_item_in_stash_slot, remove_stash_item_quantity,
};
use crate::inventory_models::APARTMENT_STASH_KIND_GROW_TRAY;
use crate::items_catalog::{self, BalconyGrowSpec};
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};
use crate::pose::player_pose;
use crate::water_container::{self, WATER_BOTTLE_DEF_ID};

pub(crate) const BALCONY_GROW_TRAY_COUNT: usize = 8;
pub(crate) const BALCONY_GROW_SLOTS_PER_TRAY: u8 = 4;
pub(crate) const BALCONY_GROW_TRAY_MAX_WATER_L: f32 = 2.0;
pub(crate) const BALCONY_GROW_LIGHT_BONUS: f32 = 0.15;
pub(crate) const BALCONY_GROW_FERTILIZER_BONUS: f32 = 0.20;
pub(crate) const BALCONY_GROW_WATER_BONUS_PER_HALF_L: f32 = 0.10;
pub(crate) const BALCONY_WATER_PATCH_RADIUS_M: f32 = 0.55;
pub(crate) const BALCONY_WATER_PATCH_DUMP_L: f32 = 0.35;
/// Wet-shadow visual lifetime — fades before the next tending pass.
pub(crate) const BALCONY_WATER_PATCH_DURATION_SECS: i64 = 45;
/// Session baseline: ~15 min seed→mature at 1.0× for a 5-day catalog crop (sim time only).
pub(crate) const BALCONY_GROW_BASELINE_DURATION_SECS: i64 = 900;
/// Catalog grow-days that map to [`BALCONY_GROW_BASELINE_DURATION_SECS`] at 1.0×.
pub(crate) const BALCONY_GROW_REFERENCE_DAYS: i64 = 5;
pub(crate) const BALCONY_GAME_DAY_SECS: i64 =
    BALCONY_GROW_BASELINE_DURATION_SECS / BALCONY_GROW_REFERENCE_DAYS;
pub(crate) const BALCONY_GROW_WILT_TICKS_WITHOUT_WATER: u8 = 8;
pub(crate) const BALCONY_GROW_TICK_INTERVAL_SECS: i64 = 5;
/// Tray evaporation per 5s tick — ~4 min from full to dry at session crop pacing.
pub(crate) const BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK: f32 = 0.042;
/// Single substrate stack slot in each grow-tray stash.
pub(crate) const BALCONY_GROW_FERTILIZER_STASH_SLOT: u16 = 0;

pub(crate) const PHASE_EMPTY: u8 = 0;
pub(crate) const PHASE_GROWING: u8 = 1;
pub(crate) const PHASE_MATURE: u8 = 2;
pub(crate) const PHASE_WILTED: u8 = 3;

const GROW_TRAY_MODEL_SUFFIX: &str = "objects/grow-tray.glb";
const TRAY_INTERACT_RADIUS_M: f32 = 1.75;
const TRAY_INTERACT_RADIUS_SQ: f32 = TRAY_INTERACT_RADIUS_M * TRAY_INTERACT_RADIUS_M;
/// Balcony trays use negative layout `fz`; feet may sit outside strict unit AABB.
const GROW_TRAY_UNIT_HULL_SLACK_XZ: f32 = 4.0;
const INTERACT_FEET_Y_BELOW_SLACK_M: f32 = 0.35;
const INTERACT_FEET_Y_ABOVE_SLACK_M: f32 = 2.4;

/// Stable builtin tray UUIDs — sorted by (fz, fx) in `owned_apartment_builtins.json`.
pub(crate) const BALCONY_GROW_TRAY_BUILTIN_IDS: [&str; BALCONY_GROW_TRAY_COUNT] = [
    "8e48c06b-c005-4425-9fdc-a527e67168ee",
    "825bca36-e9b8-4fa7-9883-2d57ba0ebe04",
    "5a8db793-b6e6-4266-bd96-8d53a1452e91",
    "74e853d2-62cb-42b3-b740-c8ea51c6179f",
    "8cf090f7-acfa-460d-8360-f8c48a233557",
    "74725d62-5270-4d8f-a1fe-4e08f9215e0d",
    "f7b5698a-e331-48bf-b5f2-aab0002b037d",
    "8b770390-544f-4a40-aaa3-ec34d9ed66a7",
];

pub(crate) const BALCONY_GROW_FERTILIZER_DEF_ID: &str = "balcony-grow-substrate";

#[spacetimedb::table(public, accessor = balcony_grow_tray)]
pub struct BalconyGrowTray {
    #[primary_key]
    pub row_key: String,
    pub unit_key: String,
    pub tray_id: String,
    pub pos_x: f32,
    pub pos_z: f32,
    pub water_liters: f32,
    pub dry_ticks: u8,
}

#[spacetimedb::table(public, accessor = balcony_grow_plant)]
pub struct BalconyGrowPlant {
    #[primary_key]
    pub row_key: String,
    pub unit_key: String,
    pub tray_id: String,
    pub slot_index: u8,
    pub crop_def_id: String,
    pub planted_at_micros: i64,
    /// Legacy timestamp field — kept for row migration backfill only.
    pub mature_at_micros: i64,
    pub phase: u8,
    pub owner: Identity,
    /// Catalog grow-days required at plant (after tray bonuses).
    #[default(0u8)]
    pub target_days: u8,
    /// Whole days elapsed while growing (sleep / death day skips).
    #[default(0u8)]
    pub days_grown: u8,
}

#[spacetimedb::table(public, accessor = balcony_water_patch)]
pub struct BalconyWaterPatch {
    #[primary_key]
    #[auto_inc]
    pub patch_id: u64,
    pub unit_key: String,
    pub pos_x: f32,
    pub pos_z: f32,
    pub radius_m: f32,
    pub water_liters: f32,
    pub created_at_micros: i64,
    pub expires_at_micros: i64,
}

#[spacetimedb::table(public, accessor = balcony_grow_light)]
pub struct BalconyGrowLight {
    #[primary_key]
    pub unit_key: String,
    pub lights_on: u8,
}

#[spacetimedb::table(public, accessor = player_grow_journal)]
pub struct PlayerGrowJournal {
    #[primary_key]
    pub row_key: String,
    pub identity: Identity,
    pub crop_def_id: String,
}

#[spacetimedb::table(
    public,
    accessor = balcony_grow_tick_schedule,
    scheduled(balcony_grow_tick_step)
)]
pub struct BalconyGrowTickSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

pub(crate) fn grow_tray_stash_key(unit_key: &str, tray_id: &str) -> String {
    format!("{unit_key}#grow_tray:{tray_id}")
}

fn tray_row_key(unit_key: &str, tray_id: &str) -> String {
    format!("{unit_key}#{tray_id}")
}

fn plant_row_key(unit_key: &str, tray_id: &str, slot_index: u8) -> String {
    format!("{unit_key}#{tray_id}#{slot_index}")
}

fn journal_row_key(owner: Identity, crop_def_id: &str) -> String {
    format!("{owner}#{crop_def_id}")
}

pub(crate) fn is_known_tray_id(tray_id: &str) -> bool {
    BALCONY_GROW_TRAY_BUILTIN_IDS.contains(&tray_id)
        || tray_id
            .strip_prefix("decor:")
            .and_then(|id| id.parse::<u64>().ok())
            .is_some()
}

#[derive(Clone)]
struct ResolvedGrowTrayPlacement {
    tray_id: String,
    pos_x: f32,
    pos_z: f32,
}

fn grow_tray_id_for_decor_id(decor_id: u64) -> String {
    format!("decor:{decor_id}")
}

fn tick_interval_micros() -> i64 {
    BALCONY_GROW_TICK_INTERVAL_SECS * 1_000_000
}

pub(crate) fn start_balcony_grow_schedule(ctx: &ReducerContext) {
    let table = ctx.db.balcony_grow_tick_schedule();
    if table.iter().next().is_some() {
        return;
    }
    let _ = table.insert(BalconyGrowTickSchedule {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(TimeDuration::from_micros(tick_interval_micros())),
    });
}

pub(crate) fn ensure_balcony_grow_for_owner(ctx: &ReducerContext, owner: Identity) {
    let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, owner) else {
        return;
    };
    ensure_balcony_grow_for_unit(ctx, unit_key.as_str());
}

pub(crate) fn ensure_balcony_grow_for_unit(ctx: &ReducerContext, unit_key: &str) {
    ensure_grow_light_row(ctx, unit_key);
    let tray_placements = resolve_tray_placements(ctx, unit_key);
    let tray_table = ctx.db.balcony_grow_tray();
    for placement in tray_placements {
        let row_key = tray_row_key(unit_key, placement.tray_id.as_str());
        if let Some(mut row) = tray_table.row_key().find(&row_key) {
            if (row.pos_x - placement.pos_x).abs() > 0.02
                || (row.pos_z - placement.pos_z).abs() > 0.02
            {
                row.pos_x = placement.pos_x;
                row.pos_z = placement.pos_z;
                tray_table.row_key().update(row);
            }
            continue;
        }
        let _ = tray_table.insert(BalconyGrowTray {
            row_key,
            unit_key: unit_key.to_string(),
            tray_id: placement.tray_id,
            pos_x: placement.pos_x,
            pos_z: placement.pos_z,
            water_liters: 0.0,
            dry_ticks: 0,
        });
    }
}

fn ensure_grow_light_row(ctx: &ReducerContext, unit_key: &str) {
    let table = ctx.db.balcony_grow_light();
    if table.unit_key().find(&unit_key.to_string()).is_some() {
        return;
    }
    let _ = table.insert(BalconyGrowLight {
        unit_key: unit_key.to_string(),
        lights_on: 1,
    });
}

fn authored_grow_tray_layout_fraction(tray_id: &str) -> Option<(f32, f32)> {
    let (fx, fz) = match tray_id {
        "8e48c06b-c005-4425-9fdc-a527e67168ee" => (0.843_385_3, -0.026_789_22),
        "825bca36-e9b8-4fa7-9883-2d57ba0ebe04" => (0.927_365_1, -0.026_789_22),
        "5a8db793-b6e6-4266-bd96-8d53a1452e91" => (0.843_385_3, 0.095_401_47),
        "74e853d2-62cb-42b3-b740-c8ea51c6179f" => (0.927_365_1, 0.095_401_47),
        "8cf090f7-acfa-460d-8360-f8c48a233557" => (0.843_385_3, 0.217_592_17),
        "74725d62-5270-4d8f-a1fe-4e08f9215e0d" => (0.927_365_1, 0.217_592_17),
        "f7b5698a-e331-48bf-b5f2-aab0002b037d" => (0.927_365_1, 0.339_782_86),
        "8b770390-544f-4a40-aaa3-ec34d9ed66a7" => (0.843_385_3, 0.339_782_86),
        _ => return None,
    };
    Some((fx, fz))
}

fn content_grow_tray_covered_by_decor(decor_rows: &[ApartmentUnitDecor], x: f32, z: f32) -> bool {
    const DEDUPE_XZ_M: f32 = 0.4;
    let dedupe_sq = DEDUPE_XZ_M * DEDUPE_XZ_M;
    decor_rows.iter().any(|d| {
        let dx = d.pos_x - x;
        let dz = d.pos_z - z;
        dx * dx + dz * dz <= dedupe_sq
    })
}

fn resolve_tray_placements(ctx: &ReducerContext, unit_key: &str) -> Vec<ResolvedGrowTrayPlacement> {
    let mut decor_rows: Vec<_> = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| d.unit_key == unit_key && d.model_rel_path.contains(GROW_TRAY_MODEL_SUFFIX))
        .collect();
    decor_rows.sort_by(|a, b| a.decor_id.cmp(&b.decor_id));
    let mut out: Vec<ResolvedGrowTrayPlacement> = decor_rows
        .iter()
        .map(|d| ResolvedGrowTrayPlacement {
            tray_id: grow_tray_id_for_decor_id(d.decor_id),
            pos_x: d.pos_x,
            pos_z: d.pos_z,
        })
        .collect();

    let Some(unit) = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
    else {
        return out;
    };
    for tray_id in BALCONY_GROW_TRAY_BUILTIN_IDS {
        let (fx, fz) = authored_grow_tray_layout_fraction(tray_id).unwrap_or((0.0, 0.0));
        let (pos_x, pos_z) = apartments::authored_placed_item_world_xz(&unit, fx, fz);
        if content_grow_tray_covered_by_decor(&decor_rows, pos_x, pos_z) {
            continue;
        }
        out.push(ResolvedGrowTrayPlacement {
            tray_id: tray_id.to_string(),
            pos_x,
            pos_z,
        });
    }
    out
}

fn feet_inside_unit_grow_tray_slack(
    unit: &apartments::ApartmentUnit,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    let s = GROW_TRAY_UNIT_HULL_SLACK_XZ;
    x >= unit.bound_min_x - s
        && x <= unit.bound_max_x + s
        && z >= unit.bound_min_z - s
        && z <= unit.bound_max_z + s
        && y >= unit.bound_min_y - 0.05
        && y <= unit.bound_max_y + 2.45
}

fn feet_vertical_ok(unit_floor_y: f32, y: f32) -> bool {
    y >= unit_floor_y - INTERACT_FEET_Y_BELOW_SLACK_M
        && y <= unit_floor_y + INTERACT_FEET_Y_ABOVE_SLACK_M
}

fn pose_near_tray(
    unit: &apartments::ApartmentUnit,
    pose_x: f32,
    pose_y: f32,
    pose_z: f32,
    tray_x: f32,
    tray_z: f32,
) -> bool {
    if !feet_inside_unit_grow_tray_slack(unit, pose_x, pose_y, pose_z) {
        return false;
    }
    let dx = pose_x - tray_x;
    let dz = pose_z - tray_z;
    if dx * dx + dz * dz > TRAY_INTERACT_RADIUS_SQ {
        return false;
    }
    feet_vertical_ok(unit.foot_y, pose_y)
}

fn tray_row(ctx: &ReducerContext, unit_key: &str, tray_id: &str) -> Option<BalconyGrowTray> {
    ctx.db
        .balcony_grow_tray()
        .row_key()
        .find(&tray_row_key(unit_key, tray_id))
}

fn player_near_tray(ctx: &ReducerContext, unit_key: &str, tray_id: &str) -> Result<(), String> {
    let sender = ctx.sender();
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
        .ok_or_else(|| "unknown unit".to_string())?;
    let owner = unit.owner.ok_or_else(|| "unit not claimed".to_string())?;
    if owner != sender {
        return Err("not your apartment".to_string());
    }
    let placement = resolve_tray_placements(ctx, unit_key)
        .into_iter()
        .find(|p| p.tray_id == tray_id)
        .ok_or_else(|| "unknown tray".to_string())?;
    let pose = ctx
        .db
        .player_pose()
        .identity()
        .find(&sender)
        .ok_or_else(|| "missing pose".to_string())?;
    if !pose_near_tray(
        &unit,
        pose.x,
        pose.y,
        pose.z,
        placement.pos_x,
        placement.pos_z,
    ) {
        return Err("move closer to the grow tray".to_string());
    }
    Ok(())
}

fn fertilizer_present(ctx: &ReducerContext, unit_key: &str, tray_id: &str) -> bool {
    let stash_key = grow_tray_stash_key(unit_key, tray_id);
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string());
    let Some(owner) = unit.and_then(|u| u.owner) else {
        return false;
    };
    find_item_in_stash_slot(
        ctx,
        owner,
        stash_key.as_str(),
        BALCONY_GROW_FERTILIZER_STASH_SLOT,
    )
    .map(|i| i.def_id == BALCONY_GROW_FERTILIZER_DEF_ID)
    .unwrap_or(false)
}

/// One substrate unit per harvested crop — ties trays to the fish/compost loop.
fn consume_tray_substrate_on_harvest(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
    tray_id: &str,
) {
    let stash_key = grow_tray_stash_key(unit_key, tray_id);
    let Some(item) = find_item_in_stash_slot(
        ctx,
        owner,
        stash_key.as_str(),
        BALCONY_GROW_FERTILIZER_STASH_SLOT,
    ) else {
        return;
    };
    if item.def_id != BALCONY_GROW_FERTILIZER_DEF_ID {
        return;
    }
    let _ = remove_stash_item_quantity(
        ctx,
        owner,
        stash_key.as_str(),
        BALCONY_GROW_FERTILIZER_STASH_SLOT,
        1,
    );
}

fn lights_on_for_unit(ctx: &ReducerContext, unit_key: &str) -> bool {
    ctx.db
        .balcony_grow_light()
        .unit_key()
        .find(&unit_key.to_string())
        .map(|r| r.lights_on != 0)
        .unwrap_or(true)
}

pub(crate) fn grow_speed_modifier(
    lights_on: bool,
    fertilizer_present: bool,
    water_liters: f32,
) -> f32 {
    let mut m = 1.0_f32;
    if lights_on {
        m += BALCONY_GROW_LIGHT_BONUS;
    }
    if fertilizer_present {
        m += BALCONY_GROW_FERTILIZER_BONUS;
    }
    let capped = water_liters.min(BALCONY_GROW_TRAY_MAX_WATER_L);
    let water_steps = (capped / 0.5).floor() as i32;
    m += water_steps as f32 * BALCONY_GROW_WATER_BONUS_PER_HALF_L;
    m
}

fn random_grow_days(ctx: &ReducerContext, spec: &BalconyGrowSpec) -> u8 {
    let min = spec.grow_days_min;
    let max = spec.grow_days_max.max(min);
    if min == max {
        return min;
    }
    let span = (max - min) as u64 + 1;
    let roll = (ctx.timestamp.to_micros_since_unix_epoch() as u64) % span;
    min + roll as u8
}

fn compute_target_days(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
    spec: &BalconyGrowSpec,
) -> u8 {
    let days = random_grow_days(ctx, spec);
    let tray = tray_row(ctx, unit_key, tray_id);
    let water = tray.map(|t| t.water_liters).unwrap_or(0.0);
    let modifier = grow_speed_modifier(
        lights_on_for_unit(ctx, unit_key),
        fertilizer_present(ctx, unit_key, tray_id),
        water,
    )
    .max(0.01);
    ((days as f32 / modifier).ceil() as u8).max(1)
}

fn maybe_backfill_plant_day_fields(plant: &mut BalconyGrowPlant, now_micros: i64) {
    if plant.target_days > 0 {
        return;
    }
    if plant.mature_at_micros <= plant.planted_at_micros {
        plant.target_days = BALCONY_GROW_REFERENCE_DAYS as u8;
        return;
    }
    let grow_secs = (plant.mature_at_micros - plant.planted_at_micros) / 1_000_000;
    plant.target_days = ((grow_secs as f32 / BALCONY_GAME_DAY_SECS as f32).ceil() as u8).max(1);
    let elapsed_secs = ((now_micros - plant.planted_at_micros).max(0) as f32) / 1_000_000.0;
    plant.days_grown = (elapsed_secs / BALCONY_GAME_DAY_SECS as f32)
        .floor()
        .clamp(0.0, plant.target_days as f32) as u8;
}

fn plant_is_mature(plant: &BalconyGrowPlant) -> bool {
    if plant.phase == PHASE_MATURE {
        return true;
    }
    plant.target_days > 0 && plant.days_grown >= plant.target_days
}

fn apply_grow_day_credit(plant: &mut BalconyGrowPlant, days: u8) {
    if plant.phase != PHASE_GROWING || days == 0 || plant.target_days == 0 {
        return;
    }
    plant.days_grown = plant
        .days_grown
        .saturating_add(days)
        .min(plant.target_days);
    if plant.days_grown >= plant.target_days {
        plant.phase = PHASE_MATURE;
    }
}

fn slot_empty(ctx: &ReducerContext, unit_key: &str, tray_id: &str, slot_index: u8) -> bool {
    !ctx.db.balcony_grow_plant().iter().any(|p| {
        p.unit_key == unit_key
            && p.tray_id == tray_id
            && p.slot_index == slot_index
            && p.phase != PHASE_EMPTY
    })
}

fn consume_one_seed_from_hotbar(
    ctx: &ReducerContext,
    sender: Identity,
    hotbar_slot: u8,
    seed_def_id: &str,
) -> Result<(), String> {
    let item = find_item_in_hotbar_slot(ctx, sender, hotbar_slot)
        .ok_or_else(|| "no seed in hotbar slot".to_string())?;
    if item.def_id != seed_def_id {
        return Err("hotbar item mismatch".to_string());
    }
    inventory::remove_player_item_quantity(ctx, item.instance_id, 1)?;
    Ok(())
}

#[spacetimedb::reducer]
pub fn plant_balcony_grow_slot(
    ctx: &ReducerContext,
    unit_key: String,
    tray_id: String,
    slot_index: u8,
    seed_def_id: String,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("plant_balcony_grow_slot blocked: {e}");
        return;
    }
    if let Err(e) = plant_balcony_grow_slot_impl(
        ctx,
        unit_key.as_str(),
        tray_id.as_str(),
        slot_index,
        seed_def_id.as_str(),
    ) {
        log::debug!("plant_balcony_grow_slot: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

fn plant_balcony_grow_slot_impl(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
    slot_index: u8,
    seed_def_id: &str,
) -> Result<(), String> {
    if slot_index >= BALCONY_GROW_SLOTS_PER_TRAY {
        return Err("invalid slot".to_string());
    }
    let spec = items_catalog::balcony_grow_spec(seed_def_id)
        .ok_or_else(|| "not a plantable seed".to_string())?;
    ensure_balcony_grow_for_unit(ctx, unit_key);
    if tray_row(ctx, unit_key, tray_id).is_none() {
        return Err("invalid tray".to_string());
    }
    player_near_tray(ctx, unit_key, tray_id)?;
    if !slot_empty(ctx, unit_key, tray_id, slot_index) {
        return Err("slot already occupied".to_string());
    }

    let sender = ctx.sender();
    let hotbar_slot = ctx
        .db
        .player_active_hotbar()
        .identity()
        .find(&sender)
        .map(|r| r.slot_index)
        .filter(|s| *s != ACTIVE_HOTBAR_SLOT_CLEARED)
        .ok_or_else(|| "select a seed on the hotbar".to_string())?;
    consume_one_seed_from_hotbar(ctx, sender, hotbar_slot, seed_def_id)?;

    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let target_days = compute_target_days(ctx, unit_key, tray_id, spec);

    let row_key = plant_row_key(unit_key, tray_id, slot_index);
    let plant_table = ctx.db.balcony_grow_plant();
    if let Some(mut existing) = plant_table.row_key().find(&row_key) {
        existing.crop_def_id = seed_def_id.to_string();
        existing.planted_at_micros = now;
        existing.mature_at_micros = 0;
        existing.target_days = target_days;
        existing.days_grown = 0;
        existing.phase = PHASE_GROWING;
        existing.owner = sender;
        plant_table.row_key().update(existing);
    } else {
        let _ = plant_table.insert(BalconyGrowPlant {
            row_key,
            unit_key: unit_key.to_string(),
            tray_id: tray_id.to_string(),
            slot_index,
            crop_def_id: seed_def_id.to_string(),
            planted_at_micros: now,
            mature_at_micros: 0,
            phase: PHASE_GROWING,
            owner: sender,
            target_days,
            days_grown: 0,
        });
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn harvest_balcony_grow_slot(
    ctx: &ReducerContext,
    unit_key: String,
    tray_id: String,
    slot_index: u8,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("harvest_balcony_grow_slot blocked: {e}");
        return;
    }
    if let Err(e) =
        harvest_balcony_grow_slot_impl(ctx, unit_key.as_str(), tray_id.as_str(), slot_index)
    {
        log::debug!("harvest_balcony_grow_slot: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

fn harvest_balcony_grow_slot_impl(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
    slot_index: u8,
) -> Result<(), String> {
    ensure_balcony_grow_for_unit(ctx, unit_key);
    if slot_index >= BALCONY_GROW_SLOTS_PER_TRAY || tray_row(ctx, unit_key, tray_id).is_none() {
        return Err("invalid tray slot".to_string());
    }
    player_near_tray(ctx, unit_key, tray_id)?;
    let sender = ctx.sender();
    let row_key = plant_row_key(unit_key, tray_id, slot_index);
    let plant_table = ctx.db.balcony_grow_plant();
    let plant = plant_table
        .row_key()
        .find(&row_key)
        .ok_or_else(|| "nothing planted here".to_string())?;
    if !plant_is_mature(&plant) {
        return Err("crop is not ready to harvest".to_string());
    }
    let spec = items_catalog::balcony_grow_spec(plant.crop_def_id.as_str())
        .ok_or_else(|| "unknown crop".to_string())?;
    inventory::try_grant_stack_to_player(ctx, sender, spec.harvest_def_id.clone(), 1)?;
    plant_table.row_key().delete(row_key);
    if let Some(owner) = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
        .and_then(|u| u.owner)
    {
        consume_tray_substrate_on_harvest(ctx, owner, unit_key, tray_id);
    }
    maybe_emit_first_harvest_journal(ctx, sender, plant.crop_def_id.as_str());
    Ok(())
}

fn first_harvest_hint(crop_def_id: &str) -> &'static str {
    match crop_def_id {
        "lovage-seeds" => "Libelek goes in Thursday soup — ask the engineer for the communal pot.",
        "parsley-seeds" => "Fresh peršin finishes every pot — stash some for trade day.",
        "dill-seeds" => "Kopar pairs with tank fish — the engineer knows the grill schedule.",
        "paprika-seedlings" => "Feferoni slow-roast best on the stove — save three for ajvar.",
        "green-onion-sets" => "Mladi luk tops any ćevap plate — neighbours pay in cigarettes.",
        "radish-sprout-seeds" => {
            "Klica repe is emergency greens — eat raw when the fridge runs dry."
        }
        "oyster-mushroom-spore" => "Dry bukovačica on the rack before soup season.",
        "scented-geranium-cuttings" => {
            "Pelargonija čaj calms the block — steep after a long shift."
        }
        _ => "Balcony harvest logged — check the stove for communal recipes.",
    }
}

fn maybe_emit_first_harvest_journal(ctx: &ReducerContext, owner: Identity, crop_def_id: &str) {
    let journal = ctx.db.player_grow_journal();
    let row_key = journal_row_key(owner, crop_def_id);
    if journal.row_key().find(&row_key).is_some() {
        return;
    }
    let _ = journal.insert(PlayerGrowJournal {
        row_key,
        identity: owner,
        crop_def_id: crop_def_id.to_string(),
    });
    emit_hud_notice(ctx, owner, first_harvest_hint(crop_def_id).to_string());
}

#[spacetimedb::reducer]
pub fn dump_water_from_bottle(ctx: &ReducerContext, aim_x: f32, aim_z: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("dump_water_from_bottle blocked: {e}");
        return;
    }
    if let Err(e) = dump_water_from_bottle_impl(ctx, aim_x, aim_z) {
        log::debug!("dump_water_from_bottle: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

fn dump_water_from_bottle_impl(ctx: &ReducerContext, aim_x: f32, aim_z: f32) -> Result<(), String> {
    let sender = ctx.sender();
    let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, sender) else {
        return Err("need a claimed apartment".to_string());
    };
    let hotbar_slot = ctx
        .db
        .player_active_hotbar()
        .identity()
        .find(&sender)
        .map(|r| r.slot_index)
        .filter(|s| *s != ACTIVE_HOTBAR_SLOT_CLEARED)
        .ok_or_else(|| "equip a water bottle".to_string())?;
    let bottle = find_item_in_hotbar_slot(ctx, sender, hotbar_slot)
        .ok_or_else(|| "no water bottle equipped".to_string())?;
    if bottle.def_id != WATER_BOTTLE_DEF_ID {
        return Err("equip a water bottle".to_string());
    }
    let spec = water_container::water_container_spec(WATER_BOTTLE_DEF_ID)
        .ok_or_else(|| "bottle spec missing".to_string())?;
    let current = water_container::get_bottle_fill_liters(ctx, bottle.instance_id);
    let dump = BALCONY_WATER_PATCH_DUMP_L.min(current);
    if dump <= 0.0001 {
        return Err("water bottle is empty".to_string());
    }
    water_container::set_bottle_fill_liters(
        ctx,
        bottle.instance_id,
        current - dump,
        spec.capacity_liters,
    );

    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let expires = now + BALCONY_WATER_PATCH_DURATION_SECS * 1_000_000;
    ensure_balcony_grow_for_unit(ctx, unit_key.as_str());
    let _ = ctx.db.balcony_water_patch().insert(BalconyWaterPatch {
        patch_id: 0,
        unit_key: unit_key.clone(),
        pos_x: aim_x,
        pos_z: aim_z,
        radius_m: BALCONY_WATER_PATCH_RADIUS_M,
        water_liters: dump,
        created_at_micros: now,
        expires_at_micros: expires,
    });

    apply_patch_water_to_trays(ctx, unit_key.as_str(), aim_x, aim_z, dump);
    Ok(())
}

fn apply_patch_water_to_trays(
    ctx: &ReducerContext,
    unit_key: &str,
    patch_x: f32,
    patch_z: f32,
    dump_liters: f32,
) {
    let current_tray_ids: std::collections::HashSet<String> =
        resolve_tray_placements(ctx, unit_key)
            .into_iter()
            .map(|p| p.tray_id)
            .collect();
    let tray_table = ctx.db.balcony_grow_tray();
    let trays: Vec<BalconyGrowTray> = tray_table
        .iter()
        .filter(|t| t.unit_key == unit_key && current_tray_ids.contains(t.tray_id.as_str()))
        .collect();
    if trays.is_empty() {
        return;
    }
    let radius_sq = BALCONY_WATER_PATCH_RADIUS_M * BALCONY_WATER_PATCH_RADIUS_M;
    let in_range: Vec<usize> = trays
        .iter()
        .enumerate()
        .filter(|(_, t)| {
            let dx = t.pos_x - patch_x;
            let dz = t.pos_z - patch_z;
            dx * dx + dz * dz <= radius_sq
        })
        .map(|(i, _)| i)
        .collect();
    if in_range.is_empty() {
        return;
    }
    let share = dump_liters / in_range.len() as f32;
    for idx in in_range {
        let key = trays[idx].row_key.clone();
        let Some(mut tray) = tray_table.row_key().find(&key) else {
            continue;
        };
        tray.water_liters = (tray.water_liters + share).min(BALCONY_GROW_TRAY_MAX_WATER_L);
        tray.dry_ticks = 0;
        tray_table.row_key().update(tray);
    }
}

/// Sleep / death day hook — advance balcony plants and dry overnight moisture.
pub(crate) fn advance_world_day_for_unit(ctx: &ReducerContext, unit_key: &str, days: u8) {
    if days == 0 {
        return;
    }
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let plant_table = ctx.db.balcony_grow_plant();
    let plants: Vec<BalconyGrowPlant> = plant_table
        .iter()
        .filter(|p| p.unit_key == unit_key && p.phase == PHASE_GROWING)
        .collect();
    for mut plant in plants {
        maybe_backfill_plant_day_fields(&mut plant, now);
        apply_grow_day_credit(&mut plant, days);
        plant_table.row_key().update(plant);
    }

    let patch_table = ctx.db.balcony_water_patch();
    for patch in patch_table
        .iter()
        .filter(|p| p.unit_key == unit_key)
        .collect::<Vec<_>>()
    {
        patch_table.patch_id().delete(patch.patch_id);
    }

    let tray_table = ctx.db.balcony_grow_tray();
    for mut tray in tray_table
        .iter()
        .filter(|t| t.unit_key == unit_key)
        .collect::<Vec<_>>()
    {
        tray.water_liters = (tray.water_liters * 0.65).max(0.0);
        if tray.water_liters <= 0.001 {
            tray.dry_ticks = tray.dry_ticks.saturating_add(1);
        }
        tray_table.row_key().update(tray);
    }
}

/// Legacy alias — prefer [`advance_world_day_for_unit`].
pub(crate) fn advance_balcony_grow_for_unit(ctx: &ReducerContext, unit_key: &str, days: u8) {
    advance_world_day_for_unit(ctx, unit_key, days);
}

#[spacetimedb::reducer]
pub fn balcony_grow_tick_step(ctx: &ReducerContext, _arg: BalconyGrowTickSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    let now = ctx.timestamp.to_micros_since_unix_epoch();

    let patch_table = ctx.db.balcony_water_patch();
    for patch in patch_table.iter().collect::<Vec<_>>() {
        if patch.expires_at_micros <= now {
            patch_table.patch_id().delete(patch.patch_id);
        }
    }

    let tray_table = ctx.db.balcony_grow_tray();
    for mut tray in tray_table.iter().collect::<Vec<_>>() {
        let prev = tray.water_liters;
        tray.water_liters = (tray.water_liters - BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK).max(0.0);
        if tray.water_liters <= 0.001 {
            tray.dry_ticks = tray.dry_ticks.saturating_add(1);
        } else {
            tray.dry_ticks = 0;
        }
        if (tray.water_liters - prev).abs() > 0.0001 || tray.dry_ticks > 0 {
            tray_table.row_key().update(tray);
        }
    }

    let lights_cache: std::collections::HashMap<String, bool> = ctx
        .db
        .balcony_grow_light()
        .iter()
        .map(|l| (l.unit_key.clone(), l.lights_on != 0))
        .collect();

    let plant_table = ctx.db.balcony_grow_plant();
    for mut plant in plant_table.iter().collect::<Vec<_>>() {
        let unit_key = plant.unit_key.clone();
        let tray_id = plant.tray_id.clone();
        let mut dirty = false;

        if plant.phase == PHASE_GROWING {
            let old_target = plant.target_days;
            let old_grown = plant.days_grown;
            maybe_backfill_plant_day_fields(&mut plant, now);
            if plant_is_mature(&plant) {
                plant.phase = PHASE_MATURE;
            }
            dirty = plant.target_days != old_target
                || plant.days_grown != old_grown
                || plant.phase == PHASE_MATURE;
        }

        if plant.phase == PHASE_GROWING {
            let tray = tray_row(ctx, unit_key.as_str(), tray_id.as_str());
            let dry = tray.map(|t| t.dry_ticks).unwrap_or(0);
            let lights = lights_cache
                .get(unit_key.as_str())
                .copied()
                .unwrap_or(true);
            if dry >= BALCONY_GROW_WILT_TICKS_WITHOUT_WATER && !lights {
                plant.phase = PHASE_WILTED;
                dirty = true;
            }
        }

        if dirty {
            plant_table.row_key().update(plant);
        }
    }
}

/// Proximity check for grow-tray fertilizer stash (`{unit_key}#grow_tray:{tray_id}`).
pub(crate) fn grow_tray_stash_near_sender(
    ctx: &ReducerContext,
    stash_key: &str,
) -> Option<(Identity, String)> {
    let sep = stash_key.rfind('#')?;
    let unit_key = stash_key.get(..sep)?;
    let tail = stash_key.get(sep + 1..)?;
    let tray_id = tail.strip_prefix("grow_tray:")?;
    ensure_balcony_grow_for_unit(ctx, unit_key);
    if tray_row(ctx, unit_key, tray_id).is_none() {
        return None;
    }
    player_near_tray(ctx, unit_key, tray_id).ok()?;
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())?;
    let owner = unit.owner?;
    Some((owner, unit_key.to_string()))
}

pub(crate) fn grow_tray_stash_kind() -> &'static str {
    APARTMENT_STASH_KIND_GROW_TRAY
}

#[cfg(test)]
mod tests {
    use super::{grow_speed_modifier, is_known_tray_id, BALCONY_GROW_TRAY_BUILTIN_IDS};

    #[test]
    fn tray_builtin_ids_count_and_known() {
        assert_eq!(BALCONY_GROW_TRAY_BUILTIN_IDS.len(), 8);
        for id in BALCONY_GROW_TRAY_BUILTIN_IDS {
            assert!(is_known_tray_id(id));
        }
        assert!(is_known_tray_id("decor:123"));
        assert!(!is_known_tray_id("decor:nope"));
    }

    #[test]
    fn grow_speed_modifier_stacks_bonuses() {
        let m = grow_speed_modifier(true, true, 1.0);
        assert!((m - 1.55).abs() < 0.001);
        let base = grow_speed_modifier(false, false, 0.0);
        assert!((base - 1.0).abs() < 0.001);
    }

    #[test]
    fn tray_water_evap_targets_session_pacing() {
        use super::{
            BALCONY_GROW_TICK_INTERVAL_SECS, BALCONY_GROW_TRAY_MAX_WATER_L,
            BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK, BALCONY_WATER_PATCH_DURATION_SECS,
        };
        let ticks = BALCONY_GROW_TRAY_MAX_WATER_L / BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK;
        let dry_secs = ticks * BALCONY_GROW_TICK_INTERVAL_SECS as f32;
        assert!((dry_secs - 238.0).abs() < 1.0);
        assert_eq!(BALCONY_WATER_PATCH_DURATION_SECS, 45);
    }

    #[test]
    fn session_baseline_maps_five_catalog_days_to_fifteen_minutes() {
        use super::{
            BALCONY_GROW_BASELINE_DURATION_SECS, BALCONY_GROW_REFERENCE_DAYS,
            BALCONY_GAME_DAY_SECS,
        };
        assert_eq!(BALCONY_GROW_BASELINE_DURATION_SECS, 900);
        assert_eq!(BALCONY_GROW_REFERENCE_DAYS, 5);
        assert_eq!(BALCONY_GAME_DAY_SECS, 180);
    }
}

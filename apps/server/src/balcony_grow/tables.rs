//! Balcony grow-op table definitions and shared constants.
//! Keep in sync with `packages/schemas/src/balconyGrowOp.ts`.

use spacetimedb::{Identity, ScheduleAt};

pub(crate) const BALCONY_GROW_TRAY_COUNT: usize = 8;
pub(crate) const BALCONY_GROW_SLOTS_PER_TRAY: u8 = 4;
pub(crate) const BALCONY_GROW_TRAY_MAX_WATER_L: f32 = 2.0;
pub(crate) const BALCONY_GROW_LIGHT_BONUS: f32 = 0.15;
pub(crate) const BALCONY_GROW_FERTILIZER_BONUS: f32 = 0.20;
pub(crate) const BALCONY_GROW_WATER_BONUS_PER_HALF_L: f32 = 0.10;
pub(crate) const BALCONY_WATER_PATCH_RADIUS_M: f32 = 0.55;
pub(crate) const BALCONY_WATER_PATCH_DUMP_L: f32 = 0.35;
pub(crate) const BALCONY_WATER_PATCH_DURATION_SECS: i64 = 45;
pub(crate) const BALCONY_GROW_BASELINE_DURATION_SECS: i64 = 900;
pub(crate) const BALCONY_GROW_REFERENCE_DAYS: i64 = 5;
pub(crate) const BALCONY_GROW_GAME_DAY_SECS: i64 =
    BALCONY_GROW_BASELINE_DURATION_SECS / BALCONY_GROW_REFERENCE_DAYS;
/// Consecutive dry nights (tray empty after sleep) before wilt when grow lights are off.
pub(crate) const BALCONY_GROW_WILT_NIGHTS_WITHOUT_WATER: u8 = 2;
pub(crate) const BALCONY_GROW_TICK_INTERVAL_SECS: i64 = 5;
/// Liters lost from each tray per slept night — full tray (~2 L) stays moist after one sleep.
pub(crate) const BALCONY_GROW_TRAY_WATER_LOSS_PER_SLEEP_L: f32 = 0.5;
pub(crate) const BALCONY_GROW_FERTILIZER_STASH_SLOT: u16 = 0;
pub(crate) const BALCONY_GROW_HARVEST_SEED_BASE: u32 = 1;
pub(crate) const BALCONY_GROW_HARVEST_FOOD_BASE: u32 = 1;
pub(crate) const BALCONY_GROW_HARVEST_SEED_BONUS_LIGHT_THRESHOLD: u8 = 28;
pub(crate) const BALCONY_GROW_HARVEST_SEED_BONUS_FERTILIZER_THRESHOLD: u8 = 32;
pub(crate) const BALCONY_GROW_HARVEST_SEED_BONUS_WATER_OK_THRESHOLD: u8 = 22;
pub(crate) const BALCONY_GROW_HARVEST_SEED_BONUS_WATER_FULL_THRESHOLD: u8 = 18;
pub(crate) const BALCONY_GROW_HARVEST_FOOD_BONUS_LIGHT_THRESHOLD: u8 = 18;
pub(crate) const BALCONY_GROW_HARVEST_FOOD_BONUS_FERTILIZER_THRESHOLD: u8 = 20;
pub(crate) const BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_OK_THRESHOLD: u8 = 16;
pub(crate) const BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_FULL_THRESHOLD: u8 = 14;

pub(crate) const PHASE_EMPTY: u8 = 0;
pub(crate) const PHASE_GROWING: u8 = 1;
pub(crate) const PHASE_MATURE: u8 = 2;
pub(crate) const PHASE_WILTED: u8 = 3;

pub(crate) const GROW_TRAY_MODEL_SUFFIX: &str = "objects/grow-tray.glb";
pub(crate) const TRAY_INTERACT_RADIUS_M: f32 = 1.75;
pub(crate) const TRAY_INTERACT_RADIUS_SQ: f32 = TRAY_INTERACT_RADIUS_M * TRAY_INTERACT_RADIUS_M;
pub(crate) const GROW_TRAY_UNIT_HULL_SLACK_XZ: f32 = 4.0;
pub(crate) const INTERACT_FEET_Y_BELOW_SLACK_M: f32 = 0.35;
pub(crate) const INTERACT_FEET_Y_ABOVE_SLACK_M: f32 = 2.4;

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

/// Alias for day-advance helpers — same value as schema `BALCONY_GAME_DAY_SECS`.
pub(crate) const BALCONY_GAME_DAY_SECS: i64 = BALCONY_GROW_GAME_DAY_SECS;

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
    #[default(0u8)]
    pub target_days: u8,
    #[default(0u8)]
    pub days_grown: u8,
    #[default(0u8)]
    pub substrate_fed_overnight: u8,
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
    scheduled(crate::balcony_grow::balcony_grow_tick_step)
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

pub(crate) fn tray_row_key(unit_key: &str, tray_id: &str) -> String {
    format!("{unit_key}#{tray_id}")
}

pub(crate) fn plant_row_key(unit_key: &str, tray_id: &str, slot_index: u8) -> String {
    format!("{unit_key}#{tray_id}#{slot_index}")
}

pub(crate) fn journal_row_key(owner: Identity, crop_def_id: &str) -> String {
    format!("{owner}#{crop_def_id}")
}

pub(crate) fn is_known_tray_id(tray_id: &str) -> bool {
    BALCONY_GROW_TRAY_BUILTIN_IDS.contains(&tray_id)
        || tray_id
            .strip_prefix("decor:")
            .and_then(|id| id.parse::<u64>().ok())
            .is_some()
}

pub(crate) fn grow_tray_id_for_decor_id(decor_id: u64) -> String {
    format!("decor:{decor_id}")
}

pub(crate) fn tick_interval_micros() -> i64 {
    BALCONY_GROW_TICK_INTERVAL_SECS * 1_000_000
}

//! In-game day/time progression, fatigue, sleep quality, and collapse.
//! Keep constants in sync with `packages/schemas/src/gameTime.ts`.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::accounts::user;
use crate::apartments::{self, apartment_unit};
use crate::auth;
use crate::balcony_grow;
use crate::crafting::emit_hud_notice;
use crate::dropped_item;
use crate::fish_tank_filter;
use crate::player_vitals::{self, SleepRecoveryProfile, VITAL_MAX};
use crate::pose::player_pose;

// --- Constants (sync with packages/schemas/src/gameTime.ts) ---

pub(crate) const WAKE_TIME_MINUTES: u16 = 360;
pub(crate) const SOFT_FATIGUE_START_MINUTES: u16 = 1260;
/// Voluntary sleep after this is "normal" rather than "good" quality.
pub(crate) const NORMAL_SLEEP_START_MINUTES: u16 = 1380;
pub(crate) const NORMAL_COLLAPSE_PRESSURE_MINUTES: u16 = 120;
pub(crate) const HARD_COLLAPSE_TIME_MINUTES: u16 = 210;
pub(crate) const GAME_TIME_TICK_INTERVAL_SECS: f32 = 1.0;
/// 1 real sec = 30 game sec → 0.5 game minutes per tick.
pub(crate) const GAME_MINUTES_PER_TICK: f32 = 0.5;
pub(crate) const SPRINT_VITALS_DRAIN_MUL: f32 = 1.15;
pub(crate) const FATIGUE_VITALS_DRAIN_MUL_NONE: f32 = 1.0;
pub(crate) const FATIGUE_VITALS_DRAIN_MUL_SOFT: f32 = 1.15;
pub(crate) const FATIGUE_VITALS_DRAIN_MUL_SEVERE: f32 = 1.35;
pub(crate) const FATIGUE_VITALS_DRAIN_MUL_COLLAPSE: f32 = 1.5;

pub(crate) const STIMULANT_LOAD_PER_CHEW: f32 = 0.35;
pub(crate) const STIMULANT_LOAD_CAP: f32 = 1.0;
pub(crate) const STIMULANT_SLEEP_PRESSURE_RELIEF: f32 = 0.15;
pub(crate) const STIMULANT_DECAY_PER_GAME_MIN: f32 = 0.08;
pub(crate) const STIMULANT_ABUSE_CHEWS_PER_DAY: u8 = 3;

const TICK_INTERVAL_MICROS: i64 = 1_000_000;

/// Sleep quality stored in `last_sleep_quality`.
pub(crate) const SLEEP_QUALITY_GOOD: u8 = 0;
pub(crate) const SLEEP_QUALITY_NORMAL: u8 = 1;
pub(crate) const SLEEP_QUALITY_BAD: u8 = 2;
pub(crate) const SLEEP_QUALITY_COLLAPSE: u8 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FatigueTier {
    None,
    Soft,
    Severe,
    Collapse,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SleepRolloverKind {
    Voluntary,
    Collapse,
    DeathSkip,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeAdvanceResult {
    Advanced(u16),
    HardCapReached,
}

#[spacetimedb::table(public, accessor = player_world_progress)]
pub struct PlayerWorldProgress {
    #[primary_key]
    pub identity: Identity,
    /// Nights slept or skipped forward (death recovery counts).
    pub sleeps_count: u32,
    #[default(WAKE_TIME_MINUTES)]
    pub time_of_day_minutes: u16,
    #[default(0u32)]
    pub awake_minutes: u32,
    #[default(0f32)]
    pub sleep_pressure: f32,
    #[default(0u16)]
    pub last_bed_time_minutes: u16,
    #[default(0u8)]
    pub last_sleep_quality: u8,
    #[default(0f32)]
    pub stimulant_load: f32,
    #[default(0f32)]
    pub fatigue_debt: f32,
    #[default(0u8)]
    pub stimulant_chews_today: u8,
}

#[spacetimedb::table(
    public,
    accessor = game_time_schedule,
    scheduled(game_time_tick_step)
)]
pub struct GameTimeSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[inline]
pub fn is_after_midnight(minutes: u16) -> bool {
    minutes < WAKE_TIME_MINUTES
}

#[inline]
pub fn display_day_number(sleeps_count: u32) -> u32 {
    sleeps_count.saturating_add(1)
}

pub fn fatigue_tier_for(
    time_of_day_minutes: u16,
    sleep_pressure: f32,
    stimulant_load: f32,
) -> FatigueTier {
    let raw = if is_after_midnight(time_of_day_minutes) {
        if time_of_day_minutes >= NORMAL_COLLAPSE_PRESSURE_MINUTES {
            FatigueTier::Collapse
        } else {
            FatigueTier::Severe
        }
    } else if time_of_day_minutes >= SOFT_FATIGUE_START_MINUTES {
        FatigueTier::Soft
    } else {
        FatigueTier::None
    };

    if stimulant_load >= 0.2 {
        match raw {
            FatigueTier::Collapse => FatigueTier::Severe,
            FatigueTier::Severe => FatigueTier::Soft,
            FatigueTier::Soft => FatigueTier::None,
            FatigueTier::None => FatigueTier::None,
        }
    } else if sleep_pressure > 0.85 && matches!(raw, FatigueTier::None) {
        FatigueTier::Soft
    } else {
        raw
    }
}

pub fn fatigue_vitals_drain_mul(tier: FatigueTier) -> f32 {
    match tier {
        FatigueTier::None => FATIGUE_VITALS_DRAIN_MUL_NONE,
        FatigueTier::Soft => FATIGUE_VITALS_DRAIN_MUL_SOFT,
        FatigueTier::Severe => FATIGUE_VITALS_DRAIN_MUL_SEVERE,
        FatigueTier::Collapse => FATIGUE_VITALS_DRAIN_MUL_COLLAPSE,
    }
}

pub fn vitals_drain_multipliers_for_progress(row: &PlayerWorldProgress, sprinting: bool) -> (f32, f32) {
    let tier = fatigue_tier_for(
        row.time_of_day_minutes,
        row.sleep_pressure,
        row.stimulant_load,
    );
    let base = fatigue_vitals_drain_mul(tier) * (1.0 + row.fatigue_debt * 0.15);
    let sprint = if sprinting { SPRINT_VITALS_DRAIN_MUL } else { 1.0 };
    (base, sprint)
}

pub fn advance_time_minutes(current: u16, delta_minutes: f32) -> TimeAdvanceResult {
    if is_after_midnight(current) && current >= HARD_COLLAPSE_TIME_MINUTES {
        return TimeAdvanceResult::HardCapReached;
    }

    let mut next = current as f32 + delta_minutes;

    // Cross midnight from evening into after-midnight zone.
    if !is_after_midnight(current) && next >= 1440.0 {
        next -= 1440.0;
    }

    let next_u16 = next.round() as u16;

    if is_after_midnight(next_u16) && next_u16 >= HARD_COLLAPSE_TIME_MINUTES {
        return TimeAdvanceResult::HardCapReached;
    }

    TimeAdvanceResult::Advanced(next_u16)
}

fn bedtime_quality_bucket(bedtime_minutes: u16, stimulant_chews_today: u8) -> u8 {
    let abused = stimulant_chews_today >= STIMULANT_ABUSE_CHEWS_PER_DAY;
    if is_after_midnight(bedtime_minutes) {
        if bedtime_minutes >= NORMAL_COLLAPSE_PRESSURE_MINUTES || abused {
            return SLEEP_QUALITY_BAD;
        }
        return SLEEP_QUALITY_NORMAL;
    }
    if bedtime_minutes >= NORMAL_SLEEP_START_MINUTES {
        return if abused {
            SLEEP_QUALITY_BAD
        } else {
            SLEEP_QUALITY_NORMAL
        };
    }
    if abused {
        return SLEEP_QUALITY_NORMAL;
    }
    SLEEP_QUALITY_GOOD
}

pub fn compute_wake_time_minutes(quality: u8, bedtime_minutes: u16) -> u16 {
    match quality {
        SLEEP_QUALITY_GOOD => WAKE_TIME_MINUTES,
        SLEEP_QUALITY_NORMAL => WAKE_TIME_MINUTES + 60,
        SLEEP_QUALITY_BAD => {
            let late = if is_after_midnight(bedtime_minutes) {
                480 + ((bedtime_minutes.saturating_sub(60)) as u32 * 2).min(120) as u16
            } else {
                510
            };
            late.min(600)
        }
        _ => 540, // collapse ~09:00
    }
}

fn sleep_recovery_profile(quality: u8) -> SleepRecoveryProfile {
    match quality {
        SLEEP_QUALITY_GOOD => SleepRecoveryProfile {
            health: VITAL_MAX,
            hunger: VITAL_MAX * 0.96,
            hydration: VITAL_MAX * 0.94,
            health_bonus_if_comfortable: 8.0,
            fatigue_debt_add: 0.0,
        },
        SLEEP_QUALITY_NORMAL => SleepRecoveryProfile {
            health: VITAL_MAX * 0.92,
            hunger: VITAL_MAX * 0.82,
            hydration: VITAL_MAX * 0.78,
            health_bonus_if_comfortable: 4.0,
            fatigue_debt_add: 0.05,
        },
        SLEEP_QUALITY_BAD => SleepRecoveryProfile {
            health: VITAL_MAX * 0.78,
            hunger: VITAL_MAX * 0.62,
            hydration: VITAL_MAX * 0.58,
            health_bonus_if_comfortable: 0.0,
            fatigue_debt_add: 0.2,
        },
        _ => SleepRecoveryProfile {
            health: VITAL_MAX * 0.65,
            hunger: VITAL_MAX * 0.48,
            hydration: VITAL_MAX * 0.45,
            health_bonus_if_comfortable: 0.0,
            fatigue_debt_add: 0.35,
        },
    }
}

fn morning_notice(quality: u8, day: u32, wake_minutes: u16) -> String {
    let hh = wake_minutes / 60;
    let mm = wake_minutes % 60;
    let time = format!("{hh:02}:{mm:02}");
    match quality {
        SLEEP_QUALITY_GOOD => format!("Day {day}. You wake at {time} — rested."),
        SLEEP_QUALITY_NORMAL => format!("Day {day}. {time}. You slept, but the block kept humming."),
        SLEEP_QUALITY_BAD => format!("Day {day}. {time}. You overslept, head heavy."),
        _ => format!("Day {day}. {time}. You collapsed — scraped off the floor at home."),
    }
}

pub(crate) fn ensure_player_world_progress(ctx: &ReducerContext, owner: Identity) {
    if ctx
        .db
        .player_world_progress()
        .identity()
        .find(&owner)
        .is_some()
    {
        return;
    }
    let _ = ctx.db.player_world_progress().insert(PlayerWorldProgress {
        identity: owner,
        sleeps_count: 0,
        time_of_day_minutes: WAKE_TIME_MINUTES,
        awake_minutes: 0,
        sleep_pressure: 0.0,
        last_bed_time_minutes: 0,
        last_sleep_quality: 0,
        stimulant_load: 0.0,
        fatigue_debt: 0.0,
        stimulant_chews_today: 0,
    });
}

pub(crate) fn sleeps_count_for(ctx: &ReducerContext, owner: Identity) -> u32 {
    ctx.db
        .player_world_progress()
        .identity()
        .find(&owner)
        .map(|r| r.sleeps_count)
        .unwrap_or(0)
}

fn run_overnight_simulation_hooks(ctx: &ReducerContext, owner: Identity, unit_key: &str, day_number: u32) {
    crate::apartment_utilities::begin_new_day_utilities_for_unit(ctx, owner, unit_key, day_number);
    balcony_grow::advance_world_day_for_unit(ctx, unit_key, 1);
    fish_tank_filter::advance_fish_tank_filters_for_unit(ctx, unit_key);
    // TODO: in-fridge spoilage overnight tick (key off apartment_unit_utilities.power_on)
    // TODO: NPC schedule day advance
    // TODO: apartment building decay overnight
}

pub(crate) fn complete_day_rollover(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: Option<&str>,
    bedtime_minutes: u16,
    kind: SleepRolloverKind,
) -> Result<u32, String> {
    ensure_player_world_progress(ctx, owner);
    let Some(mut row) = ctx.db.player_world_progress().identity().find(&owner) else {
        return Err("missing world progress row".to_string());
    };

    let quality = match kind {
        SleepRolloverKind::Collapse => SLEEP_QUALITY_COLLAPSE,
        SleepRolloverKind::DeathSkip => SLEEP_QUALITY_BAD,
        SleepRolloverKind::Voluntary => {
            bedtime_quality_bucket(bedtime_minutes, row.stimulant_chews_today)
        }
    };

    row.last_bed_time_minutes = bedtime_minutes;
    row.last_sleep_quality = quality;
    row.sleeps_count = row.sleeps_count.saturating_add(1);
    let nights = row.sleeps_count;
    let day = display_day_number(nights);

    let wake = compute_wake_time_minutes(quality, bedtime_minutes);
    row.time_of_day_minutes = wake;
    row.awake_minutes = 0;
    row.sleep_pressure = row.fatigue_debt * 0.5;
    row.stimulant_load = 0.0;
    row.stimulant_chews_today = 0;

    let profile = sleep_recovery_profile(quality);
    row.fatigue_debt = (row.fatigue_debt + profile.fatigue_debt_add).min(1.0);

    ctx.db.player_world_progress().identity().update(row);

    player_vitals::restore_player_vitals_after_sleep(ctx, owner, profile);

    if let Some(uk) = unit_key {
        run_overnight_simulation_hooks(ctx, owner, uk, day);
    }

    emit_hud_notice(ctx, owner, morning_notice(quality, day, wake));
    Ok(nights)
}

/// Legacy entry — prefer [`complete_day_rollover`].
pub(crate) fn advance_world_day_for_player(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: Option<&str>,
) -> Result<u32, String> {
    let bedtime = ctx
        .db
        .player_world_progress()
        .identity()
        .find(&owner)
        .map(|r| r.time_of_day_minutes)
        .unwrap_or(WAKE_TIME_MINUTES);
    complete_day_rollover(
        ctx,
        owner,
        unit_key,
        bedtime,
        SleepRolloverKind::DeathSkip,
    )
}

fn player_near_unit_bed(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
) -> Result<(), String> {
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
        .ok_or_else(|| "unknown apartment".to_string())?;
    if unit.owner != Some(owner) || unit.state != apartments::UNIT_STATE_CLAIMED {
        return Err("need your claimed apartment".to_string());
    }
    let pose = ctx
        .db
        .player_pose()
        .identity()
        .find(&owner)
        .ok_or_else(|| "missing player pose".to_string())?;
    if !apartments::player_pose_near_unit_bed(ctx, &unit, pose.x, pose.y, pose.z) {
        return Err("Move closer to your bed.".to_string());
    }
    Ok(())
}

pub(crate) fn force_collapse_sleep(ctx: &ReducerContext, owner: Identity) {
    if player_vitals::is_player_dead(ctx, owner) {
        return;
    }

    crate::player_mission::evaluate_mission_before_day_rollover(
        ctx,
        owner,
        SleepRolloverKind::Collapse,
    );

    let unit_key = apartments::claimed_unit_key_for_owner(ctx, owner);
    let bedtime = ctx
        .db
        .player_world_progress()
        .identity()
        .find(&owner)
        .map(|r| r.time_of_day_minutes)
        .unwrap_or(HARD_COLLAPSE_TIME_MINUTES);

    let at_bed = unit_key.as_ref().is_some_and(|uk| {
        player_near_unit_bed(ctx, owner, uk).is_ok()
    });
    let inside_home = apartments::player_feet_inside_owned_apartment(ctx, owner);

    if !at_bed {
        if !inside_home {
            dropped_item::scatter_carrier_inventory_at_death(ctx, owner);
        }
        if let Some(uk) = unit_key.as_ref() {
            if let Some(bed) = apartments::spawn_pose_owned_bed(ctx, owner) {
                ctx.db.player_pose().identity().update(bed);
                let _ = complete_day_rollover(
                    ctx,
                    owner,
                    Some(uk.as_str()),
                    bedtime,
                    SleepRolloverKind::Collapse,
                );
                let notice = if inside_home {
                    "You passed out in your apartment. You wake at your bed with everything still on you."
                } else {
                    "You blacked out away from home. What you were carrying is scattered nearby."
                };
                emit_hud_notice(ctx, owner, notice.to_string());
                return;
            }
        }
        if inside_home {
            let _ = complete_day_rollover(
                ctx,
                owner,
                unit_key.as_deref(),
                bedtime,
                SleepRolloverKind::Collapse,
            );
            emit_hud_notice(
                ctx,
                owner,
                "You passed out in your apartment. You wake where you fell with everything still on you."
                    .to_string(),
            );
            return;
        }
    }

    let _ = complete_day_rollover(
        ctx,
        owner,
        unit_key.as_deref(),
        bedtime,
        SleepRolloverKind::Collapse,
    );
}

#[spacetimedb::reducer]
pub fn sleep_in_bed(ctx: &ReducerContext, unit_key: String) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("sleep_in_bed blocked: {e}");
        return;
    }
    if let Err(e) = sleep_in_bed_impl(ctx, unit_key.as_str()) {
        log::debug!("sleep_in_bed: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

fn sleep_in_bed_impl(ctx: &ReducerContext, unit_key: &str) -> Result<(), String> {
    let sender = ctx.sender();
    if player_vitals::is_player_dead(ctx, sender) {
        return Err("You cannot sleep while unconscious.".to_string());
    }
    let claimed = apartments::claimed_unit_key_for_owner(ctx, sender)
        .ok_or_else(|| "need a claimed apartment".to_string())?;
    if claimed != unit_key {
        return Err("That is not your apartment.".to_string());
    }
    player_near_unit_bed(ctx, sender, unit_key)?;

    crate::player_mission::evaluate_mission_before_day_rollover(
        ctx,
        sender,
        SleepRolloverKind::Voluntary,
    );

    let bedtime = ctx
        .db
        .player_world_progress()
        .identity()
        .find(&sender)
        .map(|r| r.time_of_day_minutes)
        .unwrap_or(WAKE_TIME_MINUTES);

    complete_day_rollover(
        ctx,
        sender,
        Some(unit_key),
        bedtime,
        SleepRolloverKind::Voluntary,
    )?;
    Ok(())
}

pub fn apply_stimulant_consume(ctx: &ReducerContext, owner: Identity, def_id: &str) {
    if def_id != "caffeine-gum" {
        return;
    }
    ensure_player_world_progress(ctx, owner);
    let Some(mut row) = ctx.db.player_world_progress().identity().find(&owner) else {
        return;
    };
    row.stimulant_load = (row.stimulant_load + STIMULANT_LOAD_PER_CHEW).min(STIMULANT_LOAD_CAP);
    row.sleep_pressure = (row.sleep_pressure - STIMULANT_SLEEP_PRESSURE_RELIEF).max(0.0);
    row.stimulant_chews_today = row.stimulant_chews_today.saturating_add(1);
    ctx.db.player_world_progress().identity().update(row);
}

pub fn start_game_time_schedule(ctx: &ReducerContext) {
    if ctx.db.game_time_schedule().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(TICK_INTERVAL_MICROS);
    let _ = ctx.db.game_time_schedule().insert(GameTimeSchedule {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

fn tick_sleep_pressure(row: &mut PlayerWorldProgress, game_minutes: f32) {
    let tier = fatigue_tier_for(
        row.time_of_day_minutes,
        row.sleep_pressure,
        row.stimulant_load,
    );
    let rate = match tier {
        FatigueTier::None => 0.002,
        FatigueTier::Soft => 0.006,
        FatigueTier::Severe => 0.012,
        FatigueTier::Collapse => 0.02,
    };
    row.sleep_pressure = (row.sleep_pressure + rate * game_minutes).min(2.0);
    if row.stimulant_load > 0.0 {
        row.stimulant_load =
            (row.stimulant_load - STIMULANT_DECAY_PER_GAME_MIN * game_minutes).max(0.0);
    }
}

#[spacetimedb::reducer]
pub fn game_time_tick_step(ctx: &ReducerContext, _arg: GameTimeSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }

    let rows: Vec<PlayerWorldProgress> = ctx.db.player_world_progress().iter().collect();
    for mut row in rows {
        let Some(u) = ctx.db.user().identity().find(&row.identity) else {
            continue;
        };
        if !auth::has_completed_registration(&u) {
            continue;
        }
        if player_vitals::is_player_dead(ctx, row.identity) {
            continue;
        }

        if is_after_midnight(row.time_of_day_minutes)
            && row.time_of_day_minutes >= HARD_COLLAPSE_TIME_MINUTES
        {
            force_collapse_sleep(ctx, row.identity);
            continue;
        }

        match advance_time_minutes(row.time_of_day_minutes, GAME_MINUTES_PER_TICK) {
            TimeAdvanceResult::HardCapReached => {
                let owner = row.identity;
                row.time_of_day_minutes = HARD_COLLAPSE_TIME_MINUTES;
                ctx.db.player_world_progress().identity().update(row);
                force_collapse_sleep(ctx, owner);
            }
            TimeAdvanceResult::Advanced(next) => {
                let owner = row.identity;
                row.time_of_day_minutes = next;
                row.awake_minutes = row
                    .awake_minutes
                    .saturating_add(GAME_MINUTES_PER_TICK.round() as u32);
                tick_sleep_pressure(&mut row, GAME_MINUTES_PER_TICK);
                ctx.db.player_world_progress().identity().update(row);
                if let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, owner) {
                    crate::apartment_utilities::tick_same_day_utilities_for_owner(
                        ctx,
                        owner,
                        unit_key.as_str(),
                        next,
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn after_midnight_detection() {
        assert!(is_after_midnight(0));
        assert!(is_after_midnight(210));
        assert!(!is_after_midnight(360));
    }

    #[test]
    fn hard_cap_blocks_advance_past_0330() {
        assert!(matches!(
            advance_time_minutes(210, 1.0),
            TimeAdvanceResult::HardCapReached
        ));
        assert!(matches!(
            advance_time_minutes(209, 2.0),
            TimeAdvanceResult::HardCapReached
        ));
    }

    #[test]
    fn evening_advances_without_wrap_until_midnight() {
        match advance_time_minutes(1260, 30.0) {
            TimeAdvanceResult::Advanced(m) => assert_eq!(m, 1290),
            _ => panic!("expected advance"),
        }
    }

    #[test]
    fn sleep_quality_buckets() {
        assert_eq!(bedtime_quality_bucket(1200, 0), SLEEP_QUALITY_GOOD);
        assert_eq!(bedtime_quality_bucket(1300, 0), SLEEP_QUALITY_GOOD);
        assert_eq!(bedtime_quality_bucket(1400, 0), SLEEP_QUALITY_NORMAL);
        assert_eq!(bedtime_quality_bucket(60, 0), SLEEP_QUALITY_NORMAL);
        assert_eq!(bedtime_quality_bucket(130, 0), SLEEP_QUALITY_BAD);
        assert_eq!(bedtime_quality_bucket(1200, 3), SLEEP_QUALITY_NORMAL);
    }

    #[test]
    fn wake_times_vary_by_quality() {
        assert_eq!(compute_wake_time_minutes(SLEEP_QUALITY_GOOD, 1200), 360);
        assert_eq!(compute_wake_time_minutes(SLEEP_QUALITY_NORMAL, 1300), 420);
        assert!(compute_wake_time_minutes(SLEEP_QUALITY_BAD, 130) >= 480);
    }

    #[test]
    fn fatigue_tier_progression() {
        assert_eq!(
            fatigue_tier_for(800, 0.0, 0.0),
            FatigueTier::None
        );
        assert_eq!(
            fatigue_tier_for(1300, 0.0, 0.0),
            FatigueTier::Soft
        );
        assert_eq!(
            fatigue_tier_for(30, 0.0, 0.0),
            FatigueTier::Severe
        );
        assert_eq!(
            fatigue_tier_for(130, 0.0, 0.0),
            FatigueTier::Collapse
        );
    }
}

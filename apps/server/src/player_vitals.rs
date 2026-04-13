//! Authoritative survival vitals (health, hunger, hydration) with a low-rate server tick.
//! Design goals: gradual drain (minutes-scale), optional sprint load, minimal DB churn.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::accounts::user;
use crate::auth;
use crate::movement::{player_input, PlayerInput, BIT_SPRINT};

/// All vitals use 0..=MAX; keeps HUD math simple and matches a “percent bar” mental model.
pub(crate) const VITAL_MAX: f32 = 100.0;
/// ~40 minutes from full to empty at 1× drain.
const HUNGER_FULL_DRAIN_SECS: f32 = 40.0 * 60.0;
/// Hydration falls faster than hunger (~28 minutes full → empty at 1×).
const HYDRATION_FULL_DRAIN_SECS: f32 = 28.0 * 60.0;
/// Sprinting increases hunger + hydration drain (not health).
const SPRINT_DRAIN_MULTIPLIER: f32 = 1.35;
/// Passive regen when both needs are above this fraction of max (server-side “comfortable”).
const NEED_COMFORT_FRAC: f32 = 0.52;
const HEALTH_REGEN_PER_SEC: f32 = 0.12;
const HEALTH_LOSS_PER_SEC_STARVING: f32 = 0.38;
const HEALTH_LOSS_PER_SEC_DEHYDRATED: f32 = 0.48;
/// Process vitals on this wall-clock interval (µs). 2s is plenty for slow bars + cuts reducer load.
const TICK_INTERVAL_MICROS: i64 = 2_000_000;

#[spacetimedb::table(public, accessor = player_vitals)]
pub struct PlayerVitals {
    #[primary_key]
    pub identity: Identity,
    pub health: f32,
    pub hunger: f32,
    pub hydration: f32,
}

#[spacetimedb::table(
    public,
    accessor = player_vitals_schedule,
    scheduled(player_vitals_tick_step)
)]
pub struct PlayerVitalsSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[inline]
fn clamp_vital(x: f32) -> f32 {
    x.clamp(0.0, VITAL_MAX)
}

/// Pure tick body — unit-tested; `dt_secs` is the scheduler interval in seconds.
pub(crate) fn step_vitals_once(
    health: f32,
    hunger: f32,
    hydration: f32,
    dt_secs: f32,
    sprinting: bool,
) -> (f32, f32, f32) {
    let mut h = clamp_vital(health);
    let mut hu = clamp_vital(hunger);
    let mut hy = clamp_vital(hydration);

    let drain_mul = if sprinting {
        SPRINT_DRAIN_MULTIPLIER
    } else {
        1.0
    };

    let hunger_rate = (VITAL_MAX / HUNGER_FULL_DRAIN_SECS) * drain_mul;
    let hydration_rate = (VITAL_MAX / HYDRATION_FULL_DRAIN_SECS) * drain_mul;
    hu = clamp_vital(hu - hunger_rate * dt_secs);
    hy = clamp_vital(hy - hydration_rate * dt_secs);

    let comfort = VITAL_MAX * NEED_COMFORT_FRAC;
    if hu >= comfort && hy >= comfort && h < VITAL_MAX {
        h = clamp_vital(h + HEALTH_REGEN_PER_SEC * dt_secs);
    }

    if hu <= 0.0 {
        h = clamp_vital(h - HEALTH_LOSS_PER_SEC_STARVING * dt_secs);
    }
    if hy <= 0.0 {
        h = clamp_vital(h - HEALTH_LOSS_PER_SEC_DEHYDRATED * dt_secs);
    }

    (h, hu, hy)
}

/// Immediate vitals change (consumables, medkits later, etc.).
pub fn apply_instant_vital_deltas(
    ctx: &ReducerContext,
    owner: Identity,
    d_health: f32,
    d_hunger: f32,
    d_hydration: f32,
) {
    let Some(mut v) = ctx.db.player_vitals().identity().find(&owner) else {
        log::warn!("apply_instant_vital_deltas: no player_vitals row for {owner}");
        return;
    };
    v.health = clamp_vital(v.health + d_health);
    v.hunger = clamp_vital(v.hunger + d_hunger);
    v.hydration = clamp_vital(v.hydration + d_hydration);
    ctx.db.player_vitals().identity().update(v);
}

pub fn ensure_player_vitals_row(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_vitals().identity().find(&id).is_some() {
        return;
    }
    let start_hunger = VITAL_MAX * 0.82;
    let start_hydration = VITAL_MAX * 0.78;
    let _ = ctx.db.player_vitals().insert(PlayerVitals {
        identity: id,
        health: VITAL_MAX,
        hunger: start_hunger,
        hydration: start_hydration,
    });
}

pub fn start_player_vitals_schedule(ctx: &ReducerContext) {
    if ctx.db.player_vitals_schedule().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(TICK_INTERVAL_MICROS);
    let _ = ctx.db.player_vitals_schedule().insert(PlayerVitalsSchedule {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

#[spacetimedb::reducer]
pub fn player_vitals_tick_step(ctx: &ReducerContext, _arg: PlayerVitalsSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }

    let dt_secs = TICK_INTERVAL_MICROS as f32 / 1_000_000.0;

    let vitals: Vec<PlayerVitals> = ctx.db.player_vitals().iter().collect();
    for mut row in vitals {
        let Some(u) = ctx.db.user().identity().find(&row.identity) else {
            continue;
        };
        if !auth::has_completed_registration(&u) {
            continue;
        }

        let sprinting = ctx
            .db
            .player_input()
            .identity()
            .find(&row.identity)
            .map(|i: PlayerInput| (i.bits & BIT_SPRINT) != 0)
            .unwrap_or(false);

        let (nh, nhu, nhy) = step_vitals_once(row.health, row.hunger, row.hydration, dt_secs, sprinting);

        // Skip writes when nothing meaningful changed (reduces replication noise).
        const EPS: f32 = 0.004;
        if (nh - row.health).abs() < EPS
            && (nhu - row.hunger).abs() < EPS
            && (nhy - row.hydration).abs() < EPS
        {
            continue;
        }

        row.health = nh;
        row.hunger = nhu;
        row.hydration = nhy;
        ctx.db.player_vitals().identity().update(row);
    }
}

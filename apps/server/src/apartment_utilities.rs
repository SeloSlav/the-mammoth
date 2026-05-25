//! Apartment utility simulation — rare power outages and unreliable water-tank refills.
//! Keep constants in sync with `packages/schemas/src/apartmentUtilities.ts`.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::balcony_grow;
use crate::crafting::emit_hud_notice;
use crate::water_container::{self, apartment_water_tank};

pub(crate) const POWER_OUTAGE_CHANCE_BP: u32 = 500;
pub(crate) const POWER_SAME_DAY_RESTORE_CHANCE_BP: u32 = 2800;
pub(crate) const WATER_PARTIAL_REFILL_CHANCE_BP: u32 = 700;
pub(crate) const WATER_TANK_BREAK_CHANCE_BP: u32 = 450;
pub(crate) const WATER_SAME_DAY_REPAIR_CHANCE_BP: u32 = 3200;

pub(crate) const WATER_PARTIAL_REFILL_MIN_L: f32 = 5.0;
pub(crate) const WATER_PARTIAL_REFILL_MAX_L: f32 = 14.0;
pub(crate) const WATER_BROKEN_REFILL_MAX_L: f32 = 8.0;

pub(crate) const POWER_RESTORE_EARLIEST_MINUTES: u16 = 480;
pub(crate) const POWER_RESTORE_LATEST_MINUTES: u16 = 1200;
pub(crate) const WATER_REPAIR_EARLIEST_MINUTES: u16 = 420;
pub(crate) const WATER_REPAIR_LATEST_MINUTES: u16 = 1140;

#[spacetimedb::table(public, accessor = apartment_unit_utilities)]
pub struct ApartmentUnitUtilities {
    #[primary_key]
    pub unit_key: String,
    /// 1 = mains on, 0 = outage (grow lights + interior fixtures off).
    pub power_on: u8,
    /// Game minutes when power may return today; 0 = no scheduled restore.
    pub power_restore_after_minutes: u16,
    /// 1 = tank can refill on sleep, 0 = broken / needs repair.
    pub water_tank_ok: u8,
    /// Game minutes when tank may auto-repair today; 0 = none scheduled.
    pub water_restore_after_minutes: u16,
}

fn hash_mix(seed: u64, salt: u32) -> u64 {
    seed.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(salt as u64)
}

fn unit_day_seed(unit_key: &str, day_number: u32) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_325;
    h = h.wrapping_add(day_number as u64);
    for b in unit_key.as_bytes() {
        h = h.wrapping_mul(0x1000_0000_01b3).wrapping_add(*b as u64);
    }
    h
}

fn roll_bp(seed: u64) -> u32 {
    (seed % 10_000) as u32
}

fn roll_range_u16(seed: u64, lo: u16, hi: u16) -> u16 {
    if hi <= lo {
        return lo;
    }
    let span = (hi - lo) as u64 + 1;
    lo + (seed % span) as u16
}

fn roll_range_f32(seed: u64, lo: f32, hi: f32) -> f32 {
    if hi <= lo {
        return lo;
    }
    let span = hi - lo;
    lo + (seed % 10_000) as f32 / 10_000.0 * span
}

pub(crate) fn ensure_apartment_unit_utilities(ctx: &ReducerContext, unit_key: &str) {
    if ctx
        .db
        .apartment_unit_utilities()
        .unit_key()
        .find(&unit_key.to_string())
        .is_some()
    {
        return;
    }
    let _ = ctx
        .db
        .apartment_unit_utilities()
        .insert(ApartmentUnitUtilities {
            unit_key: unit_key.to_string(),
            power_on: 1,
            power_restore_after_minutes: 0,
            water_tank_ok: 1,
            water_restore_after_minutes: 0,
        });
}

fn apply_water_liters(ctx: &ReducerContext, unit_key: &str, liters: f32) {
    water_container::ensure_apartment_water_tank_row(ctx, unit_key);
    let cap = water_container::APARTMENT_WATER_TANK_CAPACITY_L;
    let table = ctx.db.apartment_water_tank();
    let Some(mut tank) = table.unit_key().find(&unit_key.to_string()) else {
        return;
    };
    tank.water_liters = liters.clamp(0.0, cap);
    table.unit_key().update(tank);
}

/// Overnight hook — roll today's utility state and apply wake water refill.
pub(crate) fn begin_new_day_utilities_for_unit(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
    day_number: u32,
) {
    ensure_apartment_unit_utilities(ctx, unit_key);
    water_container::ensure_apartment_water_tank_row(ctx, unit_key);

    let seed = unit_day_seed(unit_key, day_number);
    let util_table = ctx.db.apartment_unit_utilities();
    let Some(mut util) = util_table.unit_key().find(&unit_key.to_string()) else {
        return;
    };

    // Fresh day — building mains usually back; today's rolls may cut them again.
    util.power_on = 1;
    util.power_restore_after_minutes = 0;
    util.water_tank_ok = 1;
    util.water_restore_after_minutes = 0;
    balcony_grow::set_grow_lights_for_unit(ctx, unit_key, true);

    let power_roll = roll_bp(hash_mix(seed, 1));
    if power_roll < POWER_OUTAGE_CHANCE_BP {
        util.power_on = 0;
        util.power_restore_after_minutes = 0;
        balcony_grow::set_grow_lights_for_unit(ctx, unit_key, false);

        let restore_roll = roll_bp(hash_mix(seed, 2));
        if restore_roll < POWER_SAME_DAY_RESTORE_CHANCE_BP {
            util.power_restore_after_minutes = roll_range_u16(
                hash_mix(seed, 3),
                POWER_RESTORE_EARLIEST_MINUTES,
                POWER_RESTORE_LATEST_MINUTES,
            );
        }
        emit_hud_notice(
            ctx,
            owner,
            if util.power_restore_after_minutes > 0 {
                "The block lost power overnight. Grow lights are out — planting won't advance if you sleep like this. Maintenance may restore it later today.".to_string()
            } else {
                "The block lost power overnight. Grow lights are out — planting won't advance if you sleep like this.".to_string()
            },
        );
    }

    let break_roll = roll_bp(hash_mix(seed, 4));
    if break_roll < WATER_TANK_BREAK_CHANCE_BP {
        util.water_tank_ok = 0;
        let refill = roll_range_f32(
            hash_mix(seed, 5),
            2.0,
            WATER_BROKEN_REFILL_MAX_L,
        );
        apply_water_liters(ctx, unit_key, refill);

        let repair_roll = roll_bp(hash_mix(seed, 6));
        if repair_roll < WATER_SAME_DAY_REPAIR_CHANCE_BP {
            util.water_restore_after_minutes = roll_range_u16(
                hash_mix(seed, 7),
                WATER_REPAIR_EARLIEST_MINUTES,
                WATER_REPAIR_LATEST_MINUTES,
            );
        }
        emit_hud_notice(
            ctx,
            owner,
            if util.water_restore_after_minutes > 0 {
                "The water tank didn't refill properly — something's wrong with the header. A repair might land later today.".to_string()
            } else {
                "The water tank didn't refill properly — something's wrong with the header.".to_string()
            },
        );
    } else {
        let partial_roll = roll_bp(hash_mix(seed, 8));
        if partial_roll < WATER_PARTIAL_REFILL_CHANCE_BP {
            let refill = roll_range_f32(
                hash_mix(seed, 9),
                WATER_PARTIAL_REFILL_MIN_L,
                WATER_PARTIAL_REFILL_MAX_L,
            );
            apply_water_liters(ctx, unit_key, refill);
            emit_hud_notice(
                ctx,
                owner,
                "Low water pressure this morning — the tank only partially refilled.".to_string(),
            );
        } else {
            apply_water_liters(
                ctx,
                unit_key,
                water_container::APARTMENT_WATER_TANK_CAPACITY_L,
            );
        }
    }

    util_table.unit_key().update(util);
}

/// Same-day restore/repair pulse — call after game time advances for an awake player.
pub(crate) fn tick_same_day_utilities_for_owner(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
    time_of_day_minutes: u16,
) {
    ensure_apartment_unit_utilities(ctx, unit_key);
    let table = ctx.db.apartment_unit_utilities();
    let Some(mut row) = table.unit_key().find(&unit_key.to_string()) else {
        return;
    };
    let mut changed = false;

    if row.power_on == 0
        && row.power_restore_after_minutes > 0
        && time_of_day_minutes >= row.power_restore_after_minutes
    {
        row.power_on = 1;
        row.power_restore_after_minutes = 0;
        balcony_grow::set_grow_lights_for_unit(ctx, unit_key, true);
        emit_hud_notice(ctx, owner, "Power's back on — grow lights should work again.".to_string());
        changed = true;
    }

    if row.water_tank_ok == 0
        && row.water_restore_after_minutes > 0
        && time_of_day_minutes >= row.water_restore_after_minutes
    {
        row.water_tank_ok = 1;
        row.water_restore_after_minutes = 0;
        apply_water_liters(
            ctx,
            unit_key,
            water_container::APARTMENT_WATER_TANK_CAPACITY_L,
        );
        emit_hud_notice(
            ctx,
            owner,
            "Maintenance fixed the water tank — it's full again.".to_string(),
        );
        changed = true;
    }

    if changed {
        table.unit_key().update(row);
    }
}

pub(crate) fn water_tank_ok_for_unit(ctx: &ReducerContext, unit_key: &str) -> bool {
    ensure_apartment_unit_utilities(ctx, unit_key);
    ctx.db
        .apartment_unit_utilities()
        .unit_key()
        .find(&unit_key.to_string())
        .map(|r| r.water_tank_ok != 0)
        .unwrap_or(true)
}

pub(crate) fn power_on_for_unit(ctx: &ReducerContext, unit_key: &str) -> bool {
    ensure_apartment_unit_utilities(ctx, unit_key);
    ctx.db
        .apartment_unit_utilities()
        .unit_key()
        .find(&unit_key.to_string())
        .map(|r| r.power_on != 0)
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::{roll_bp, roll_range_u16, unit_day_seed, POWER_OUTAGE_CHANCE_BP};

    #[test]
    fn unit_day_seed_is_stable() {
        assert_eq!(unit_day_seed("unit-a", 3), unit_day_seed("unit-a", 3));
        assert_ne!(unit_day_seed("unit-a", 3), unit_day_seed("unit-b", 3));
    }

    #[test]
    fn roll_bp_in_range() {
        for day in 0..50 {
            let v = roll_bp(unit_day_seed("test", day));
            assert!(v < 10_000);
        }
    }

    #[test]
    fn restore_minutes_in_window() {
        let m = roll_range_u16(unit_day_seed("x", 1), 480, 1200);
        assert!((480..=1200).contains(&m));
    }

    #[test]
    fn outage_rate_sane_over_many_days() {
        let mut outages = 0u32;
        for day in 1..=500 {
            if roll_bp(unit_day_seed("tower-7f", day)) < POWER_OUTAGE_CHANCE_BP {
                outages += 1;
            }
        }
        assert!(outages > 5 && outages < 80);
    }
}

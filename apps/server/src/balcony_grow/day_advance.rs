use spacetimedb::{ReducerContext, Table};

use crate::apartments::apartment_unit;

use super::tables::*;
use super::tray::{
    fertilizer_present, grow_speed_modifier, lights_on_for_unit, tray_row,
    try_consume_tray_substrate,
};

pub(crate) fn tray_water_after_sleep_nights(water_liters: f32, nights: u8) -> f32 {
    if nights == 0 {
        return water_liters.max(0.0);
    }
    (water_liters - BALCONY_GROW_TRAY_WATER_LOSS_PER_SLEEP_L * nights as f32).max(0.0)
}

pub(crate) fn tray_dry_nights_after_sleep(
    water_liters: f32,
    prev_dry_nights: u8,
    nights: u8,
) -> u8 {
    if nights == 0 {
        return prev_dry_nights;
    }
    let after = tray_water_after_sleep_nights(water_liters, nights);
    if after > 0.001 {
        0
    } else {
        prev_dry_nights.saturating_add(nights)
    }
}

/// Shrink remaining grow nights after overnight substrate feed (modifier was without fert at plant).
pub(crate) fn target_days_after_fertilizer(
    days_grown: u8,
    target_days: u8,
    without_fert_modifier: f32,
    with_fert_modifier: f32,
) -> u8 {
    if target_days == 0 || days_grown >= target_days {
        return target_days;
    }
    let remaining = target_days - days_grown;
    let new_remaining = ((remaining as f32 * without_fert_modifier / with_fert_modifier.max(0.01))
        .ceil() as u8)
        .max(1);
    days_grown.saturating_add(new_remaining)
}

/// Apply overnight substrate feed to in-memory plant rows (DB-agnostic).
/// Consumption is once per tray per crop cycle (first sleep while plants are still unfed),
/// not once per night for the life of the tray.
pub(crate) fn apply_substrate_to_plants(
    plants: &mut [BalconyGrowPlant],
    without_fert_modifier: f32,
    with_fert_modifier: f32,
) {
    for plant in plants.iter_mut() {
        if plant.phase != PHASE_GROWING || plant.substrate_fed_overnight != 0 {
            continue;
        }
        plant.target_days = target_days_after_fertilizer(
            plant.days_grown,
            plant.target_days,
            without_fert_modifier,
            with_fert_modifier,
        );
        plant.substrate_fed_overnight = 1;
        if plant.days_grown >= plant.target_days {
            plant.phase = PHASE_MATURE;
        }
    }
}

fn apply_tray_substrate_on_sleep(ctx: &ReducerContext, unit_key: &str) {
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string());
    let Some(owner) = unit.and_then(|u| u.owner) else {
        return;
    };

    let plant_table = ctx.db.balcony_grow_plant();
    let mut by_tray: std::collections::HashMap<String, Vec<BalconyGrowPlant>> =
        std::collections::HashMap::new();
    for plant in plant_table.iter().filter(|p| {
        p.unit_key == unit_key && p.phase == PHASE_GROWING && p.substrate_fed_overnight == 0
    }) {
        by_tray
            .entry(plant.tray_id.clone())
            .or_default()
            .push(plant);
    }

    let lights_on = lights_on_for_unit(ctx, unit_key);
    for (tray_id, mut plants) in by_tray {
        if !fertilizer_present(ctx, unit_key, tray_id.as_str()) {
            continue;
        }
        if !try_consume_tray_substrate(ctx, owner, unit_key, tray_id.as_str()) {
            continue;
        }
        let water = tray_row(ctx, unit_key, tray_id.as_str())
            .map(|t| t.water_liters)
            .unwrap_or(0.0);
        let without_fert = grow_speed_modifier(lights_on, false, water);
        let with_fert = grow_speed_modifier(lights_on, true, water);
        apply_substrate_to_plants(&mut plants, without_fert, with_fert);
        for plant in plants {
            plant_table.row_key().update(plant);
        }
    }
}

pub(super) fn maybe_backfill_plant_day_fields(plant: &mut BalconyGrowPlant, now_micros: i64) {
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

pub(super) fn plant_is_mature(plant: &BalconyGrowPlant) -> bool {
    if plant.phase == PHASE_MATURE {
        return true;
    }
    plant.target_days > 0 && plant.days_grown >= plant.target_days
}

pub(super) fn apply_grow_day_credit(plant: &mut BalconyGrowPlant, days: u8) {
    if plant.phase != PHASE_GROWING || days == 0 || plant.target_days == 0 {
        return;
    }
    plant.days_grown = plant.days_grown.saturating_add(days).min(plant.target_days);
    if plant.days_grown >= plant.target_days {
        plant.phase = PHASE_MATURE;
    }
}

/// Sleep / death day hook — advance balcony plants and dry overnight moisture.
pub(crate) fn advance_world_day_for_unit(ctx: &ReducerContext, unit_key: &str, days: u8) {
    if days == 0 {
        return;
    }
    apply_tray_substrate_on_sleep(ctx, unit_key);
    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let plant_table = ctx.db.balcony_grow_plant();
    let plants: Vec<BalconyGrowPlant> = plant_table
        .iter()
        .filter(|p| p.unit_key == unit_key && p.phase == PHASE_GROWING)
        .collect();
    let lights_on = lights_on_for_unit(ctx, unit_key);
    for mut plant in plants {
        maybe_backfill_plant_day_fields(&mut plant, now);
        if lights_on {
            apply_grow_day_credit(&mut plant, days);
        }
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
        tray.dry_ticks = tray_dry_nights_after_sleep(tray.water_liters, tray.dry_ticks, days);
        tray.water_liters = tray_water_after_sleep_nights(tray.water_liters, days);
        tray_table.row_key().update(tray);
    }

    if !lights_on {
        let wilted: Vec<BalconyGrowPlant> = plant_table
            .iter()
            .filter(|p| p.unit_key == unit_key && p.phase == PHASE_GROWING)
            .filter(|p| {
                tray_row(ctx, unit_key, p.tray_id.as_str())
                    .map(|t| t.dry_ticks >= BALCONY_GROW_WILT_NIGHTS_WITHOUT_WATER)
                    .unwrap_or(false)
            })
            .collect();
        for mut plant in wilted {
            plant.phase = PHASE_WILTED;
            plant_table.row_key().update(plant);
        }
    }
}

/// Legacy alias — prefer [`advance_world_day_for_unit`].
pub(crate) fn advance_balcony_grow_for_unit(ctx: &ReducerContext, unit_key: &str, days: u8) {
    advance_world_day_for_unit(ctx, unit_key, days);
}

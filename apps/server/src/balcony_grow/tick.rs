use spacetimedb::{ReducerContext, Table};

use super::day_advance::{maybe_backfill_plant_day_fields, plant_is_mature};
use super::tables::*;
use super::tray::tray_row;

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
        tray.water_liters =
            (tray.water_liters - BALCONY_GROW_TRAY_WATER_EVAP_PER_TICK).max(0.0);
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

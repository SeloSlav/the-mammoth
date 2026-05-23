use spacetimedb::{ReducerContext, Table};

use super::day_advance::{maybe_backfill_plant_day_fields, plant_is_mature};
use super::tables::*;

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

    let plant_table = ctx.db.balcony_grow_plant();
    for mut plant in plant_table.iter().collect::<Vec<_>>() {
        if plant.phase != PHASE_GROWING {
            continue;
        }
        let old_target = plant.target_days;
        let old_grown = plant.days_grown;
        maybe_backfill_plant_day_fields(&mut plant, now);
        if plant_is_mature(&plant) {
            plant.phase = PHASE_MATURE;
        }
        let dirty = plant.target_days != old_target
            || plant.days_grown != old_grown
            || plant.phase == PHASE_MATURE;
        if dirty {
            plant_table.row_key().update(plant);
        }
    }
}

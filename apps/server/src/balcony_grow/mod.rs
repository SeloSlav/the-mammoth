//! Balcony grow-op: tray plants, water patches, fertilizer stash, scheduled growth tick.
#![allow(unused_imports)]

mod day_advance;
mod harvest;
mod reducers;
mod tables;
mod tick;
mod tray;
mod water_patch;

#[cfg(test)]
mod tests;

pub(crate) use day_advance::{
    advance_balcony_grow_for_unit, advance_world_day_for_unit, apply_substrate_to_plants,
    target_days_after_fertilizer, tray_dry_nights_after_sleep, tray_water_after_sleep_nights,
};
pub(crate) use harvest::{
    harvest_bonus_count, harvest_food_count, harvest_seed_count, HarvestCareContext,
};
pub(crate) use tables::*;
pub(crate) use tray::{
    ensure_balcony_grow_for_owner, ensure_balcony_grow_for_unit, grow_speed_modifier,
    grow_tray_stash_kind, grow_tray_stash_near_sender, set_grow_lights_for_unit,
    start_balcony_grow_schedule,
};

pub use reducers::{harvest_balcony_grow_slot, plant_balcony_grow_slot};
pub use tick::balcony_grow_tick_step;
pub use water_patch::dump_water_from_bottle;

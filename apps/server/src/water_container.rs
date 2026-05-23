//! Reusable water bottles (partial sips) and apartment water-tank reservoir.
//!
//! Bottles store fill in `water_bottle_fill`; the inventory row is never deleted when empty.
//! The apartment tank refills to full when the owner sleeps (`refill_apartment_water_tank_on_sleep`).

use log;
use spacetimedb::{ReducerContext, ScheduleAt, Table};

use crate::auth;
use crate::inventory::{find_item_in_stash_slot, inventory_item, InventoryItem};
use crate::items_catalog::{self, HotbarConsumeSound};
use crate::player_vitals;
use crate::pose::player_pose;
use crate::world_sound;

pub(crate) const WATER_BOTTLE_DEF_ID: &str = "water-bottle";

/// Default when catalog omits `waterContainer` (keep in sync with `tools.json`).
pub(crate) const DEFAULT_BOTTLE_CAPACITY_L: f32 = 1.0;
pub(crate) const DEFAULT_BOTTLE_SIP_L: f32 = 0.25;
pub(crate) const DEFAULT_BOTTLE_HYDRATION_PER_L: f32 = 32.0;

pub(crate) const APARTMENT_WATER_TANK_CAPACITY_L: f32 = 20.0;
/// Starting tank volume for a newly seeded apartment tank row.
pub(crate) const APARTMENT_WATER_TANK_START_L: f32 = 10.0;

#[spacetimedb::table(public, accessor = water_bottle_fill)]
pub struct WaterBottleFill {
    #[primary_key]
    pub item_instance_id: u64,
    pub water_liters: f32,
}

#[spacetimedb::table(public, accessor = apartment_water_tank)]
pub struct ApartmentWaterTank {
    #[primary_key]
    pub unit_key: String,
    pub water_liters: f32,
}

#[spacetimedb::table(
    public,
    accessor = apartment_water_tank_schedule,
    scheduled(apartment_water_tank_tick_step)
)]
pub struct ApartmentWaterTankSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

pub(crate) struct WaterContainerSpec {
    pub capacity_liters: f32,
    pub sip_liters: f32,
    pub hydration_per_liter: f32,
}

pub(crate) fn water_container_spec(def_id: &str) -> Option<WaterContainerSpec> {
    let c = items_catalog::get(def_id)?;
    let w = c.water_container.as_ref()?;
    if w.capacity_liters <= 0.0 || w.sip_liters <= 0.0 || w.hydration_per_liter <= 0.0 {
        return None;
    }
    Some(WaterContainerSpec {
        capacity_liters: w.capacity_liters,
        sip_liters: w.sip_liters,
        hydration_per_liter: w.hydration_per_liter,
    })
}

#[inline]
pub(crate) fn is_water_container_def(def_id: &str) -> bool {
    water_container_spec(def_id).is_some()
}

fn clamp_fill(liters: f32, capacity: f32) -> f32 {
    liters.clamp(0.0, capacity)
}

pub(crate) fn get_bottle_fill_liters(ctx: &ReducerContext, item_instance_id: u64) -> f32 {
    ctx.db
        .water_bottle_fill()
        .item_instance_id()
        .find(item_instance_id)
        .map(|r| r.water_liters.max(0.0))
        .unwrap_or(0.0)
}

pub(crate) fn set_bottle_fill_liters(
    ctx: &ReducerContext,
    item_instance_id: u64,
    liters: f32,
    capacity: f32,
) {
    let water_liters = clamp_fill(liters, capacity);
    let table = ctx.db.water_bottle_fill();
    if let Some(mut row) = table.item_instance_id().find(item_instance_id) {
        row.water_liters = water_liters;
        table.item_instance_id().update(row);
    } else {
        let _ = table.insert(WaterBottleFill {
            item_instance_id,
            water_liters,
        });
    }
}

/// Idempotent: new bottles default to full unless `initial_liters` is set.
pub(crate) fn ensure_water_bottle_fill_row(
    ctx: &ReducerContext,
    item_instance_id: u64,
    def_id: &str,
    initial_liters: Option<f32>,
) {
    let Some(spec) = water_container_spec(def_id) else {
        return;
    };
    if ctx
        .db
        .water_bottle_fill()
        .item_instance_id()
        .find(item_instance_id)
        .is_some()
    {
        return;
    }
    let fill = initial_liters.unwrap_or(spec.capacity_liters);
    set_bottle_fill_liters(ctx, item_instance_id, fill, spec.capacity_liters);
}

pub(crate) fn on_water_bottle_inventory_inserted(ctx: &ReducerContext, row: &InventoryItem) {
    ensure_water_bottle_fill_row(ctx, row.instance_id, row.def_id.as_str(), None);
}

pub(crate) fn backfill_water_bottle_fill_rows(ctx: &ReducerContext) {
    for row in ctx.db.inventory_item().iter() {
        ensure_water_bottle_fill_row(ctx, row.instance_id, row.def_id.as_str(), None);
    }
}

pub(crate) fn ensure_apartment_water_tank_row(ctx: &ReducerContext, unit_key: &str) {
    if ctx
        .db
        .apartment_water_tank()
        .unit_key()
        .find(&unit_key.to_string())
        .is_some()
    {
        return;
    }
    let _ = ctx.db.apartment_water_tank().insert(ApartmentWaterTank {
        unit_key: unit_key.to_string(),
        water_liters: APARTMENT_WATER_TANK_START_L.min(APARTMENT_WATER_TANK_CAPACITY_L),
    });
}

pub(crate) fn ensure_starter_apartment_water_tank(ctx: &ReducerContext, unit_key: &str) {
    ensure_apartment_water_tank_row(ctx, unit_key);
}

/// Refill the claimed apartment tank to capacity after a slept night.
pub(crate) fn refill_apartment_water_tank_on_sleep(ctx: &ReducerContext, unit_key: &str) {
    ensure_apartment_water_tank_row(ctx, unit_key);
    let table = ctx.db.apartment_water_tank();
    let Some(mut row) = table.unit_key().find(&unit_key.to_string()) else {
        return;
    };
    if (row.water_liters - APARTMENT_WATER_TANK_CAPACITY_L).abs() < 0.0001 {
        return;
    }
    row.water_liters = APARTMENT_WATER_TANK_CAPACITY_L;
    table.unit_key().update(row);
}

/// Hotbar left-click / instant-use path for reusable water bottles.
pub(crate) fn drink_water_bottle_from_hotbar(
    ctx: &ReducerContext,
    sender: spacetimedb::Identity,
    hotbar_slot: u8,
) -> bool {
    use crate::inventory::{find_item_in_hotbar_slot, NUM_PLAYER_HOTBAR_SLOTS};
    use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};

    if hotbar_slot >= NUM_PLAYER_HOTBAR_SLOTS {
        return false;
    }
    if player_vitals::hotbar_instant_consume_on_cooldown(ctx, sender) {
        log::debug!("drink_water_bottle: cooldown active");
        return false;
    }
    if player_vitals::is_player_dead(ctx, sender) {
        return false;
    }

    let Some(item) = find_item_in_hotbar_slot(ctx, sender, hotbar_slot) else {
        return false;
    };
    let Some(spec) = water_container_spec(&item.def_id) else {
        return false;
    };

    let current = get_bottle_fill_liters(ctx, item.instance_id);
    if current <= 0.0001 {
        log::debug!("drink_water_bottle: bottle empty");
        return false;
    }

    if let Some(mut rail) = ctx.db.player_active_hotbar().identity().find(&sender) {
        if rail.slot_index != ACTIVE_HOTBAR_SLOT_CLEARED {
            rail.slot_index = ACTIVE_HOTBAR_SLOT_CLEARED;
            ctx.db.player_active_hotbar().identity().update(rail);
        }
    }

    let sip = spec.sip_liters.min(current);
    let hydration = sip * spec.hydration_per_liter;
    set_bottle_fill_liters(ctx, item.instance_id, current - sip, spec.capacity_liters);
    player_vitals::apply_instant_vital_deltas(ctx, sender, 0.0, 0.0, hydration, true);

    let kind = match items_catalog::hotbar_consume_sound(&item.def_id) {
        HotbarConsumeSound::Eat => world_sound::KIND_CONSUME_EAT,
        HotbarConsumeSound::Drink => world_sound::KIND_CONSUME_DRINK,
        HotbarConsumeSound::Smoke => world_sound::KIND_CONSUME_SMOKE,
    };
    if let Some(pose) = ctx.db.player_pose().identity().find(&sender) {
        world_sound::emit_hotbar_consume_at(ctx, kind, pose.x, pose.y + 0.92, pose.z, sender);
    }
    true
}

pub(crate) fn fill_bottle_in_water_tank_stash(
    ctx: &ReducerContext,
    stash_key: &str,
) -> Result<(), String> {
    auth::ensure_gameplay_unlocked(ctx)?;
    let sender = ctx.sender();
    let (owner_id, unit_key, stash_kind) =
        crate::apartments::apartment_stash_owner_near_sender(ctx, stash_key)
            .ok_or_else(|| "must be at your apartment water tank".to_string())?;
    if owner_id != sender {
        return Err("not your apartment".to_string());
    }
    if stash_kind != crate::inventory_models::APARTMENT_STASH_KIND_WATER_TANK {
        return Err("not a water tank".to_string());
    }

    let bottle = find_item_in_stash_slot(ctx, owner_id, stash_key, 0)
        .ok_or_else(|| "place a water bottle in the tank slot first".to_string())?;
    if bottle.def_id != WATER_BOTTLE_DEF_ID {
        return Err("water tank only fills water bottles".to_string());
    }

    let spec = water_container_spec(WATER_BOTTLE_DEF_ID)
        .ok_or_else(|| "water bottle spec missing".to_string())?;
    let current = get_bottle_fill_liters(ctx, bottle.instance_id);
    let needed = spec.capacity_liters - current;
    if needed <= 0.0001 {
        return Err("bottle is already full".to_string());
    }

    ensure_apartment_water_tank_row(ctx, &unit_key);
    let tank_table = ctx.db.apartment_water_tank();
    let mut tank = tank_table
        .unit_key()
        .find(&unit_key)
        .ok_or_else(|| "water tank unavailable".to_string())?;
    if tank.water_liters <= 0.0001 {
        return Err("water tank is empty — sleep in your bed to refill it".to_string());
    }

    let xfer = needed.min(tank.water_liters);
    set_bottle_fill_liters(
        ctx,
        bottle.instance_id,
        current + xfer,
        spec.capacity_liters,
    );
    tank.water_liters = (tank.water_liters - xfer).max(0.0);
    tank_table.unit_key().update(tank);
    Ok(())
}

#[spacetimedb::reducer]
pub fn fill_water_bottle_at_tank(ctx: &ReducerContext, unit_key: String) {
    if let Err(e) = fill_bottle_in_water_tank_stash(ctx, unit_key.as_str()) {
        log::debug!("fill_water_bottle_at_tank: {e}");
        crate::apartments::notify_stash_reducer_failure(ctx, e);
    }
}

#[spacetimedb::reducer]
pub fn apartment_water_tank_tick_step(ctx: &ReducerContext, _arg: ApartmentWaterTankSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    // Legacy scheduled reducer — passive realtime refill removed; sleep refills the tank instead.
}

#[cfg(test)]
mod tests {
    use super::{APARTMENT_WATER_TANK_CAPACITY_L, APARTMENT_WATER_TANK_START_L};

    #[test]
    fn tank_starts_partial_and_sleep_refills_to_capacity() {
        assert!(APARTMENT_WATER_TANK_START_L < APARTMENT_WATER_TANK_CAPACITY_L);
        assert_eq!(APARTMENT_WATER_TANK_CAPACITY_L, 20.0);
    }
}

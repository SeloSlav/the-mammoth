//! Fish-tank filter unit — links to a main tank decor, tracks water + filter health,
//! and gates overnight feed→compost conversion in `fish_tank.rs`.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments::{self, apartment_unit, apartment_unit_decor, ApartmentUnitDecor};
use crate::auth;
use crate::fish_tank;
use crate::inventory::{find_item_in_hotbar_slot, find_item_in_stash_slot, remove_stash_item_quantity};
use crate::inventory_models::apartment_stash_key_decor;
use crate::water_container;

pub(crate) const APARTMENT_STASH_KIND_FISH_TANK_FILTER: &str = "fish_tank_filter";
pub(crate) const FISH_TANK_FILTER_MAINTENANCE_SLOT: u16 = 0;
pub(crate) const FISH_TANK_FILTER_PATCH_DEF_ID: &str = "fish-filter-sponge";

pub(crate) const FISH_TANK_WATER_CAPACITY_L: f32 = 5.0;
pub(crate) const FISH_TANK_WATER_START_L: f32 = 4.0;
pub(crate) const FISH_TANK_FILTER_HEALTH_START: u8 = 85;

const TOP_OFF_LITERS: f32 = 0.5;
const RINSE_LITERS: f32 = 1.0;
const RINSE_HEALTH_GAIN: u8 = 25;
const CARTRIDGE_INSTALL_HEALTH: u8 = 100;
const OVERNIGHT_WATER_LOSS_L: f32 = 0.35;
const OVERNIGHT_FILTER_LOSS_OK: u8 = 4;
const OVERNIGHT_FILTER_LOSS_STRESSED: u8 = 10;

#[spacetimedb::table(public, accessor = fish_tank_filter_link)]
pub struct FishTankFilterLink {
    #[primary_key]
    pub filter_decor_id: u64,
    pub unit_key: String,
    pub tank_decor_id: u64,
}

#[spacetimedb::table(public, accessor = fish_tank_ecosystem)]
pub struct FishTankEcosystem {
    #[primary_key]
    pub tank_decor_id: u64,
    pub unit_key: String,
    pub water_liters: f32,
    pub filter_health: u8,
}

fn is_filter_decor_row(decor: &ApartmentUnitDecor) -> bool {
    apartments::effective_decor_item_kind(decor.item_kind, decor.model_rel_path.as_str())
        == apartments::APARTMENT_DECOR_ITEM_KIND_FISH_TANK_FILTER
}

fn is_tank_decor_row(decor: &ApartmentUnitDecor) -> bool {
    apartments::effective_decor_item_kind(decor.item_kind, decor.model_rel_path.as_str())
        == apartments::APARTMENT_DECOR_ITEM_KIND_FISH_TANK
}

fn filter_stash_key(decor: &ApartmentUnitDecor) -> String {
    apartment_stash_key_decor(decor.unit_key.as_str(), decor.decor_id)
}

fn clamp_water(l: f32) -> f32 {
    l.clamp(0.0, FISH_TANK_WATER_CAPACITY_L)
}

fn clamp_health(h: u8) -> u8 {
    h.min(100)
}

pub(crate) fn ensure_fish_tank_ecosystem(ctx: &ReducerContext, unit_key: &str, tank_decor_id: u64) {
    if ctx
        .db
        .fish_tank_ecosystem()
        .tank_decor_id()
        .find(tank_decor_id)
        .is_some()
    {
        return;
    }
    let _ = ctx.db.fish_tank_ecosystem().insert(FishTankEcosystem {
        tank_decor_id,
        unit_key: unit_key.to_string(),
        water_liters: FISH_TANK_WATER_START_L.min(FISH_TANK_WATER_CAPACITY_L),
        filter_health: FISH_TANK_FILTER_HEALTH_START,
    });
}

fn decor_belongs_to_claimed_owner(
    ctx: &ReducerContext,
    owner: Identity,
    decor: &ApartmentUnitDecor,
) -> bool {
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&decor.unit_key);
    unit.map(|u| u.owner == Some(owner) && u.state == apartments::UNIT_STATE_CLAIMED)
        .unwrap_or(false)
}

/// Multiplier for overnight feed conversion (0.0–1.0) from linked ecosystem state.
pub(crate) fn fish_tank_feed_success_multiplier(
    ctx: &ReducerContext,
    tank_decor_id: u64,
) -> f32 {
    let Some(eco) = ctx.db.fish_tank_ecosystem().tank_decor_id().find(tank_decor_id) else {
        return 0.55;
    };
    let water_frac = if FISH_TANK_WATER_CAPACITY_L > 0.0 {
        eco.water_liters / FISH_TANK_WATER_CAPACITY_L
    } else {
        0.0
    };
    let filter_frac = eco.filter_health as f32 / 100.0;
    if water_frac < 0.2 || filter_frac < 0.15 {
        return 0.0;
    }
    (0.35 + 0.45 * water_frac + 0.35 * filter_frac).clamp(0.0, 1.0)
}

pub(crate) fn bind_fish_tank_filter_impl(
    ctx: &ReducerContext,
    owner: Identity,
    filter_decor_id: u64,
    tank_decor_id: u64,
) -> Result<(), String> {
    auth::ensure_gameplay_unlocked(ctx)?;
    let filter = ctx
        .db
        .apartment_unit_decor()
        .decor_id()
        .find(filter_decor_id)
        .ok_or_else(|| "unknown filter decor".to_string())?;
    if !is_filter_decor_row(&filter) {
        return Err("not a fish tank filter".to_string());
    }
    if !decor_belongs_to_claimed_owner(ctx, owner, &filter) {
        return Err("not your apartment".to_string());
    }
    let tank = ctx
        .db
        .apartment_unit_decor()
        .decor_id()
        .find(tank_decor_id)
        .ok_or_else(|| "unknown fish tank decor".to_string())?;
    if tank.unit_key.as_str() != filter.unit_key.as_str() {
        return Err("filter and tank must be in the same apartment".to_string());
    }
    if !is_tank_decor_row(&tank) {
        return Err("linked decor is not a fish tank".to_string());
    }
    if !decor_belongs_to_claimed_owner(ctx, owner, &tank) {
        return Err("not your apartment".to_string());
    }

    let link_table = ctx.db.fish_tank_filter_link();
    if let Some(existing_tank) = link_table
        .iter()
        .find(|l| l.unit_key.as_str() == filter.unit_key.as_str() && l.tank_decor_id == tank_decor_id)
        .filter(|l| l.filter_decor_id != filter_decor_id)
    {
        let _ = existing_tank;
        return Err("that fish tank already has a filter linked".to_string());
    }

    ensure_fish_tank_ecosystem(ctx, filter.unit_key.as_str(), tank_decor_id);

    if let Some(mut row) = link_table.filter_decor_id().find(filter_decor_id) {
        row.tank_decor_id = tank_decor_id;
        link_table.filter_decor_id().update(row);
    } else {
        let _ = link_table.insert(FishTankFilterLink {
            filter_decor_id,
            unit_key: filter.unit_key.clone(),
            tank_decor_id,
        });
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn bind_fish_tank_filter(
    ctx: &ReducerContext,
    filter_decor_id: u64,
    tank_decor_id: u64,
) {
    if let Err(e) = bind_fish_tank_filter_impl(ctx, ctx.sender(), filter_decor_id, tank_decor_id) {
        log::debug!("bind_fish_tank_filter: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

fn filter_link_for_decor(ctx: &ReducerContext, filter_decor_id: u64) -> Option<FishTankFilterLink> {
    ctx.db
        .fish_tank_filter_link()
        .filter_decor_id()
        .find(filter_decor_id)
}

fn player_near_filter_stash(
    ctx: &ReducerContext,
    sender: spacetimedb::Identity,
    stash_key: &str,
) -> Result<(), String> {
    let (owner_id, _, stash_kind) = apartments::apartment_stash_owner_near_sender(ctx, stash_key)
        .ok_or_else(|| "must be at your fish filter".to_string())?;
    if owner_id != sender {
        return Err("not your apartment".to_string());
    }
    if stash_kind != APARTMENT_STASH_KIND_FISH_TANK_FILTER {
        return Err("not a fish filter".to_string());
    }
    Ok(())
}

fn sip_bottle_liters(
    ctx: &ReducerContext,
    owner: Identity,
    hotbar_slot: u8,
    liters: f32,
) -> Result<(), String> {
    use crate::inventory::NUM_PLAYER_HOTBAR_SLOTS;

    if hotbar_slot >= NUM_PLAYER_HOTBAR_SLOTS {
        return Err("invalid hotbar slot".to_string());
    }
    let item = find_item_in_hotbar_slot(ctx, owner, hotbar_slot)
        .ok_or_else(|| "hold a water bottle on the hotbar".to_string())?;
    if item.def_id != water_container::WATER_BOTTLE_DEF_ID {
        return Err("hold a water bottle on the hotbar".to_string());
    }
    let spec = water_container::water_container_spec(&item.def_id)
        .ok_or_else(|| "water bottle spec missing".to_string())?;
    let current = water_container::get_bottle_fill_liters(ctx, item.instance_id);
    if current < liters - 0.0001 {
        return Err("not enough water in the bottle".to_string());
    }
    water_container::set_bottle_fill_liters(
        ctx,
        item.instance_id,
        current - liters,
        spec.capacity_liters,
    );
    Ok(())
}

pub(crate) fn top_off_fish_tank_from_bottle_impl(
    ctx: &ReducerContext,
    filter_decor_id: u64,
    hotbar_slot: u8,
) -> Result<(), String> {
    auth::ensure_gameplay_unlocked(ctx)?;
    let sender = ctx.sender();
    let filter = ctx
        .db
        .apartment_unit_decor()
        .decor_id()
        .find(filter_decor_id)
        .ok_or_else(|| "unknown filter".to_string())?;
    if !is_filter_decor_row(&filter) {
        return Err("not a fish tank filter".to_string());
    }
    player_near_filter_stash(ctx, sender, filter_stash_key(&filter).as_str())?;
    let link = filter_link_for_decor(ctx, filter_decor_id)
        .ok_or_else(|| "filter is not linked to a fish tank — set the link in the apartment editor".to_string())?;

    sip_bottle_liters(ctx, sender, hotbar_slot, TOP_OFF_LITERS)?;

    ensure_fish_tank_ecosystem(ctx, link.unit_key.as_str(), link.tank_decor_id);
    let eco_table = ctx.db.fish_tank_ecosystem();
    let Some(mut eco) = eco_table.tank_decor_id().find(link.tank_decor_id) else {
        return Err("fish tank ecosystem unavailable".to_string());
    };
    eco.water_liters = clamp_water(eco.water_liters + TOP_OFF_LITERS);
    eco_table.tank_decor_id().update(eco);
    Ok(())
}

#[spacetimedb::reducer]
pub fn top_off_fish_tank_from_bottle(
    ctx: &ReducerContext,
    filter_decor_id: u64,
    hotbar_slot: u8,
) {
    if let Err(e) = top_off_fish_tank_from_bottle_impl(ctx, filter_decor_id, hotbar_slot) {
        log::debug!("top_off_fish_tank_from_bottle: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

pub(crate) fn rinse_fish_tank_filter_impl(
    ctx: &ReducerContext,
    filter_decor_id: u64,
    hotbar_slot: u8,
) -> Result<(), String> {
    auth::ensure_gameplay_unlocked(ctx)?;
    let sender = ctx.sender();
    let filter = ctx
        .db
        .apartment_unit_decor()
        .decor_id()
        .find(filter_decor_id)
        .ok_or_else(|| "unknown filter".to_string())?;
    if !is_filter_decor_row(&filter) {
        return Err("not a fish tank filter".to_string());
    }
    player_near_filter_stash(ctx, sender, filter_stash_key(&filter).as_str())?;
    let link = filter_link_for_decor(ctx, filter_decor_id)
        .ok_or_else(|| "filter is not linked to a fish tank".to_string())?;

    sip_bottle_liters(ctx, sender, hotbar_slot, RINSE_LITERS)?;

    ensure_fish_tank_ecosystem(ctx, link.unit_key.as_str(), link.tank_decor_id);
    let eco_table = ctx.db.fish_tank_ecosystem();
    let Some(mut eco) = eco_table.tank_decor_id().find(link.tank_decor_id) else {
        return Err("fish tank ecosystem unavailable".to_string());
    };
    eco.filter_health = clamp_health(eco.filter_health.saturating_add(RINSE_HEALTH_GAIN));
    eco_table.tank_decor_id().update(eco);
    Ok(())
}

#[spacetimedb::reducer]
pub fn rinse_fish_tank_filter(
    ctx: &ReducerContext,
    filter_decor_id: u64,
    hotbar_slot: u8,
) {
    if let Err(e) = rinse_fish_tank_filter_impl(ctx, filter_decor_id, hotbar_slot) {
        log::debug!("rinse_fish_tank_filter: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

pub(crate) fn apply_fish_filter_patch_impl(
    ctx: &ReducerContext,
    filter_decor_id: u64,
) -> Result<(), String> {
    auth::ensure_gameplay_unlocked(ctx)?;
    let sender = ctx.sender();
    let filter = ctx
        .db
        .apartment_unit_decor()
        .decor_id()
        .find(filter_decor_id)
        .ok_or_else(|| "unknown filter".to_string())?;
    if !is_filter_decor_row(&filter) {
        return Err("not a fish tank filter".to_string());
    }
    let stash_key = filter_stash_key(&filter);
    player_near_filter_stash(ctx, sender, stash_key.as_str())?;
    let link = filter_link_for_decor(ctx, filter_decor_id)
        .ok_or_else(|| "filter is not linked to a fish tank".to_string())?;
    let item = find_item_in_stash_slot(ctx, sender, stash_key.as_str(), FISH_TANK_FILTER_MAINTENANCE_SLOT)
        .ok_or_else(|| "place a filter sponge cartridge in the maintenance slot first".to_string())?;
    if item.def_id != FISH_TANK_FILTER_PATCH_DEF_ID {
        return Err("filter maintenance slot only accepts a filter sponge cartridge".to_string());
    }
    remove_stash_item_quantity(
        ctx,
        sender,
        stash_key.as_str(),
        FISH_TANK_FILTER_MAINTENANCE_SLOT,
        1,
    )?;

    ensure_fish_tank_ecosystem(ctx, link.unit_key.as_str(), link.tank_decor_id);
    let eco_table = ctx.db.fish_tank_ecosystem();
    let Some(mut eco) = eco_table.tank_decor_id().find(link.tank_decor_id) else {
        return Err("fish tank ecosystem unavailable".to_string());
    };
    eco.filter_health = clamp_health(CARTRIDGE_INSTALL_HEALTH);
    eco_table.tank_decor_id().update(eco);
    Ok(())
}

#[spacetimedb::reducer]
pub fn apply_fish_filter_patch(ctx: &ReducerContext, filter_decor_id: u64) {
    if let Err(e) = apply_fish_filter_patch_impl(ctx, filter_decor_id) {
        log::debug!("apply_fish_filter_patch: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

pub(crate) fn advance_fish_tank_ecosystems_for_unit(ctx: &ReducerContext, unit_key: &str) {
    let links: Vec<FishTankFilterLink> = ctx
        .db
        .fish_tank_filter_link()
        .iter()
        .filter(|l| l.unit_key.as_str() == unit_key)
        .collect();
    if links.is_empty() {
        return;
    }

    let eco_table = ctx.db.fish_tank_ecosystem();
    for link in links {
        ensure_fish_tank_ecosystem(ctx, unit_key, link.tank_decor_id);
        let Some(mut eco) = eco_table.tank_decor_id().find(link.tank_decor_id) else {
            continue;
        };
        eco.water_liters = clamp_water(eco.water_liters - OVERNIGHT_WATER_LOSS_L);
        let water_low = eco.water_liters < FISH_TANK_WATER_CAPACITY_L * 0.35;
        let loss = if water_low {
            OVERNIGHT_FILTER_LOSS_STRESSED
        } else {
            OVERNIGHT_FILTER_LOSS_OK
        };
        eco.filter_health = eco.filter_health.saturating_sub(loss);
        eco_table.tank_decor_id().update(eco);
    }
}

/// Sleep hook — run feed digest on tanks that have a linked filter ecosystem.
pub(crate) fn advance_fish_tank_filters_for_unit(ctx: &ReducerContext, unit_key: &str) {
    advance_fish_tank_ecosystems_for_unit(ctx, unit_key);

    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string());
    let Some(owner) = unit.and_then(|u| u.owner) else {
        return;
    };

    let links: Vec<FishTankFilterLink> = ctx
        .db
        .fish_tank_filter_link()
        .iter()
        .filter(|l| l.unit_key.as_str() == unit_key)
        .collect();

    for link in links {
        let Some(tank) = ctx
            .db
            .apartment_unit_decor()
            .decor_id()
            .find(link.tank_decor_id)
        else {
            continue;
        };
        if !is_tank_decor_row(&tank) {
            continue;
        }
        fish_tank::process_fish_tank_on_sleep_for_decor(ctx, owner, &tank, link.tank_decor_id);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        clamp_health, clamp_water, FISH_TANK_FILTER_HEALTH_START, FISH_TANK_WATER_CAPACITY_L,
        FISH_TANK_WATER_START_L,
    };

    #[test]
    fn ecosystem_starts_partial_water() {
        assert!(FISH_TANK_WATER_START_L < FISH_TANK_WATER_CAPACITY_L);
        assert_eq!(clamp_water(FISH_TANK_WATER_CAPACITY_L + 1.0), FISH_TANK_WATER_CAPACITY_L);
    }

    #[test]
    fn filter_health_caps_at_100() {
        assert_eq!(clamp_health(120), 100);
        assert_eq!(FISH_TANK_FILTER_HEALTH_START, 85);
    }
}

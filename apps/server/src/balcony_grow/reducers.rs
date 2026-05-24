use spacetimedb::{Identity, ReducerContext, Table};

use super::harvest::harvest_balcony_grow_slot_impl;
use super::tables::*;
use super::tray::{compute_target_days, ensure_balcony_grow_for_unit, player_near_tray, tray_row};
use crate::apartments;
use crate::auth;
use crate::inventory::{find_item_in_hotbar_slot, remove_player_item_quantity};
use crate::items_catalog;
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};

#[spacetimedb::reducer]
pub fn plant_balcony_grow_slot(
    ctx: &ReducerContext,
    unit_key: String,
    tray_id: String,
    slot_index: u8,
    seed_def_id: String,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("plant_balcony_grow_slot blocked: {e}");
        return;
    }
    if let Err(e) = plant_balcony_grow_slot_impl(
        ctx,
        unit_key.as_str(),
        tray_id.as_str(),
        slot_index,
        seed_def_id.as_str(),
    ) {
        log::debug!("plant_balcony_grow_slot: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

fn slot_empty(ctx: &ReducerContext, unit_key: &str, tray_id: &str, slot_index: u8) -> bool {
    !ctx.db.balcony_grow_plant().iter().any(|p| {
        p.unit_key == unit_key
            && p.tray_id == tray_id
            && p.slot_index == slot_index
            && p.phase != PHASE_EMPTY
    })
}

fn consume_one_seed_from_hotbar(
    ctx: &ReducerContext,
    sender: Identity,
    hotbar_slot: u8,
    seed_def_id: &str,
) -> Result<(), String> {
    let item = find_item_in_hotbar_slot(ctx, sender, hotbar_slot)
        .ok_or_else(|| "no seed in hotbar slot".to_string())?;
    if item.def_id != seed_def_id {
        return Err("hotbar item mismatch".to_string());
    }
    remove_player_item_quantity(ctx, item.instance_id, 1)?;
    Ok(())
}

fn plant_balcony_grow_slot_impl(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
    slot_index: u8,
    seed_def_id: &str,
) -> Result<(), String> {
    if slot_index >= BALCONY_GROW_SLOTS_PER_TRAY {
        return Err("invalid slot".to_string());
    }
    let spec = items_catalog::balcony_grow_spec(seed_def_id)
        .ok_or_else(|| "not a plantable seed".to_string())?;
    ensure_balcony_grow_for_unit(ctx, unit_key);
    if tray_row(ctx, unit_key, tray_id).is_none() {
        return Err("invalid tray".to_string());
    }
    player_near_tray(ctx, unit_key, tray_id)?;
    if !slot_empty(ctx, unit_key, tray_id, slot_index) {
        return Err("slot already occupied".to_string());
    }

    let sender = ctx.sender();
    let hotbar_slot = ctx
        .db
        .player_active_hotbar()
        .identity()
        .find(&sender)
        .map(|r| r.slot_index)
        .filter(|s| *s != ACTIVE_HOTBAR_SLOT_CLEARED)
        .ok_or_else(|| "select a seed on the hotbar".to_string())?;
    consume_one_seed_from_hotbar(ctx, sender, hotbar_slot, seed_def_id)?;

    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let target_days = compute_target_days(ctx, unit_key, tray_id, spec);

    let row_key = plant_row_key(unit_key, tray_id, slot_index);
    let plant_table = ctx.db.balcony_grow_plant();
    if let Some(mut existing) = plant_table.row_key().find(&row_key) {
        existing.crop_def_id = seed_def_id.to_string();
        existing.planted_at_micros = now;
        existing.mature_at_micros = 0;
        existing.target_days = target_days;
        existing.days_grown = 0;
        existing.substrate_fed_overnight = 0;
        existing.phase = PHASE_GROWING;
        existing.owner = sender;
        plant_table.row_key().update(existing);
    } else {
        let _ = plant_table.insert(BalconyGrowPlant {
            row_key,
            unit_key: unit_key.to_string(),
            tray_id: tray_id.to_string(),
            slot_index,
            crop_def_id: seed_def_id.to_string(),
            planted_at_micros: now,
            mature_at_micros: 0,
            phase: PHASE_GROWING,
            owner: sender,
            target_days,
            days_grown: 0,
            substrate_fed_overnight: 0,
        });
    }
    Ok(())
}

#[spacetimedb::reducer]
pub fn harvest_balcony_grow_slot(
    ctx: &ReducerContext,
    unit_key: String,
    tray_id: String,
    slot_index: u8,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("harvest_balcony_grow_slot blocked: {e}");
        return;
    }
    if let Err(e) =
        harvest_balcony_grow_slot_impl(ctx, unit_key.as_str(), tray_id.as_str(), slot_index)
    {
        log::debug!("harvest_balcony_grow_slot: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

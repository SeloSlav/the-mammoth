use spacetimedb::{Identity, ReducerContext, Table};

use crate::crafting::{emit_hud_notice, emit_hud_toast, HUD_TOAST_KIND_ITEM_RECEIVED};
use crate::dropped_item::grant_stack_to_player_spilling_at_feet;

use super::tables::*;
use super::tray::{lights_on_for_unit, tray_row};

#[derive(Clone, Copy)]
pub(crate) struct HarvestCareContext {
    pub(super) lights_on: bool,
    pub(super) substrate_fed_overnight: bool,
    pub(super) water_liters: f32,
}

pub(super) fn harvest_roll_base(ctx: &ReducerContext, slot_index: u8) -> u64 {
    ctx.timestamp
        .to_micros_since_unix_epoch()
        .unsigned_abs()
        .wrapping_mul(0x9E37_79B9_7F4A_7C15)
        .wrapping_add(slot_index as u64)
}

pub(crate) fn harvest_bonus_count(
    care: HarvestCareContext,
    mut roll_base: u64,
    roll_offset: u64,
    light_threshold: u8,
    fertilizer_threshold: u8,
    water_ok_threshold: u8,
    water_full_threshold: u8,
) -> u32 {
    let mut bonuses = 0u32;
    let mut next_roll = |idx: u64| -> u8 {
        roll_base = roll_base
            .wrapping_mul(0xBF58_476D_1CE4_E5B9)
            .wrapping_add((roll_offset + idx).wrapping_mul(17));
        (roll_base % 100) as u8
    };

    if care.lights_on && next_roll(1) < light_threshold {
        bonuses += 1;
    }
    if care.substrate_fed_overnight && next_roll(2) < fertilizer_threshold {
        bonuses += 1;
    }
    if care.water_liters >= 0.5 && next_roll(3) < water_ok_threshold {
        bonuses += 1;
    }
    if care.water_liters >= BALCONY_GROW_TRAY_MAX_WATER_L - 0.05
        && next_roll(4) < water_full_threshold
    {
        bonuses += 1;
    }
    bonuses
}

pub(crate) fn harvest_seed_count(care: HarvestCareContext, roll_base: u64) -> u32 {
    BALCONY_GROW_HARVEST_SEED_BASE
        + harvest_bonus_count(
            care,
            roll_base,
            0,
            BALCONY_GROW_HARVEST_SEED_BONUS_LIGHT_THRESHOLD,
            BALCONY_GROW_HARVEST_SEED_BONUS_FERTILIZER_THRESHOLD,
            BALCONY_GROW_HARVEST_SEED_BONUS_WATER_OK_THRESHOLD,
            BALCONY_GROW_HARVEST_SEED_BONUS_WATER_FULL_THRESHOLD,
        )
}

pub(crate) fn harvest_food_count(care: HarvestCareContext, roll_base: u64) -> u32 {
    BALCONY_GROW_HARVEST_FOOD_BASE
        + harvest_bonus_count(
            care,
            roll_base,
            100,
            BALCONY_GROW_HARVEST_FOOD_BONUS_LIGHT_THRESHOLD,
            BALCONY_GROW_HARVEST_FOOD_BONUS_FERTILIZER_THRESHOLD,
            BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_OK_THRESHOLD,
            BALCONY_GROW_HARVEST_FOOD_BONUS_WATER_FULL_THRESHOLD,
        )
}

pub(super) fn harvest_care_context(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
    substrate_fed_overnight: bool,
) -> HarvestCareContext {
    HarvestCareContext {
        lights_on: lights_on_for_unit(ctx, unit_key),
        substrate_fed_overnight,
        water_liters: tray_row(ctx, unit_key, tray_id)
            .map(|t| t.water_liters)
            .unwrap_or(0.0),
    }
}

pub(super) fn harvest_balcony_grow_slot_impl(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
    slot_index: u8,
) -> Result<(), String> {
    use super::day_advance::plant_is_mature;
    use super::tray::{ensure_balcony_grow_for_unit, player_near_tray, tray_row};
    ensure_balcony_grow_for_unit(ctx, unit_key);
    if slot_index >= BALCONY_GROW_SLOTS_PER_TRAY || tray_row(ctx, unit_key, tray_id).is_none() {
        return Err("invalid tray slot".to_string());
    }
    player_near_tray(ctx, unit_key, tray_id)?;
    let sender = ctx.sender();
    let row_key = plant_row_key(unit_key, tray_id, slot_index);
    let plant_table = ctx.db.balcony_grow_plant();
    let plant = plant_table
        .row_key()
        .find(&row_key)
        .ok_or_else(|| "nothing planted here".to_string())?;
    if !plant_is_mature(&plant) {
        return Err("crop is not ready to harvest".to_string());
    }
    let spec = crate::items_catalog::balcony_grow_spec(plant.crop_def_id.as_str())
        .ok_or_else(|| "unknown crop".to_string())?;
    let seed_def_id = plant.crop_def_id.clone();
    let harvest_def_id = spec.harvest_def_id.clone();
    let care = harvest_care_context(ctx, unit_key, tray_id, plant.substrate_fed_overnight != 0);
    let roll_base = harvest_roll_base(ctx, slot_index);
    let food_qty = harvest_food_count(care, roll_base);
    let seed_qty = harvest_seed_count(care, roll_base);

    let food_remaining =
        grant_stack_to_player_spilling_at_feet(ctx, sender, harvest_def_id.clone(), food_qty)?;
    let seed_remaining =
        grant_stack_to_player_spilling_at_feet(ctx, sender, seed_def_id.clone(), seed_qty)?;
    let food_granted = food_qty.saturating_sub(food_remaining);
    let seed_granted = seed_qty.saturating_sub(seed_remaining);
    if food_granted > 0 {
        emit_hud_toast(
            ctx,
            sender,
            HUD_TOAST_KIND_ITEM_RECEIVED,
            harvest_def_id.clone(),
            food_granted,
        );
    }
    if seed_granted > 0 {
        emit_hud_toast(
            ctx,
            sender,
            HUD_TOAST_KIND_ITEM_RECEIVED,
            seed_def_id.clone(),
            seed_granted,
        );
    }
    if food_remaining > 0 || seed_remaining > 0 {
        emit_hud_notice(
            ctx,
            sender,
            "Inventory full — harvest dropped at your feet".to_string(),
        );
    }
    plant_table.row_key().delete(row_key);
    maybe_emit_first_harvest_journal(ctx, sender, plant.crop_def_id.as_str());
    Ok(())
}

fn first_harvest_hint(crop_def_id: &str) -> &'static str {
    match crop_def_id {
        "parsley-seeds" => "Fresh peršin finishes every pot — stash some for trade day.",
        "dill-seeds" => "Kopar pairs with tank fish — the engineer knows the grill schedule.",
        "paprika-seedlings" => "Feferoni slow-roast best on the stove — save three for ajvar.",
        "green-onion-sets" => "Mladi luk tops any ćevap plate — neighbours pay in cigarettes.",
        "radish-sprout-seeds" => {
            "Klica repe is emergency greens — eat raw when the fridge runs dry."
        }
        "oyster-mushroom-spore" => {
            "Bukovačica cooks down into soup — ask the engineer for the communal pot."
        }
        "scented-geranium-cuttings" => {
            "Pelargonija čaj calms the block — steep after a long shift."
        }
        _ => "Balcony harvest logged — check the stove for communal recipes.",
    }
}

fn maybe_emit_first_harvest_journal(ctx: &ReducerContext, owner: Identity, crop_def_id: &str) {
    let journal = ctx.db.player_grow_journal();
    let row_key = journal_row_key(owner, crop_def_id);
    if journal.row_key().find(&row_key).is_some() {
        return;
    }
    let _ = journal.insert(PlayerGrowJournal {
        row_key,
        identity: owner,
        crop_def_id: crop_def_id.to_string(),
    });
    emit_hud_notice(ctx, owner, first_harvest_hint(crop_def_id).to_string());
}

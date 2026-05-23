use spacetimedb::{ReducerContext, Table};

use crate::loadout::player_active_hotbar;
use crate::auth;
use crate::apartments;
use crate::loadout::ACTIVE_HOTBAR_SLOT_CLEARED;
use crate::water_container::{self, WATER_BOTTLE_DEF_ID};

use super::tables::*;
use super::tray::{ensure_balcony_grow_for_unit, resolve_tray_placements};

#[spacetimedb::reducer]
pub fn dump_water_from_bottle(ctx: &ReducerContext, aim_x: f32, aim_z: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("dump_water_from_bottle blocked: {e}");
        return;
    }
    if let Err(e) = dump_water_from_bottle_impl(ctx, aim_x, aim_z) {
        log::debug!("dump_water_from_bottle: {e}");
        apartments::notify_stash_reducer_failure(ctx, e);
    }
}

pub(super) fn dump_water_from_bottle_impl(ctx: &ReducerContext, aim_x: f32, aim_z: f32) -> Result<(), String> {
    use crate::inventory::find_item_in_hotbar_slot;

    let sender = ctx.sender();
    let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, sender) else {
        return Err("need a claimed apartment".to_string());
    };
    let hotbar_slot = ctx
        .db
        .player_active_hotbar()
        .identity()
        .find(&sender)
        .map(|r| r.slot_index)
        .filter(|s| *s != ACTIVE_HOTBAR_SLOT_CLEARED)
        .ok_or_else(|| "equip a water bottle".to_string())?;
    let bottle = find_item_in_hotbar_slot(ctx, sender, hotbar_slot)
        .ok_or_else(|| "no water bottle equipped".to_string())?;
    if bottle.def_id != WATER_BOTTLE_DEF_ID {
        return Err("equip a water bottle".to_string());
    }
    let spec = water_container::water_container_spec(WATER_BOTTLE_DEF_ID)
        .ok_or_else(|| "bottle spec missing".to_string())?;
    let current = water_container::get_bottle_fill_liters(ctx, bottle.instance_id);
    let dump = BALCONY_WATER_PATCH_DUMP_L.min(current);
    if dump <= 0.0001 {
        return Err("water bottle is empty".to_string());
    }
    water_container::set_bottle_fill_liters(
        ctx,
        bottle.instance_id,
        current - dump,
        spec.capacity_liters,
    );

    let now = ctx.timestamp.to_micros_since_unix_epoch();
    let expires = now + BALCONY_WATER_PATCH_DURATION_SECS * 1_000_000;
    ensure_balcony_grow_for_unit(ctx, unit_key.as_str());
    let _ = ctx.db.balcony_water_patch().insert(BalconyWaterPatch {
        patch_id: 0,
        unit_key: unit_key.clone(),
        pos_x: aim_x,
        pos_z: aim_z,
        radius_m: BALCONY_WATER_PATCH_RADIUS_M,
        water_liters: dump,
        created_at_micros: now,
        expires_at_micros: expires,
    });

    apply_patch_water_to_trays(ctx, unit_key.as_str(), aim_x, aim_z, dump);
    Ok(())
}

pub(super) fn apply_patch_water_to_trays(
    ctx: &ReducerContext,
    unit_key: &str,
    patch_x: f32,
    patch_z: f32,
    dump_liters: f32,
) {
    let current_tray_ids: std::collections::HashSet<String> =
        resolve_tray_placements(ctx, unit_key)
            .into_iter()
            .map(|p| p.tray_id)
            .collect();
    let tray_table = ctx.db.balcony_grow_tray();
    let trays: Vec<BalconyGrowTray> = tray_table
        .iter()
        .filter(|t| t.unit_key == unit_key && current_tray_ids.contains(t.tray_id.as_str()))
        .collect();
    if trays.is_empty() {
        return;
    }
    let radius_sq = BALCONY_WATER_PATCH_RADIUS_M * BALCONY_WATER_PATCH_RADIUS_M;
    let in_range: Vec<usize> = trays
        .iter()
        .enumerate()
        .filter(|(_, t)| {
            let dx = t.pos_x - patch_x;
            let dz = t.pos_z - patch_z;
            dx * dx + dz * dz <= radius_sq
        })
        .map(|(i, _)| i)
        .collect();
    if in_range.is_empty() {
        return;
    }
    let share = dump_liters / in_range.len() as f32;
    for idx in in_range {
        let key = trays[idx].row_key.clone();
        let Some(mut tray) = tray_table.row_key().find(&key) else {
            continue;
        };
        tray.water_liters = (tray.water_liters + share).min(BALCONY_GROW_TRAY_MAX_WATER_L);
        tray.dry_ticks = 0;
        tray_table.row_key().update(tray);
    }
}

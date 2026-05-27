//! Player work orders — first extraction on elevator deck 16 (`levelIndex` 17).
//! Constants stay in sync with `packages/schemas/src/playerMissions.ts`.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments;
use crate::crafting::emit_hud_notice;
use crate::dropped_item;
use crate::elevator_layout::{BUILDING_ORIGIN_Y, STOREY_SPACING_M};
use crate::game_time::SleepRolloverKind;
use crate::inventory::{inventory_item};
use crate::inventory_models::{ItemLocation, StashLocationData};

const FOOTLOCKER_STASH_KIND: &str = "footlocker";

pub(crate) const FIRST_EXTRACTION_MISSION_ID: &str = "work_order_fuse_wire_16e4";
pub(crate) const FIRST_EXTRACTION_ITEM_DEF_ID: &str = "fuse-wire-pack";
pub(crate) const FIRST_EXTRACTION_ELEVATOR_DECK: u32 = 16;
pub(crate) const FIRST_EXTRACTION_LEVEL_INDEX: u32 = FIRST_EXTRACTION_ELEVATOR_DECK + 1;

/// Reserved `world_spawn_slot` range — excluded from periodic world-loot refresh deletes.
pub(crate) const MISSION_WORLD_SPAWN_SLOT_MIN: u16 = 61_000;
pub(crate) const FIRST_EXTRACTION_LOOT_SLOT: u16 = MISSION_WORLD_SPAWN_SLOT_MIN;

const FIRST_EXTRACTION_LOOT_X: f32 = 1.05;
const FIRST_EXTRACTION_LOOT_Z: f32 = -4.5;
const WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M: f32 = 0.28;

pub(crate) const MISSION_STATUS_OFFERED: u8 = 0;
pub(crate) const MISSION_STATUS_ACTIVE: u8 = 1;
pub(crate) const MISSION_STATUS_COLLECTED: u8 = 2;
pub(crate) const MISSION_STATUS_COMPLETE: u8 = 3;
pub(crate) const MISSION_STATUS_FAILED: u8 = 4;

#[spacetimedb::table(public, accessor = player_mission_progress)]
pub struct PlayerMissionProgress {
    #[primary_key]
    pub identity: Identity,
    /// Empty when no mission is slotted (post-first completion).
    pub active_mission_id: String,
    pub status: u8,
    #[default(false)]
    pub item_collected: bool,
    #[default(false)]
    pub item_deposited: bool,
    #[default(false)]
    pub first_extraction_complete: bool,
}

#[inline]
const fn building_plate_world_y(level: u32) -> f32 {
    let lv = if level < 1 { 1 } else { level };
    BUILDING_ORIGIN_Y + (lv as f32 - 1.0) * STOREY_SPACING_M
}

fn first_extraction_loot_world_y() -> f32 {
    building_plate_world_y(FIRST_EXTRACTION_LEVEL_INDEX) + WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M
}

fn mission_row(ctx: &ReducerContext, owner: Identity) -> Option<PlayerMissionProgress> {
    ctx.db
        .player_mission_progress()
        .identity()
        .find(&owner)
}

fn update_mission_row(ctx: &ReducerContext, row: PlayerMissionProgress) {
    ctx.db.player_mission_progress().identity().update(row);
}

fn first_extraction_active(row: &PlayerMissionProgress) -> bool {
    row.active_mission_id == FIRST_EXTRACTION_MISSION_ID
        && row.status >= MISSION_STATUS_OFFERED
        && row.status <= MISSION_STATUS_COLLECTED
}

pub(crate) fn ensure_player_mission_progress(ctx: &ReducerContext, owner: Identity) {
    if mission_row(ctx, owner).is_some() {
        refresh_first_extraction_loot(ctx, owner);
        return;
    }

    let row = PlayerMissionProgress {
        identity: owner,
        active_mission_id: FIRST_EXTRACTION_MISSION_ID.to_string(),
        status: MISSION_STATUS_ACTIVE,
        item_collected: false,
        item_deposited: false,
        first_extraction_complete: false,
    };
    let _ = ctx.db.player_mission_progress().insert(row);
    spawn_first_extraction_loot(ctx);
    emit_hud_notice(
        ctx,
        owner,
        "Work order: retrieve the fuse wire pack from deck 16 (16-E-4). Stash it in your footlocker before the day ends — or pass out at home while carrying it.".to_string(),
    );
}

fn spawn_first_extraction_loot(ctx: &ReducerContext) {
    if dropped_item::mission_loot_slot_exists(ctx, FIRST_EXTRACTION_LOOT_SLOT) {
        return;
    }
    dropped_item::insert_mission_loot_row(
        ctx,
        FIRST_EXTRACTION_LOOT_SLOT,
        FIRST_EXTRACTION_ITEM_DEF_ID,
        1,
        FIRST_EXTRACTION_LOOT_X,
        first_extraction_loot_world_y(),
        FIRST_EXTRACTION_LOOT_Z,
    );
}

fn refresh_first_extraction_loot(ctx: &ReducerContext, owner: Identity) {
    let Some(row) = mission_row(ctx, owner) else {
        return;
    };
    if row.first_extraction_complete || row.item_collected {
        return;
    }
    if !first_extraction_active(&row) {
        return;
    }
    spawn_first_extraction_loot(ctx);
}

fn clear_first_extraction_world_loot(ctx: &ReducerContext) {
    dropped_item::delete_mission_loot_by_slot(ctx, FIRST_EXTRACTION_LOOT_SLOT);
}

fn player_carrier_quantity(ctx: &ReducerContext, owner: Identity, def_id: &str) -> u32 {
    ctx.db
        .inventory_item()
        .iter()
        .filter_map(|row| {
            let carrier = match &row.location {
                ItemLocation::Inventory(d) if d.owner_id == owner => true,
                ItemLocation::Hotbar(d) if d.owner_id == owner => true,
                _ => false,
            };
            if carrier && row.def_id == def_id {
                Some(row.quantity)
            } else {
                None
            }
        })
        .sum()
}

fn player_footlocker_quantity(ctx: &ReducerContext, owner: Identity, def_id: &str) -> u32 {
    let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, owner) else {
        return 0;
    };
    let footlocker_key = apartments::footlocker_stash_location_key(ctx, &unit_key);
    ctx.db
        .inventory_item()
        .iter()
        .filter_map(|row| {
            let ItemLocation::Stash(StashLocationData {
                owner_identity,
                unit_key: stash_key,
                ..
            }) = &row.location
            else {
                return None;
            };
            if *owner_identity != owner {
                return None;
            }
            if !crate::apartment_stash_location_match::apartment_stash_locations_match(
                ctx,
                stash_key,
                &footlocker_key,
            ) {
                return None;
            }
            if row.def_id == def_id {
                Some(row.quantity)
            } else {
                None
            }
        })
        .sum()
}

fn mark_first_extraction_collected(ctx: &ReducerContext, owner: Identity) {
    let Some(mut row) = mission_row(ctx, owner) else {
        return;
    };
    if !first_extraction_active(&row) || row.item_collected {
        return;
    }
    row.item_collected = true;
    row.status = MISSION_STATUS_COLLECTED;
    update_mission_row(ctx, row);
    emit_hud_notice(
        ctx,
        owner,
        "Fuse wire pack secured. Get it into your footlocker before the day ends — or pass out at home while carrying it.".to_string(),
    );
}

fn complete_first_extraction(
    ctx: &ReducerContext,
    owner: Identity,
    deposited: bool,
    notice: &str,
) {
    let Some(mut row) = mission_row(ctx, owner) else {
        return;
    };
    if row.first_extraction_complete || row.status == MISSION_STATUS_COMPLETE {
        return;
    }
    if !first_extraction_active(&row) && row.status != MISSION_STATUS_COLLECTED {
        return;
    }
    row.item_collected = true;
    row.item_deposited = deposited;
    row.status = MISSION_STATUS_COMPLETE;
    row.first_extraction_complete = true;
    row.active_mission_id.clear();
    update_mission_row(ctx, row);
    clear_first_extraction_world_loot(ctx);
    emit_hud_notice(ctx, owner, notice.to_string());
}

fn fail_first_extraction(ctx: &ReducerContext, owner: Identity, notice: &str) {
    let Some(mut row) = mission_row(ctx, owner) else {
        return;
    };
    if row.first_extraction_complete || row.status == MISSION_STATUS_COMPLETE {
        return;
    };
    if !first_extraction_active(&row) && row.status != MISSION_STATUS_COLLECTED {
        return;
    }
    row.status = MISSION_STATUS_ACTIVE;
    row.item_collected = false;
    row.item_deposited = false;
    row.active_mission_id = FIRST_EXTRACTION_MISSION_ID.to_string();
    update_mission_row(ctx, row);
    clear_first_extraction_world_loot(ctx);
    emit_hud_notice(ctx, owner, notice.to_string());
    spawn_first_extraction_loot(ctx);
    emit_hud_notice(
        ctx,
        owner,
        "Work order reissued — fuse wire pack, deck 16 (16-E-4).".to_string(),
    );
}

pub(crate) fn on_mission_item_pickup(ctx: &ReducerContext, owner: Identity, def_id: &str) {
    if def_id != FIRST_EXTRACTION_ITEM_DEF_ID {
        return;
    }
    mark_first_extraction_collected(ctx, owner);
}

pub(crate) fn on_mission_stash_push(
    ctx: &ReducerContext,
    owner: Identity,
    stash_kind: &str,
    moved_def_id: &str,
) {
    if stash_kind != FOOTLOCKER_STASH_KIND || moved_def_id != FIRST_EXTRACTION_ITEM_DEF_ID {
        return;
    }
    let Some(row) = mission_row(ctx, owner) else {
        return;
    };
    if !first_extraction_active(&row) && row.status != MISSION_STATUS_COLLECTED {
        return;
    }
    if player_footlocker_quantity(ctx, owner, FIRST_EXTRACTION_ITEM_DEF_ID) == 0 {
        return;
    }
    complete_first_extraction(
        ctx,
        owner,
        true,
        "Fuse wire pack stashed. Rada will send someone when shift turns.",
    );
}

pub(crate) fn sync_mission_progress_from_inventory(ctx: &ReducerContext, owner: Identity) {
    let Some(row) = mission_row(ctx, owner) else {
        return;
    };
    if row.first_extraction_complete {
        return;
    }
    if player_footlocker_quantity(ctx, owner, FIRST_EXTRACTION_ITEM_DEF_ID) > 0 {
        complete_first_extraction(
            ctx,
            owner,
            true,
            "Fuse wire pack stashed. Rada will send someone when shift turns.",
        );
        return;
    }
    if first_extraction_active(&row)
        && !row.item_collected
        && player_carrier_quantity(ctx, owner, FIRST_EXTRACTION_ITEM_DEF_ID) > 0
    {
        mark_first_extraction_collected(ctx, owner);
    }
}

pub(crate) fn evaluate_mission_before_day_rollover(
    ctx: &ReducerContext,
    owner: Identity,
    kind: SleepRolloverKind,
) {
    let Some(row) = mission_row(ctx, owner) else {
        return;
    };
    if row.first_extraction_complete || row.status == MISSION_STATUS_COMPLETE {
        return;
    };
    if !first_extraction_active(&row) && row.status != MISSION_STATUS_COLLECTED {
        return;
    }

    if player_footlocker_quantity(ctx, owner, FIRST_EXTRACTION_ITEM_DEF_ID) > 0 {
        complete_first_extraction(
            ctx,
            owner,
            true,
            "Fuse wire pack stashed. Rada will send someone when shift turns.",
        );
        return;
    }

    let carrying = player_carrier_quantity(ctx, owner, FIRST_EXTRACTION_ITEM_DEF_ID) > 0;
    let inside_home = apartments::player_feet_inside_owned_apartment(ctx, owner);

    if kind == SleepRolloverKind::Collapse && inside_home && carrying {
        complete_first_extraction(
            ctx,
            owner,
            false,
            "You passed out at home with the fuse wire pack. Rada will hear about it.",
        );
        return;
    }

    if carrying {
        fail_first_extraction(
            ctx,
            owner,
            "Day ended — you still had the fuse wire pack on you. Stash it in the footlocker next time.",
        );
        return;
    }

    fail_first_extraction(
        ctx,
        owner,
        "Day ended — fuse wire pack still out on deck 16.",
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_extraction_level_index_matches_elevator_deck() {
        assert_eq!(FIRST_EXTRACTION_LEVEL_INDEX, 17);
    }

    #[test]
    fn mission_loot_slot_is_outside_world_loot_refresh_range() {
        assert!(FIRST_EXTRACTION_LOOT_SLOT >= MISSION_WORLD_SPAWN_SLOT_MIN);
    }
}

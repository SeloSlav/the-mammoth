//! Data-driven survival loadout for new players (`ensure_starter_loadout`) and respawn (`reset_player_loadout_for_respawn`).
//!
//! Hotbar: `starter_hotbar!(slot, "def_id", qty)`.
//! Footlocker grow-op: `starter_footlocker!(slot, "def_id", qty)`.
//!
//! Catalog keys must match `content/items/catalog` `id` fields.

use log;
use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartment_stash_rules::apartment_stash_slot_index_valid;
use crate::apartments;
use crate::inventory_models::{
    HotbarLocationData, ItemLocation, StashLocationData, APARTMENT_STASH_KIND_FOOTLOCKER,
};
use crate::items_catalog;

use super::{
    delete_all_player_inventory_and_hotbar_items, find_item_in_stash_slot, inventory_item,
    player_item_count, InventoryItem, NUM_PLAYER_HOTBAR_SLOTS,
};

#[derive(Copy, Clone)]
enum StarterPlacement {
    Hotbar(u8),
}

struct StarterRow {
    def_id: &'static str,
    quantity: u32,
    placement: StarterPlacement,
}

struct FootlockerStarterRow {
    def_id: &'static str,
    quantity: u32,
    slot_index: u16,
}

macro_rules! starter_hotbar {
    ($slot:literal, $def:literal, $qty:literal) => {
        StarterRow {
            def_id: $def,
            quantity: $qty,
            placement: StarterPlacement::Hotbar($slot),
        }
    };
}

macro_rules! starter_footlocker {
    ($slot:literal, $def:literal, $qty:literal) => {
        FootlockerStarterRow {
            def_id: $def,
            quantity: $qty,
            slot_index: $slot,
        }
    };
}

/// Survival loadout: screwdriver tool — door lock is crafted only.
const SURVIVAL_SPAWN_LOADOUT: &[StarterRow] = &[
    starter_hotbar!(0, "screwdriver", 1),
];

/// One-time balcony grow-op pack seeded into the apartment footlocker stash (normal `ItemLocation::Stash` rows).
const FOOTLOCKER_GROW_OP_STARTER: &[FootlockerStarterRow] = &[
    starter_footlocker!(0, "balcony-grow-substrate", 6),
    starter_footlocker!(1, "parsley-seeds", 3),
    starter_footlocker!(2, "dill-seeds", 3),
    starter_footlocker!(3, "radish-sprout-seeds", 4),
    starter_footlocker!(4, "green-onion-sets", 4),
    starter_footlocker!(5, "scented-geranium-cuttings", 2),
    starter_footlocker!(6, "lovage-seeds", 2),
];

fn validate_survival_loadout(_ctx: &ReducerContext) -> bool {
    for row in SURVIVAL_SPAWN_LOADOUT {
        if !items_catalog::is_known_def(row.def_id) {
            log::error!("survival loadout: catalog missing {}", row.def_id);
            return false;
        }
        match row.placement {
            StarterPlacement::Hotbar(slot_index) if slot_index >= NUM_PLAYER_HOTBAR_SLOTS => {
                log::error!("survival loadout: hotbar slot {slot_index} out of range");
                return false;
            }
            _ => {}
        }
        if row.quantity == 0 {
            log::error!("survival loadout: quantity 0 for {}", row.def_id);
            return false;
        }
    }
    true
}

fn validate_footlocker_grow_op_starter(_ctx: &ReducerContext) -> bool {
    for row in FOOTLOCKER_GROW_OP_STARTER {
        if !items_catalog::is_known_def(row.def_id) {
            log::error!("footlocker grow-op starter: catalog missing {}", row.def_id);
            return false;
        }
        if !apartment_stash_slot_index_valid(APARTMENT_STASH_KIND_FOOTLOCKER, row.slot_index) {
            log::error!(
                "footlocker grow-op starter: slot {} out of range for {}",
                row.slot_index,
                row.def_id
            );
            return false;
        }
        if row.quantity == 0 {
            log::error!("footlocker grow-op starter: quantity 0 for {}", row.def_id);
            return false;
        }
    }
    true
}

fn footlocker_grow_op_starter_already_granted(
    ctx: &ReducerContext,
    owner: Identity,
    stash_location_key: &str,
) -> bool {
    find_item_in_stash_slot(ctx, owner, stash_location_key, 0).is_some()
}

fn insert_footlocker_grow_op_starter(
    ctx: &ReducerContext,
    owner: Identity,
    stash_location_key: &str,
) {
    for row in FOOTLOCKER_GROW_OP_STARTER {
        let _ = ctx.db.inventory_item().insert(InventoryItem {
            instance_id: 0,
            def_id: row.def_id.to_string(),
            quantity: row.quantity,
            location: ItemLocation::Stash(StashLocationData {
                owner_identity: owner,
                unit_key: stash_location_key.to_string(),
                slot_index: row.slot_index,
            }),
        });
    }
}

/// One-time footlocker seed + substrate pack for the player's claimed apartment.
pub(crate) fn ensure_starter_footlocker_grow_op(ctx: &ReducerContext, owner: Identity) {
    if !validate_footlocker_grow_op_starter(ctx) {
        return;
    }
    let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, owner) else {
        log::debug!("ensure_starter_footlocker_grow_op: no claimed unit for {owner}");
        return;
    };
    let stash_location_key = apartments::footlocker_stash_location_key(ctx, unit_key.as_str());
    if footlocker_grow_op_starter_already_granted(ctx, owner, stash_location_key.as_str()) {
        return;
    }
    insert_footlocker_grow_op_starter(ctx, owner, stash_location_key.as_str());
}

fn insert_survival_loadout(ctx: &ReducerContext, owner: Identity) {
    for row in SURVIVAL_SPAWN_LOADOUT {
        let location = match row.placement {
            StarterPlacement::Hotbar(slot_index) => ItemLocation::Hotbar(HotbarLocationData {
                owner_id: owner,
                slot_index,
            }),
        };
        let _ = ctx.db.inventory_item().insert(InventoryItem {
            instance_id: 0,
            def_id: row.def_id.to_string(),
            quantity: row.quantity,
            location,
        });
    }
}

/// Spawn loadout for players with no inventory rows yet (first join).
pub(crate) fn ensure_starter_loadout(ctx: &ReducerContext, owner: Identity) {
    if player_item_count(ctx, owner) > 0 {
        return;
    }
    if !validate_survival_loadout(ctx) {
        return;
    }
    insert_survival_loadout(ctx, owner);
}

/// On respawn: strip hotbar + backpack and re-grant survival items only.
pub(crate) fn reset_player_loadout_for_respawn(ctx: &ReducerContext, owner: Identity) {
    if !validate_survival_loadout(ctx) {
        return;
    }
    delete_all_player_inventory_and_hotbar_items(ctx, owner);
    insert_survival_loadout(ctx, owner);
}

#[cfg(test)]
mod tests {
    use super::FOOTLOCKER_GROW_OP_STARTER;

    #[test]
    fn footlocker_grow_op_starter_uses_unique_slots() {
        let mut seen = std::collections::HashSet::new();
        for row in FOOTLOCKER_GROW_OP_STARTER {
            assert!(
                seen.insert(row.slot_index),
                "duplicate footlocker slot {}",
                row.slot_index
            );
        }
    }
}

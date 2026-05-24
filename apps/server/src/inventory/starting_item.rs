//! Data-driven survival loadout for new players (`ensure_starter_loadout`) and respawn (`reset_player_loadout_for_respawn`).
//!
//! Hotbar: `starter_hotbar!(slot, "def_id", qty)`.
//! Footlocker grow-op: `starter_footlocker!(slot, "def_id", qty)`.
//! Fridge pantry: `starter_fridge!(slot, "def_id", qty)`.
//!
//! Catalog keys must match `content/items/catalog` `id` fields.

use log;
use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartment_stash_rules::apartment_stash_slot_index_valid;
use crate::apartments;
use crate::inventory_models::{
    HotbarLocationData, ItemLocation, StashLocationData, APARTMENT_STASH_KIND_FOOTLOCKER,
    APARTMENT_STASH_KIND_FRIDGE,
};
use crate::items_catalog;
use crate::water_container;

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

struct ApartmentStashStarterRow {
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
        ApartmentStashStarterRow {
            def_id: $def,
            quantity: $qty,
            slot_index: $slot,
        }
    };
}

macro_rules! starter_fridge {
    ($slot:literal, $def:literal, $qty:literal) => {
        ApartmentStashStarterRow {
            def_id: $def,
            quantity: $qty,
            slot_index: $slot,
        }
    };
}

/// Survival loadout: screwdriver tool — door lock is crafted only.
const SURVIVAL_SPAWN_LOADOUT: &[StarterRow] = &[starter_hotbar!(0, "screwdriver", 1)];

/// One-time balcony grow-op pack in the footlocker.
/// Substrate is scarce on purpose — fish-tank feed and harvest seed returns sustain the loop.
const FOOTLOCKER_GROW_OP_STARTER: &[ApartmentStashStarterRow] = &[
    starter_footlocker!(0, "balcony-grow-substrate", 3),
    starter_footlocker!(1, "parsley-seeds", 2),
    starter_footlocker!(2, "dill-seeds", 2),
    starter_footlocker!(3, "radish-sprout-seeds", 3),
    starter_footlocker!(4, "green-onion-sets", 3),
    starter_footlocker!(5, "scented-geranium-cuttings", 2),
];

/// One-time pantry in the fridge — enough to eat/drink before leaving; apartment filter refills bottles.
const FRIDGE_STARTER: &[ApartmentStashStarterRow] = &[
    starter_fridge!(0, "apple", 4),
    starter_fridge!(1, "water-bottle", 1),
    starter_fridge!(2, "water-bottle", 1),
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

fn validate_apartment_stash_starter(
    label: &str,
    stash_kind: &str,
    rows: &[ApartmentStashStarterRow],
) -> bool {
    for row in rows {
        if !items_catalog::is_known_def(row.def_id) {
            log::error!("{label}: catalog missing {}", row.def_id);
            return false;
        }
        if !apartment_stash_slot_index_valid(stash_kind, row.slot_index) {
            log::error!(
                "{label}: slot {} out of range for {}",
                row.slot_index,
                row.def_id
            );
            return false;
        }
        if row.quantity == 0 {
            log::error!("{label}: quantity 0 for {}", row.def_id);
            return false;
        }
    }
    true
}

fn validate_footlocker_grow_op_starter(_ctx: &ReducerContext) -> bool {
    validate_apartment_stash_starter(
        "footlocker grow-op starter",
        APARTMENT_STASH_KIND_FOOTLOCKER,
        FOOTLOCKER_GROW_OP_STARTER,
    )
}

fn validate_fridge_starter(_ctx: &ReducerContext) -> bool {
    validate_apartment_stash_starter(
        "fridge starter",
        APARTMENT_STASH_KIND_FRIDGE,
        FRIDGE_STARTER,
    )
}

fn apartment_stash_starter_already_granted(
    ctx: &ReducerContext,
    owner: Identity,
    stash_location_key: &str,
) -> bool {
    find_item_in_stash_slot(ctx, owner, stash_location_key, 0).is_some()
}

fn insert_apartment_stash_starter(
    ctx: &ReducerContext,
    owner: Identity,
    stash_location_key: &str,
    rows: &[ApartmentStashStarterRow],
) {
    for row in rows {
        let inserted = ctx.db.inventory_item().insert(InventoryItem {
            instance_id: 0,
            def_id: row.def_id.to_string(),
            quantity: row.quantity,
            location: ItemLocation::Stash(StashLocationData {
                owner_identity: owner,
                unit_key: stash_location_key.to_string(),
                slot_index: row.slot_index,
            }),
        });
        water_container::on_water_bottle_inventory_inserted(ctx, &inserted);
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
    if apartment_stash_starter_already_granted(ctx, owner, stash_location_key.as_str()) {
        return;
    }
    insert_apartment_stash_starter(
        ctx,
        owner,
        stash_location_key.as_str(),
        FOOTLOCKER_GROW_OP_STARTER,
    );
}

/// One-time fridge pantry for the player's claimed apartment.
pub(crate) fn ensure_starter_fridge(ctx: &ReducerContext, owner: Identity) {
    if !validate_fridge_starter(ctx) {
        return;
    }
    let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, owner) else {
        log::debug!("ensure_starter_fridge: no claimed unit for {owner}");
        return;
    };
    let stash_location_key = apartments::fridge_stash_location_key(ctx, unit_key.as_str());
    if apartment_stash_starter_already_granted(ctx, owner, stash_location_key.as_str()) {
        return;
    }
    insert_apartment_stash_starter(ctx, owner, stash_location_key.as_str(), FRIDGE_STARTER);
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
    use super::{FOOTLOCKER_GROW_OP_STARTER, FRIDGE_STARTER};

    fn assert_unique_stash_slots(label: &str, rows: &[super::ApartmentStashStarterRow]) {
        let mut seen = std::collections::HashSet::new();
        for row in rows {
            assert!(
                seen.insert(row.slot_index),
                "duplicate {label} slot {}",
                row.slot_index
            );
        }
    }

    #[test]
    fn footlocker_grow_op_starter_uses_unique_slots() {
        assert_unique_stash_slots("footlocker", FOOTLOCKER_GROW_OP_STARTER);
    }

    #[test]
    fn fridge_starter_uses_unique_slots() {
        assert_unique_stash_slots("fridge", FRIDGE_STARTER);
    }

    #[test]
    fn footlocker_starter_substrate_is_scarce_vs_seed_count() {
        let substrate: u32 = FOOTLOCKER_GROW_OP_STARTER
            .iter()
            .filter(|r| r.def_id == "balcony-grow-substrate")
            .map(|r| r.quantity)
            .sum();
        let seed_packets: u32 = FOOTLOCKER_GROW_OP_STARTER
            .iter()
            .filter(|r| r.def_id != "balcony-grow-substrate")
            .map(|r| r.quantity)
            .sum();
        assert_eq!(
            substrate, 3,
            "three tray-cycles of compost — fish tank renews"
        );
        assert!(
            seed_packets > substrate,
            "seeds should outlast starter compost to teach the renewal loop"
        );
    }
}

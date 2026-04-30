//! Data-driven survival loadout for new players (`ensure_starter_loadout`) and respawn (`reset_player_loadout_for_respawn`).
//!
//! Hotbar: `starter_hotbar!(slot, "def_id", qty)`.
//!
//! Catalog keys must match `content/items/catalog` `id` fields.

use log;
use spacetimedb::{Identity, ReducerContext, Table};

use crate::inventory_models::{HotbarLocationData, ItemLocation};
use crate::items_catalog;

use super::{
    delete_all_player_inventory_and_hotbar_items, inventory_item, player_item_count, InventoryItem,
    NUM_PLAYER_HOTBAR_SLOTS,
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

macro_rules! starter_hotbar {
    ($slot:literal, $def:literal, $qty:literal) => {
        StarterRow {
            def_id: $def,
            quantity: $qty,
            placement: StarterPlacement::Hotbar($slot),
        }
    };
}

/// Survival loadout: screwdriver, door lock, food, water — no weapons or ammo.
const SURVIVAL_SPAWN_LOADOUT: &[StarterRow] = &[
    starter_hotbar!(0, "screwdriver", 1),
    starter_hotbar!(1, "door-lock", 1),
    starter_hotbar!(2, "apple", 4),
    starter_hotbar!(3, "water-bottle", 4),
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

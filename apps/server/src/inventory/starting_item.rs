//! Data-driven starter items for brand-new players (`ensure_starter_loadout`).
//!
//! Hotbar: `starter_hotbar!(slot, "def_id", qty)`.
//! Backpack: `starter_inventory!(slot_index, "def_id", qty)` (`u16` slot for `InventoryLocationData`).
//!
//! Catalog keys must match `content/items/catalog` `id` fields.

use log;
use spacetimedb::{Identity, ReducerContext, Table};

use crate::inventory_models::{HotbarLocationData, InventoryLocationData, ItemLocation};
use crate::items_catalog;

use super::{inventory_item, player_item_count, InventoryItem, NUM_PLAYER_HOTBAR_SLOTS};

#[derive(Copy, Clone)]
enum StarterPlacement {
    Hotbar(u8),
    Inventory(u16),
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

macro_rules! starter_inventory {
    ($slot:literal, $def:literal, $qty:literal) => {
        StarterRow {
            def_id: $def,
            quantity: $qty,
            placement: StarterPlacement::Inventory($slot),
        }
    };
}

/// Spawn loadout for players with no inventory rows yet.
const STARTER_LOADOUT: &[StarterRow] = &[
    starter_hotbar!(0, "pistol", 1),
    starter_hotbar!(1, "crowbar", 1),
    starter_hotbar!(2, "ammo-9mm", 24),
    starter_hotbar!(3, "door-lock", 1),
    starter_hotbar!(4, "screwdriver", 1),
    starter_hotbar!(5, "apple", 4),
    // Backpack: shotgun + shells (catalog `ammo-shotgun-shell`; slugs are a different ammo type IRL).
    starter_inventory!(0, "shotgun-coach", 1),
    starter_inventory!(1, "ammo-shotgun-shell", 24),
];

pub(crate) fn ensure_starter_loadout(ctx: &ReducerContext, owner: Identity) {
    if player_item_count(ctx, owner) > 0 {
        return;
    }
    for row in STARTER_LOADOUT {
        if !items_catalog::is_known_def(row.def_id) {
            log::error!("starter loadout: catalog missing {}", row.def_id);
            return;
        }
        match row.placement {
            StarterPlacement::Hotbar(slot_index) if slot_index >= NUM_PLAYER_HOTBAR_SLOTS => {
                log::error!("starter loadout: hotbar slot {slot_index} out of range");
                return;
            }
            _ => {}
        }
        if row.quantity == 0 {
            log::error!("starter loadout: quantity 0 for {}", row.def_id);
            return;
        }
    }

    for row in STARTER_LOADOUT {
        let location = match row.placement {
            StarterPlacement::Hotbar(slot_index) => ItemLocation::Hotbar(HotbarLocationData {
                owner_id: owner,
                slot_index,
            }),
            StarterPlacement::Inventory(slot_index) => {
                ItemLocation::Inventory(InventoryLocationData {
                    owner_id: owner,
                    slot_index,
                })
            }
        };
        let _ = ctx.db.inventory_item().insert(InventoryItem {
            instance_id: 0,
            def_id: row.def_id.to_string(),
            quantity: row.quantity,
            location,
        });
    }
}

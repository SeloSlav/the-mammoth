//! Apartment furniture stash capacity and item-category rules.
//! Keep in sync with `packages/schemas/src/apartmentStashRules.ts`.

use crate::inventory_models::{
    APARTMENT_STASH_KIND_FISH_TANK, APARTMENT_STASH_KIND_FOOTLOCKER, APARTMENT_STASH_KIND_FRIDGE,
    APARTMENT_STASH_KIND_GROW_TRAY, APARTMENT_STASH_KIND_STOVE, APARTMENT_STASH_KIND_WARDROBE,
    APARTMENT_STASH_KIND_WATER_TANK,
};
use crate::items_catalog::{self, ItemCategory};

/// Hard cap for any apartment stash row index (legacy DB headroom).
pub(crate) const APARTMENT_STASH_SLOT_INDEX_MAX: u16 = 24;

const WATER_TANK_ALLOWED_DEF_IDS: &[&str] = &["water-bottle"];
const GROW_TRAY_ALLOWED_DEF_IDS: &[&str] = &["balcony-grow-substrate"];

pub(crate) fn apartment_stash_slot_count(stash_kind: &str) -> u16 {
    match stash_kind {
        APARTMENT_STASH_KIND_FOOTLOCKER => 24,
        APARTMENT_STASH_KIND_WARDROBE => 10,
        APARTMENT_STASH_KIND_STOVE => 3,
        APARTMENT_STASH_KIND_FRIDGE => 14,
        APARTMENT_STASH_KIND_WATER_TANK => 1,
        APARTMENT_STASH_KIND_FISH_TANK => 1,
        APARTMENT_STASH_KIND_GROW_TRAY => 1,
        _ => 24,
    }
}

#[inline]
pub(crate) fn apartment_stash_slot_index_valid(stash_kind: &str, slot_index: u16) -> bool {
    slot_index < apartment_stash_slot_count(stash_kind)
}

/// Whether a catalog item may enter this stash from player inventory/hotbar.
pub(crate) fn apartment_stash_accepts_item_category(
    stash_kind: &str,
    category: ItemCategory,
) -> bool {
    match stash_kind {
        APARTMENT_STASH_KIND_FOOTLOCKER => true,
        APARTMENT_STASH_KIND_WARDROBE => matches!(
            category,
            ItemCategory::Weapon | ItemCategory::Ammo | ItemCategory::Tool | ItemCategory::Utility
        ),
        APARTMENT_STASH_KIND_FRIDGE | APARTMENT_STASH_KIND_STOVE => {
            category == ItemCategory::Consumable
        }
        APARTMENT_STASH_KIND_WATER_TANK => false,
        APARTMENT_STASH_KIND_FISH_TANK => false,
        APARTMENT_STASH_KIND_GROW_TRAY => false,
        _ => false,
    }
}

pub(crate) fn apartment_stash_rejection_hint(stash_kind: &str) -> &'static str {
    match stash_kind {
        APARTMENT_STASH_KIND_WARDROBE => {
            "Wardrobe only holds weapons, ammo, tools, and utility gear."
        }
        APARTMENT_STASH_KIND_FRIDGE => "Fridge only holds food and consumables.",
        APARTMENT_STASH_KIND_STOVE => "Stove only holds food (for now).",
        APARTMENT_STASH_KIND_WATER_TANK => "Water tank only holds a water bottle.",
        APARTMENT_STASH_KIND_FISH_TANK => "Fish tank only holds food for the fish.",
        APARTMENT_STASH_KIND_GROW_TRAY => "Grow tray only holds balcony substrate fertilizer.",
        _ => "This item cannot go in this storage.",
    }
}

pub(crate) fn apartment_stash_accepts_def_id(stash_kind: &str, def_id: &str) -> bool {
    if stash_kind == APARTMENT_STASH_KIND_WATER_TANK {
        return WATER_TANK_ALLOWED_DEF_IDS.contains(&def_id);
    }
    if stash_kind == APARTMENT_STASH_KIND_GROW_TRAY {
        return GROW_TRAY_ALLOWED_DEF_IDS.contains(&def_id);
    }
    if stash_kind == APARTMENT_STASH_KIND_FISH_TANK {
        return crate::fish_tank::is_fish_tank_feed_def_id(def_id);
    }
    if stash_kind == APARTMENT_STASH_KIND_FRIDGE && def_id == "water-bottle" {
        return true;
    }
    let Some(item) = items_catalog::get(def_id) else {
        return false;
    };
    apartment_stash_accepts_item_category(stash_kind, item.category)
}

#[cfg(test)]
mod tests {
    use super::{
        apartment_stash_accepts_def_id, apartment_stash_accepts_item_category,
        apartment_stash_slot_count, apartment_stash_slot_index_valid,
    };
    use crate::inventory_models::{
        APARTMENT_STASH_KIND_FISH_TANK, APARTMENT_STASH_KIND_FOOTLOCKER,
        APARTMENT_STASH_KIND_FRIDGE, APARTMENT_STASH_KIND_GROW_TRAY, APARTMENT_STASH_KIND_STOVE,
        APARTMENT_STASH_KIND_WARDROBE, APARTMENT_STASH_KIND_WATER_TANK,
    };
    use crate::items_catalog::ItemCategory;

    #[test]
    fn slot_counts_match_client_schema() {
        assert_eq!(
            apartment_stash_slot_count(APARTMENT_STASH_KIND_FOOTLOCKER),
            24
        );
        assert_eq!(
            apartment_stash_slot_count(APARTMENT_STASH_KIND_WARDROBE),
            10
        );
        assert_eq!(apartment_stash_slot_count(APARTMENT_STASH_KIND_STOVE), 3);
        assert_eq!(apartment_stash_slot_count(APARTMENT_STASH_KIND_FRIDGE), 14);
        assert_eq!(
            apartment_stash_slot_count(APARTMENT_STASH_KIND_WATER_TANK),
            1
        );
        assert_eq!(
            apartment_stash_slot_count(APARTMENT_STASH_KIND_FISH_TANK),
            1
        );
        assert_eq!(
            apartment_stash_slot_count(APARTMENT_STASH_KIND_GROW_TRAY),
            1
        );
    }

    #[test]
    fn stove_slot_three_is_out_of_range() {
        assert!(apartment_stash_slot_index_valid(
            APARTMENT_STASH_KIND_STOVE,
            2
        ));
        assert!(!apartment_stash_slot_index_valid(
            APARTMENT_STASH_KIND_STOVE,
            3
        ));
    }

    #[test]
    fn category_rules_match_design() {
        assert!(apartment_stash_accepts_item_category(
            APARTMENT_STASH_KIND_FOOTLOCKER,
            ItemCategory::Resource
        ));
        assert!(apartment_stash_accepts_item_category(
            APARTMENT_STASH_KIND_WARDROBE,
            ItemCategory::Weapon
        ));
        assert!(!apartment_stash_accepts_item_category(
            APARTMENT_STASH_KIND_WARDROBE,
            ItemCategory::Consumable
        ));
        assert!(apartment_stash_accepts_item_category(
            APARTMENT_STASH_KIND_FRIDGE,
            ItemCategory::Consumable
        ));
        assert!(!apartment_stash_accepts_item_category(
            APARTMENT_STASH_KIND_STOVE,
            ItemCategory::Tool
        ));
    }

    #[test]
    fn fridge_accepts_water_bottle_tool() {
        assert!(apartment_stash_accepts_def_id(
            APARTMENT_STASH_KIND_FRIDGE,
            "water-bottle"
        ));
    }

    #[test]
    fn grow_tray_accepts_substrate_only() {
        assert!(apartment_stash_accepts_def_id(
            APARTMENT_STASH_KIND_GROW_TRAY,
            "balcony-grow-substrate"
        ));
        assert!(!apartment_stash_accepts_def_id(
            APARTMENT_STASH_KIND_GROW_TRAY,
            "parsley-seeds"
        ));
    }

    #[test]
    fn fish_tank_accepts_food_not_medicine() {
        assert!(apartment_stash_accepts_def_id(
            APARTMENT_STASH_KIND_FISH_TANK,
            "apple"
        ));
        assert!(!apartment_stash_accepts_def_id(
            APARTMENT_STASH_KIND_FISH_TANK,
            "bandage-roll"
        ));
    }
}

//! Apartment furniture stash capacity and item-category rules.
//! Keep in sync with `packages/schemas/src/apartmentStashRules.ts`.

use crate::inventory_models::{
    APARTMENT_STASH_KIND_FOOTLOCKER, APARTMENT_STASH_KIND_FRIDGE, APARTMENT_STASH_KIND_STOVE,
    APARTMENT_STASH_KIND_WARDROBE,
};
use crate::items_catalog::{self, ItemCategory};

/// Hard cap for any apartment stash row index (legacy DB headroom).
pub(crate) const APARTMENT_STASH_SLOT_INDEX_MAX: u16 = 24;

pub(crate) fn apartment_stash_slot_count(stash_kind: &str) -> u16 {
    match stash_kind {
        APARTMENT_STASH_KIND_FOOTLOCKER => 24,
        APARTMENT_STASH_KIND_WARDROBE => 10,
        APARTMENT_STASH_KIND_STOVE => 6,
        APARTMENT_STASH_KIND_FRIDGE => 14,
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
        _ => false,
    }
}

pub(crate) fn apartment_stash_accepts_def_id(stash_kind: &str, def_id: &str) -> bool {
    let Some(item) = items_catalog::get(def_id) else {
        return false;
    };
    apartment_stash_accepts_item_category(stash_kind, item.category)
}

#[cfg(test)]
mod tests {
    use super::{
        apartment_stash_accepts_item_category, apartment_stash_slot_count,
        apartment_stash_slot_index_valid,
    };
    use crate::inventory_models::{
        APARTMENT_STASH_KIND_FRIDGE, APARTMENT_STASH_KIND_FOOTLOCKER, APARTMENT_STASH_KIND_STOVE,
        APARTMENT_STASH_KIND_WARDROBE,
    };
    use crate::items_catalog::ItemCategory;

    #[test]
    fn slot_counts_match_client_schema() {
        assert_eq!(apartment_stash_slot_count(APARTMENT_STASH_KIND_FOOTLOCKER), 24);
        assert_eq!(apartment_stash_slot_count(APARTMENT_STASH_KIND_WARDROBE), 10);
        assert_eq!(apartment_stash_slot_count(APARTMENT_STASH_KIND_STOVE), 6);
        assert_eq!(apartment_stash_slot_count(APARTMENT_STASH_KIND_FRIDGE), 14);
    }

    #[test]
    fn stove_slot_six_is_out_of_range() {
        assert!(apartment_stash_slot_index_valid(APARTMENT_STASH_KIND_STOVE, 5));
        assert!(!apartment_stash_slot_index_valid(APARTMENT_STASH_KIND_STOVE, 6));
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
}

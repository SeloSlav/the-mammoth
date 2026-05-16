//! Inventory location tags — player slots, stash (per-claimed apartment wardrobe / footlocker / stove), …

use spacetimedb::{Identity, SpacetimeType};

pub(crate) const APARTMENT_STASH_KIND_FOOTLOCKER: &str = "footlocker";
pub(crate) const APARTMENT_STASH_KIND_WARDROBE: &str = "wardrobe";
pub(crate) const APARTMENT_STASH_KIND_STOVE: &str = "stove";
const APARTMENT_STASH_KEY_SEP: &str = "#";

#[derive(Clone, Debug, PartialEq, SpacetimeType)]
pub struct InventoryLocationData {
    pub owner_id: Identity,
    pub slot_index: u16,
}

#[derive(Clone, Debug, PartialEq, SpacetimeType)]
pub struct HotbarLocationData {
    pub owner_id: Identity,
    pub slot_index: u8,
}

/// Apartment storage object for a claimed unit (`owner_identity` = apartment owner).
#[derive(Clone, Debug, PartialEq, SpacetimeType)]
pub struct StashLocationData {
    pub owner_identity: Identity,
    pub unit_key: String,
    pub slot_index: u16,
}

#[derive(Clone, Debug, PartialEq, SpacetimeType)]
pub enum ItemLocation {
    Inventory(InventoryLocationData),
    Hotbar(HotbarLocationData),
    Stash(StashLocationData),
    Unknown,
}

pub(crate) fn apartment_stash_key(unit_key: &str, stash_kind: &str) -> String {
    format!("{unit_key}{APARTMENT_STASH_KEY_SEP}{stash_kind}")
}

pub(crate) fn parse_apartment_stash_key(raw: &str) -> (&str, &str) {
    if let Some((unit_key, stash_kind)) = raw.rsplit_once(APARTMENT_STASH_KEY_SEP) {
        if stash_kind == APARTMENT_STASH_KIND_FOOTLOCKER
            || stash_kind == APARTMENT_STASH_KIND_WARDROBE
            || stash_kind == APARTMENT_STASH_KIND_STOVE
        {
            return (unit_key, stash_kind);
        }
    }
    (raw, APARTMENT_STASH_KIND_FOOTLOCKER)
}

pub(crate) fn apartment_stash_kind_display_name(stash_kind: &str) -> &'static str {
    match stash_kind {
        APARTMENT_STASH_KIND_WARDROBE => "wardrobe",
        APARTMENT_STASH_KIND_STOVE => "stove",
        _ => "footlocker",
    }
}

pub(crate) fn stash_location_matches(stored_unit_key: &str, requested_stash_key: &str) -> bool {
    if stored_unit_key == requested_stash_key {
        return true;
    }
    let (requested_unit_key, requested_kind) = parse_apartment_stash_key(requested_stash_key);
    requested_kind == APARTMENT_STASH_KIND_FOOTLOCKER && stored_unit_key == requested_unit_key
}

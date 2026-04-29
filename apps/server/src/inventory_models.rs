//! Inventory location tags — player slots, stash (per-claimed apartment footlocker), …

use spacetimedb::{Identity, SpacetimeType};

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

/// Footlocker storage for a claimed apartment (`owner_identity` = apartment owner).
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


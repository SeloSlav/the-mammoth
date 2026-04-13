//! Inventory location tags for player-bound items (no world containers yet).

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

#[derive(Clone, Debug, PartialEq, SpacetimeType)]
pub enum ItemLocation {
    Inventory(InventoryLocationData),
    Hotbar(HotbarLocationData),
    Unknown,
}


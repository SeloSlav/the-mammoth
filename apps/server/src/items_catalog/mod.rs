//! Authoritative item definitions: JSON shards under `content/items/catalog/` (baked into WASM).
//!
//! **Materials** are normal catalog rows (`category: "material"` in `materials.json`), same `id` as
//! inventory `def_id`. Recipe lines use `itemId` pointing at those ids — validated at load, no
//! duplicate list in Rust.
//!
//! ## Shards (authoring)
//! - `materials.json`, `melee_weapons.json`, `ranged_weapons.json`, `tools.json`, `placeables.json`, `consumables.json`
//!
//! ## Adding items
//! 1. Edit or add a shard under `content/items/catalog/`.
//! 2. Add its `include_str!` to [`load::SHARD_SOURCES`](load.rs).
//! 3. Import the same shard in `apps/client/src/inventory/mammothItemCatalog.ts`.

mod load;
mod schema;

pub use schema::{CatalogItem, ItemCategory};

pub fn catalog() -> &'static load::ItemCatalog {
    load::catalog()
}

pub fn get(def_id: &str) -> Option<&'static CatalogItem> {
    catalog().get(def_id)
}

pub fn max_stack_for(def_id: &str) -> Option<u32> {
    get(def_id).map(|c| c.max_stack)
}

pub fn is_known_def(def_id: &str) -> bool {
    get(def_id).is_some()
}

/// `true` when this catalog id is a stackable **material** (not a weapon / tool equip archetype).
#[allow(dead_code)]
pub fn is_material_def_id(def_id: &str) -> bool {
    matches!(
        get(def_id).map(|c| c.category),
        Some(ItemCategory::Material)
    )
}

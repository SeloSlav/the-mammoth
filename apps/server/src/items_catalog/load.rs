//! Merge catalog JSON shards. Construction costs reference other catalog **`id`**s with
//! [`super::schema::ItemCategory::Resource`] — same strings as inventory `def_id` (single source of truth).

use std::collections::HashMap;
use std::sync::OnceLock;

use super::schema::{
    CatalogItem, CatalogShard, ConstructionIngredient, ConstructionSpec, ItemCategory,
};

/// Shard paths: add each new `include_str!` here and in `mammothItemCatalog.ts`.
const SHARD_SOURCES: &[&str] = &[
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/items/catalog/materials.json"
    )),
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/items/catalog/melee_weapons.json"
    )),
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/items/catalog/ranged_weapons.json"
    )),
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/items/catalog/tools.json"
    )),
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/items/catalog/placeables.json"
    )),
    include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/items/catalog/consumables.json"
    )),
];

#[derive(Debug)]
pub struct ItemCatalog {
    by_id: HashMap<String, CatalogItem>,
}

impl ItemCatalog {
    pub fn get(&self, def_id: &str) -> Option<&CatalogItem> {
        self.by_id.get(def_id)
    }
}

fn parse_shards() -> Vec<CatalogItem> {
    let mut out = Vec::new();
    for raw in SHARD_SOURCES {
        let shard: CatalogShard = serde_json::from_str(raw).expect("catalog shard JSON must parse");
        out.extend(shard.items);
    }
    out
}

fn validate_construction(
    owner_id: &str,
    c: &ConstructionSpec,
    catalog: &HashMap<String, CatalogItem>,
) {
    if c.build_time_secs == 0 {
        panic!("catalog item {owner_id}: construction.buildTimeSecs must be > 0");
    }
    if c.materials.is_empty() {
        panic!("catalog item {owner_id}: construction.materials must be non-empty");
    }
    for ing in &c.materials {
        validate_construction_ingredient(owner_id, ing, catalog);
    }
    for tool_id in &c.required_tools {
        validate_required_tool(owner_id, tool_id, catalog);
    }
    let out_qty = c.output_quantity.unwrap_or(1);
    if out_qty < 1 {
        panic!("catalog item {owner_id}: construction.outputQuantity must be >= 1");
    }
    let Some(owner_item) = catalog.get(owner_id) else {
        panic!("catalog item {owner_id}: missing from map during construction validation");
    };
    if out_qty > owner_item.max_stack {
        panic!(
            "catalog item {owner_id}: construction.outputQuantity {out_qty} exceeds maxStack {}",
            owner_item.max_stack
        );
    }
}

fn validate_required_tool(owner_id: &str, tool_id: &str, catalog: &HashMap<String, CatalogItem>) {
    if tool_id.is_empty() {
        panic!("catalog item {owner_id}: empty construction.requiredTools entry");
    }
    let Some(target) = catalog.get(tool_id) else {
        panic!(
            "catalog item {owner_id}: unknown construction.requiredTools id {:?}",
            tool_id
        );
    };
    match target.category {
        ItemCategory::Tool | ItemCategory::Weapon => {}
        other => panic!(
            "catalog item {owner_id}: required tool {:?} must be category tool or weapon (got {:?})",
            tool_id, other
        ),
    }
}

fn validate_construction_ingredient(
    owner_id: &str,
    ing: &ConstructionIngredient,
    catalog: &HashMap<String, CatalogItem>,
) {
    if ing.item_id.is_empty() {
        panic!("catalog item {owner_id}: empty construction.materials itemId");
    }
    if ing.quantity < 1 {
        panic!(
            "catalog item {owner_id}: construction ingredient {:?} quantity must be >= 1",
            ing.item_id
        );
    }
    let Some(target) = catalog.get(&ing.item_id) else {
        panic!(
            "catalog item {owner_id}: unknown construction itemId {:?} — define it in a catalog shard (e.g. materials.json)",
            ing.item_id
        );
    };
    if target.category != ItemCategory::Resource {
        panic!(
            "catalog item {owner_id}: construction ingredient {:?} must reference a catalog item with category \"resource\" (got {:?})",
            ing.item_id, target.category
        );
    }
}

fn load_catalog() -> ItemCatalog {
    let items = parse_shards();
    let mut by_id = HashMap::with_capacity(items.len());
    for it in items {
        if it.id.is_empty() {
            panic!("catalog item id must be non-empty");
        }
        if it.max_stack < 1 {
            panic!("catalog max_stack must be >= 1 for {}", it.id);
        }
        if by_id.insert(it.id.clone(), it).is_some() {
            panic!("duplicate catalog item id");
        }
    }
    for it in by_id.values() {
        if let Some(ref melee) = it.melee_combat {
            if melee.damage <= 0.0 {
                panic!("catalog item {}: meleeCombat.damage must be > 0", it.id);
            }
        }
        if let Some(ref c) = it.construction {
            validate_construction(it.id.as_str(), c, &by_id);
        }
    }
    ItemCatalog { by_id }
}

pub fn catalog() -> &'static ItemCatalog {
    static CAT: OnceLock<ItemCatalog> = OnceLock::new();
    CAT.get_or_init(load_catalog)
}

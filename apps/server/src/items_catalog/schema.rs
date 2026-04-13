//! JSON shape for catalog shards under `content/items/catalog/*.json`.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct CatalogShard {
    #[serde(default)]
    #[allow(dead_code)]
    pub version: u32,
    pub items: Vec<CatalogItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct CatalogItem {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub category: ItemCategory,
    pub max_stack: u32,
    #[serde(default)]
    pub construction: Option<ConstructionSpec>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemCategory {
    Weapon,
    Tool,
    Material,
    Placeable,
    Consumable,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionSpec {
    pub build_time_secs: u32,
    pub materials: Vec<ConstructionIngredient>,
}

/// One line in a recipe: references another catalog **`id`** (same as inventory `def_id`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionIngredient {
    pub item_id: String,
    pub quantity: u32,
}

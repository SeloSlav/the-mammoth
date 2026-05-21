//! JSON shape for catalog shards under `content/items/catalog/*.json`.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct CatalogShard {
    #[serde(default)]
    #[allow(dead_code)]
    pub version: u32,
    pub items: Vec<CatalogItem>,
}

/// Optional one-shot vitals when using a consumable from the hotbar (`consume_hotbar_item`).
/// Omitted or all-zero/empty means the item is consumable in catalog only (no instant use yet).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsumeOnUseSpec {
    #[serde(default)]
    pub health_delta: Option<f32>,
    #[serde(default)]
    pub hunger_delta: Option<f32>,
    #[serde(default)]
    pub hydration_delta: Option<f32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeleeCombatSpec {
    pub damage: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HotbarConsumeSound {
    Eat,
    Drink,
    Smoke,
}

/// Reusable bottle / canteen — partial sips from hotbar; refill at apartment water tank.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaterContainerSpec {
    pub capacity_liters: f32,
    pub sip_liters: f32,
    pub hydration_per_liter: f32,
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
    pub melee_combat: Option<MeleeCombatSpec>,
    #[serde(default)]
    pub construction: Option<ConstructionSpec>,
    #[serde(default)]
    pub consume_on_use: Option<ConsumeOnUseSpec>,
    /// Authored eat-vs-drink one-shot for `consume_hotbar_item`.
    #[serde(default)]
    pub hotbar_consume_sound: Option<HotbarConsumeSound>,
    #[serde(default)]
    pub water_container: Option<WaterContainerSpec>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemCategory {
    Weapon,
    Tool,
    /// Salvaged inputs consumed by recipes (scrap, chemicals, etc.).
    Resource,
    Ammo,
    Utility,
    Placeable,
    Consumable,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionSpec {
    pub build_time_secs: u32,
    pub materials: Vec<ConstructionIngredient>,
    /// Catalog `id`s of **tool** or **weapon** rows the player must carry (not consumed).
    #[serde(default)]
    pub required_tools: Vec<String>,
    /// Crafted stack size when the recipe yields a bundle (e.g. ammo). Defaults to `1`.
    #[serde(default)]
    pub output_quantity: Option<u32>,
}

/// One line in a recipe: references another catalog **`id`** (same as inventory `def_id`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructionIngredient {
    pub item_id: String,
    pub quantity: u32,
}

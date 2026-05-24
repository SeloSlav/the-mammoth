//! Per-item world-drop lifetime for player-origin piles (death scatter, spill, manual drop).
//! Anchored world loot (`world_spawn_slot = Some(_)`) is never aged out here.

use super::get;
use super::schema::{CatalogItem, ItemCategory};

/// Shortest allowed player-drop lifetime (5 minutes).
pub const DROP_DESPAWN_MIN_SECS: i64 = 300;
/// Longest allowed player-drop lifetime (30 minutes).
pub const DROP_DESPAWN_MAX_SECS: i64 = 1800;

#[inline]
pub fn clamp_drop_despawn_secs(secs: i64) -> i64 {
    secs.clamp(DROP_DESPAWN_MIN_SECS, DROP_DESPAWN_MAX_SECS)
}

/// Wall-clock seconds before an unanchored [`crate::dropped_item::DroppedItem`] row is removed.
pub fn world_drop_despawn_secs(def_id: &str) -> i64 {
    get(def_id)
        .map(world_drop_despawn_secs_for_item)
        .unwrap_or(900)
}

pub fn world_drop_despawn_secs_for_item(item: &CatalogItem) -> i64 {
    if let Some(secs) = item.drop_despawn_secs {
        return clamp_drop_despawn_secs(secs as i64);
    }
    default_drop_despawn_secs(item)
}

fn default_drop_despawn_secs(item: &CatalogItem) -> i64 {
    match item.category {
        ItemCategory::Weapon => 1800,
        ItemCategory::Tool => 1500,
        ItemCategory::Placeable => 1200,
        ItemCategory::Utility => 1200,
        ItemCategory::Ammo => 600,
        ItemCategory::Resource => resource_drop_despawn_secs(item),
        ItemCategory::Consumable => consumable_drop_despawn_secs(item),
    }
}

fn resource_drop_despawn_secs(item: &CatalogItem) -> i64 {
    if item.balcony_grow.is_some() {
        // Seeds / starts — player investment; linger longer than bulk scrap.
        return 1200;
    }
    if item.balcony_grow_fertilizer == Some(true) {
        return 900;
    }
    match item.id.as_str() {
        "scrap-metal" => 300,
        "chemical-stock" => 900,
        _ => 900,
    }
}

fn consumable_drop_despawn_secs(item: &CatalogItem) -> i64 {
    if item.consume_on_use.is_some() {
        // Perishable food and drink spoil quickly on the ground.
        if item.id.starts_with("fresh-") || item.id == "radish-sprouts" {
            return 480;
        }
        return 300;
    }
    // Shelf-stable rations, bandages, iodine, etc.
    600
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weapons_linger_longest() {
        assert_eq!(world_drop_despawn_secs("knife"), 1800);
        assert_eq!(world_drop_despawn_secs("pistol"), 1800);
    }

    #[test]
    fn tools_outlast_ammo() {
        assert_eq!(world_drop_despawn_secs("multimeter"), 1500);
        assert_eq!(world_drop_despawn_secs("water-bottle"), 1500);
        assert!(world_drop_despawn_secs("ammo-9mm") < world_drop_despawn_secs("multimeter"));
    }

    #[test]
    fn scrap_despawns_fastest_common_resource() {
        assert_eq!(world_drop_despawn_secs("scrap-metal"), 300);
        assert!(world_drop_despawn_secs("scrap-metal") < world_drop_despawn_secs("chemical-stock"));
    }

    #[test]
    fn perishable_consumables_spoil_quickly() {
        assert_eq!(world_drop_despawn_secs("apple"), 300);
        assert_eq!(world_drop_despawn_secs("fresh-parsley"), 480);
        assert!(world_drop_despawn_secs("apple") < world_drop_despawn_secs("field-rations"));
    }

    #[test]
    fn grow_seeds_outlast_harvest_greens() {
        assert_eq!(world_drop_despawn_secs("parsley-seeds"), 1200);
        assert!(
            world_drop_despawn_secs("fresh-parsley") < world_drop_despawn_secs("parsley-seeds")
        );
    }

    #[test]
    fn clamp_respects_bounds() {
        assert_eq!(clamp_drop_despawn_secs(60), DROP_DESPAWN_MIN_SECS);
        assert_eq!(clamp_drop_despawn_secs(9999), DROP_DESPAWN_MAX_SECS);
    }
}

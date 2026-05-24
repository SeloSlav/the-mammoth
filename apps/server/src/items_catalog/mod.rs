//! Authoritative item definitions: JSON shards under `content/items/catalog/` (baked into WASM).
//!
//! **Resources** are normal catalog rows (`category: "resource"` in `materials.json`), same `id` as
//! inventory `def_id`. Recipe lines use `itemId` pointing at those ids — validated at load, no
//! duplicate list in Rust.
//!
//! ## Shards (authoring)
//! - `materials.json` (resources, ammo, utilities), `melee_weapons.json`, `ranged_weapons.json`, `tools.json`, `placeables.json`, `consumables.json`, `balcony_grow_op.json`
//!
//! ## Adding items
//! 1. Edit or add a shard under `content/items/catalog/`.
//! 2. Add its `include_str!` to [`load::SHARD_SOURCES`](load.rs).
//! 3. Import the same shard in `apps/client/src/inventory/mammothItemCatalog.ts`.
//! 4. For hotbar **V** instant consume: `category: "consumable"` plus optional `consumeOnUse` vitals in JSON
//!    (see [`instant_hotbar_consume_vital_deltas`]). Author `hotbarConsumeSound` for local / world
//!    consume SFX: `eat`, `drink`, or `smoke`.

mod drop_despawn;
mod load;
mod schema;

pub use drop_despawn::world_drop_despawn_secs;

pub use schema::{
    BalconyGrowSpec, CatalogItem, ConstructionIngredient, HotbarConsumeSound, ItemCategory,
};

pub fn balcony_grow_spec(def_id: &str) -> Option<&'static BalconyGrowSpec> {
    get(def_id)?.balcony_grow.as_ref()
}

pub fn is_balcony_grow_fertilizer(def_id: &str) -> bool {
    get(def_id)
        .and_then(|c| c.balcony_grow_fertilizer)
        .unwrap_or(false)
}

pub fn is_plantable_balcony_seed(def_id: &str) -> bool {
    balcony_grow_spec(def_id).is_some()
}

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

/// Hotbar instant-use: catalog **`consumable`** with non-zero [`ConsumeOnUseSpec`] vitals.
/// Returns `(health_delta, hunger_delta, hydration_delta)` for [`crate::player_vitals::apply_instant_vital_deltas`].
pub fn instant_hotbar_consume_vital_deltas(def_id: &str) -> Option<(f32, f32, f32)> {
    let c = get(def_id)?;
    if c.category != ItemCategory::Consumable {
        return None;
    }
    let u = c.consume_on_use.as_ref()?;
    let dhp = u.health_delta.unwrap_or(0.0);
    let dh = u.hunger_delta.unwrap_or(0.0);
    let dy = u.hydration_delta.unwrap_or(0.0);
    (dhp != 0.0 || dh != 0.0 || dy != 0.0).then_some((dhp, dh, dy))
}

#[inline]
pub fn melee_damage(def_id: &str) -> Option<f32> {
    let c = get(def_id)?;
    Some(c.melee_combat.as_ref()?.damage)
}

/// Authored hotbar consume mouth SFX (`eat` / `drink` / `smoke`), defaulting to `eat`.
#[inline]
pub fn hotbar_consume_sound(def_id: &str) -> HotbarConsumeSound {
    get(def_id)
        .and_then(|c| c.hotbar_consume_sound)
        .unwrap_or(HotbarConsumeSound::Eat)
}

/// `true` when this catalog id is a **resource** row (recipe inputs like scrap — not weapon/tool/ammo rows).
#[allow(dead_code)]
pub fn is_resource_def_id(def_id: &str) -> bool {
    matches!(
        get(def_id).map(|c| c.category),
        Some(ItemCategory::Resource)
    )
}

#[cfg(test)]
mod hotbar_consume_sound_tests {
    use super::{hotbar_consume_sound, melee_damage, HotbarConsumeSound};

    #[test]
    fn authored_consume_sounds_match_item_type() {
        assert_eq!(hotbar_consume_sound("apple"), HotbarConsumeSound::Eat);
        assert_eq!(
            hotbar_consume_sound("water-bottle"),
            HotbarConsumeSound::Drink
        );
        assert_eq!(hotbar_consume_sound("rakija"), HotbarConsumeSound::Drink);
        assert_eq!(
            hotbar_consume_sound("cigarettes"),
            HotbarConsumeSound::Smoke
        );
    }

    #[test]
    fn missing_sound_defaults_to_eat() {
        assert_eq!(
            hotbar_consume_sound("field-rations"),
            HotbarConsumeSound::Eat
        );
    }

    #[test]
    fn melee_weapons_read_authored_damage_from_catalog() {
        assert_eq!(melee_damage("knife"), Some(16.0));
        assert_eq!(melee_damage("crowbar"), Some(32.0));
        assert_eq!(melee_damage("screwdriver"), Some(10.0));
        assert_eq!(melee_damage("water-bottle"), None);
    }
}

#[cfg(test)]
mod balcony_grow_op_catalog_tests {
    use super::{get, instant_hotbar_consume_vital_deltas, is_known_def, ItemCategory};

    const PLANT_DEF_IDS: &[&str] = &[
        "balcony-grow-substrate",
        "parsley-seeds",
        "dill-seeds",
        "paprika-seedlings",
        "green-onion-sets",
        "radish-sprout-seeds",
        "oyster-mushroom-spore",
        "scented-geranium-cuttings",
    ];

    const HARVEST_DEF_IDS: &[&str] = &[
        "fresh-parsley",
        "fresh-dill",
        "fresh-paprika",
        "fresh-green-onion",
        "radish-sprouts",
        "fresh-oyster-mushroom",
        "scented-geranium-leaves",
    ];

    #[test]
    fn balcony_grow_op_defs_load_from_catalog_shard() {
        for id in PLANT_DEF_IDS {
            assert!(is_known_def(id), "missing plant def {id}");
            assert_eq!(get(id).unwrap().category, ItemCategory::Resource);
            if *id != "balcony-grow-substrate" {
                assert!(
                    super::balcony_grow_spec(id).is_some(),
                    "plant {id} missing balcony_grow metadata"
                );
            }
        }
        for id in HARVEST_DEF_IDS {
            assert!(is_known_def(id), "missing harvest def {id}");
            assert_eq!(get(id).unwrap().category, ItemCategory::Consumable);
        }
    }

    #[test]
    fn balcony_edibles_expose_hotbar_consume_hooks() {
        assert_eq!(
            instant_hotbar_consume_vital_deltas("radish-sprouts"),
            Some((0.0, 10.0, 0.0))
        );
        assert_eq!(
            instant_hotbar_consume_vital_deltas("scented-geranium-leaves"),
            Some((2.0, 0.0, 8.0))
        );
        assert_eq!(
            instant_hotbar_consume_vital_deltas("fresh-parsley"),
            Some((0.0, 4.0, 0.0))
        );
        assert!(instant_hotbar_consume_vital_deltas("parsley-seeds").is_none());
    }
}

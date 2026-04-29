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
//! 4. For hotbar **V** instant consume: `category: "consumable"` plus optional `consumeOnUse` vitals in JSON
//!    (see [`instant_hotbar_consume_vital_deltas`]). Author `hotbarConsumeSound` when local / world
//!    consume SFX should be `eat` vs `drink`.

mod load;
mod schema;

pub use schema::{CatalogItem, HotbarConsumeSound, ItemCategory};

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

/// Authored hotbar consume mouth SFX (`eat` / `drink`), defaulting to `eat`.
#[inline]
pub fn hotbar_consume_sound(def_id: &str) -> HotbarConsumeSound {
    get(def_id)
        .and_then(|c| c.hotbar_consume_sound)
        .unwrap_or(HotbarConsumeSound::Eat)
}

/// `true` when this catalog id is a stackable **material** (not a weapon / tool equip archetype).
#[allow(dead_code)]
pub fn is_material_def_id(def_id: &str) -> bool {
    matches!(
        get(def_id).map(|c| c.category),
        Some(ItemCategory::Material)
    )
}

#[cfg(test)]
mod hotbar_consume_sound_tests {
    use super::{hotbar_consume_sound, melee_damage, HotbarConsumeSound};

    #[test]
    fn authored_consume_sounds_match_item_type() {
        assert_eq!(hotbar_consume_sound("apple"), HotbarConsumeSound::Eat);
        assert_eq!(hotbar_consume_sound("water-bottle"), HotbarConsumeSound::Drink);
        assert_eq!(hotbar_consume_sound("rakija"), HotbarConsumeSound::Drink);
    }

    #[test]
    fn missing_sound_defaults_to_eat() {
        assert_eq!(hotbar_consume_sound("field-rations"), HotbarConsumeSound::Eat);
    }

    #[test]
    fn melee_weapons_read_authored_damage_from_catalog() {
        assert_eq!(melee_damage("knife"), Some(12.0));
        assert_eq!(melee_damage("crowbar"), Some(22.0));
        assert_eq!(melee_damage("water-bottle"), None);
    }
}

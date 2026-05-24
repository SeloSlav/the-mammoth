//! Fish tank feed slot — overnight chance to produce tray compost (balcony-grow-substrate).
//! Complements the grow-op loop: spare food → partial fertilizer supply.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments::{self, apartment_unit, apartment_unit_decor, ApartmentUnitDecor};
use crate::inventory::{
    find_item_in_stash_slot, inventory_item, remove_stash_item_quantity, InventoryItem,
};
use crate::inventory_models::{apartment_stash_key_decor, ItemLocation, StashLocationData};
use crate::items_catalog::{self, ItemCategory};

pub(crate) const BALCONY_GROW_FERTILIZER_DEF_ID: &str = "balcony-grow-substrate";
pub(crate) const FISH_TANK_FEED_SLOT: u16 = 0;

const FISH_TANK_FEED_BLOCKED: &[&str] = &[
    BALCONY_GROW_FERTILIZER_DEF_ID,
    "water-bottle",
    "iodine-tablets",
    "bandage-roll",
    "caffeine-gum",
    "cigarettes",
];

/// Secret per-food yield tuning — not exposed to clients.
struct FishTankFeedYield {
    success_pct: u8,
    output_qty: u32,
}

fn fish_tank_feed_yield(def_id: &str) -> Option<FishTankFeedYield> {
    if !is_fish_tank_feed_def_id(def_id) {
        return None;
    }
    let profile = match def_id {
        // Fish-forward scraps — best overnight conversion.
        "fresh-dill" => FishTankFeedYield {
            success_pct: 90,
            output_qty: 1,
        },
        "fresh-oyster-mushroom" => FishTankFeedYield {
            success_pct: 78,
            output_qty: 1,
        },
        "field-rations" => FishTankFeedYield {
            success_pct: 72,
            output_qty: 1,
        },
        "radish-sprouts" | "fresh-green-onion" => FishTankFeedYield {
            success_pct: 68,
            output_qty: 1,
        },
        "apple" | "fresh-parsley" | "fresh-paprika" => FishTankFeedYield {
            success_pct: 62,
            output_qty: 1,
        },
        "scented-geranium-leaves" => FishTankFeedYield {
            success_pct: 52,
            output_qty: 1,
        },
        "rakija" => FishTankFeedYield {
            success_pct: 28,
            output_qty: 1,
        },
        _ => FishTankFeedYield {
            success_pct: 55,
            output_qty: 1,
        },
    };
    Some(profile)
}

pub(crate) fn is_fish_tank_feed_def_id(def_id: &str) -> bool {
    if FISH_TANK_FEED_BLOCKED.contains(&def_id) {
        return false;
    }
    let Some(item) = items_catalog::get(def_id) else {
        return false;
    };
    item.category == ItemCategory::Consumable
}

#[inline]
fn splitmix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E3779B97F4A7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

fn roll_fish_tank_success(ctx: &ReducerContext, seed: u64, success_pct: u8) -> bool {
    let pct = success_pct.min(100);
    if pct == 0 {
        return false;
    }
    if pct >= 100 {
        return true;
    }
    let roll = splitmix64(
        seed.wrapping_add(ctx.timestamp.to_micros_since_unix_epoch() as u64)
            .wrapping_add(0xF15_0000),
    ) % 100;
    roll < pct as u64
}

fn is_fish_tank_decor_row(decor: &ApartmentUnitDecor) -> bool {
    apartments::effective_decor_item_kind(decor.item_kind, decor.model_rel_path.as_str())
        == apartments::APARTMENT_DECOR_ITEM_KIND_FISH_TANK
}

fn fish_tank_stash_key(decor: &ApartmentUnitDecor) -> String {
    apartment_stash_key_decor(decor.unit_key.as_str(), decor.decor_id)
}

fn grant_fish_tank_substrate(ctx: &ReducerContext, owner: Identity, stash_key: &str, qty: u32) {
    if qty == 0 {
        return;
    }
    let _ = ctx.db.inventory_item().insert(InventoryItem {
        instance_id: 0,
        def_id: BALCONY_GROW_FERTILIZER_DEF_ID.to_string(),
        quantity: qty,
        location: ItemLocation::Stash(StashLocationData {
            owner_identity: owner,
            unit_key: stash_key.to_string(),
            slot_index: FISH_TANK_FEED_SLOT,
        }),
    });
}

fn process_fish_tank_feed_slot(
    ctx: &ReducerContext,
    owner: Identity,
    stash_key: &str,
    roll_seed: u64,
) {
    let Some(item) = find_item_in_stash_slot(ctx, owner, stash_key, FISH_TANK_FEED_SLOT) else {
        return;
    };
    if item.def_id == BALCONY_GROW_FERTILIZER_DEF_ID {
        return;
    }
    let Some(yield_profile) = fish_tank_feed_yield(item.def_id.as_str()) else {
        return;
    };
    if remove_stash_item_quantity(ctx, owner, stash_key, FISH_TANK_FEED_SLOT, 1).is_err() {
        return;
    }
    if roll_fish_tank_success(ctx, roll_seed, yield_profile.success_pct) {
        grant_fish_tank_substrate(ctx, owner, stash_key, yield_profile.output_qty);
    }
}

fn process_fish_tank_on_sleep(ctx: &ReducerContext, owner: Identity, decor: &ApartmentUnitDecor) {
    let roll_seed = decor.decor_id.wrapping_mul(0x9E37).wrapping_add(0xF15_0001);
    process_fish_tank_feed_slot(ctx, owner, fish_tank_stash_key(decor).as_str(), roll_seed);
}

/// Sleep / death day hook — digest feed slot and maybe leave tray compost.
pub(crate) fn advance_fish_tanks_for_unit(ctx: &ReducerContext, unit_key: &str) {
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string());
    let Some(owner) = unit.and_then(|u| u.owner) else {
        return;
    };

    let tanks: Vec<ApartmentUnitDecor> = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| d.unit_key.as_str() == unit_key && is_fish_tank_decor_row(d))
        .collect();

    for decor in tanks {
        process_fish_tank_on_sleep(ctx, owner, &decor);
    }
}

#[cfg(test)]
mod tests {
    use super::{fish_tank_feed_yield, is_fish_tank_feed_def_id};

    #[test]
    fn accepts_consumable_food_not_medicine() {
        assert!(is_fish_tank_feed_def_id("apple"));
        assert!(is_fish_tank_feed_def_id("fresh-dill"));
        assert!(!is_fish_tank_feed_def_id("bandage-roll"));
        assert!(!is_fish_tank_feed_def_id("balcony-grow-substrate"));
        assert!(!is_fish_tank_feed_def_id("parsley-seeds"));
    }

    #[test]
    fn dill_outranks_generic_food() {
        let dill = fish_tank_feed_yield("fresh-dill").unwrap();
        let apple = fish_tank_feed_yield("apple").unwrap();
        assert!(dill.success_pct > apple.success_pct);
    }

    #[test]
    fn rakija_is_poor_fish_food() {
        let rakija = fish_tank_feed_yield("rakija").unwrap();
        let rations = fish_tank_feed_yield("field-rations").unwrap();
        assert!(rakija.success_pct < rations.success_pct);
    }
}

//! Stash location key equivalence (bare / legacy / per-decor). Keep in sync with
//! `packages/schemas/src/apartmentStashLocationMatch.ts`.

use spacetimedb::ReducerContext;

use crate::apartments::apartment_unit_decor;
use crate::inventory_models::{
    parse_apartment_stash_key_v2, stash_location_matches, ParsedApartmentStashKey,
    APARTMENT_STASH_KIND_FOOTLOCKER, APARTMENT_STASH_KIND_FRIDGE, APARTMENT_STASH_KIND_GROW_TRAY,
    APARTMENT_STASH_KIND_STOVE, APARTMENT_STASH_KIND_WARDROBE, APARTMENT_STASH_KIND_WATER_TANK,
};

const DECOR_ITEM_KIND_PLAIN: u8 = 0;
const DECOR_ITEM_KIND_WARDROBE: u8 = 2;
const DECOR_ITEM_KIND_STOVE: u8 = 4;
const DECOR_ITEM_KIND_FRIDGE: u8 = 5;
const DECOR_ITEM_KIND_WATER_TANK: u8 = 6;

fn infer_decor_item_kind_from_model_rel_path(model_rel_path: &str) -> u8 {
    let p = model_rel_path.trim().trim_start_matches('/');
    if p.ends_with("objects/water-tank.glb") {
        return DECOR_ITEM_KIND_WATER_TANK;
    }
    if p.ends_with("objects/fridge.glb") {
        return DECOR_ITEM_KIND_FRIDGE;
    }
    if p.ends_with("objects/stove.glb") {
        return DECOR_ITEM_KIND_STOVE;
    }
    if p.ends_with("objects/footlocker.glb") {
        return 3;
    }
    if p.ends_with("objects/wardrobe-closet.glb") {
        return DECOR_ITEM_KIND_WARDROBE;
    }
    DECOR_ITEM_KIND_PLAIN
}

fn effective_decor_item_kind(item_kind: u8, model_rel_path: &str) -> u8 {
    if item_kind != DECOR_ITEM_KIND_PLAIN {
        return item_kind;
    }
    infer_decor_item_kind_from_model_rel_path(model_rel_path)
}

fn decor_stash_kind_for_row(item_kind: u8, model_rel_path: &str) -> &'static str {
    match effective_decor_item_kind(item_kind, model_rel_path) {
        DECOR_ITEM_KIND_WARDROBE => APARTMENT_STASH_KIND_WARDROBE,
        DECOR_ITEM_KIND_STOVE => APARTMENT_STASH_KIND_STOVE,
        DECOR_ITEM_KIND_FRIDGE => APARTMENT_STASH_KIND_FRIDGE,
        DECOR_ITEM_KIND_WATER_TANK => APARTMENT_STASH_KIND_WATER_TANK,
        _ => APARTMENT_STASH_KIND_FOOTLOCKER,
    }
}

fn resolved_stash_kind(
    ctx: &ReducerContext,
    parsed: &ParsedApartmentStashKey<'_>,
) -> Option<&'static str> {
    match parsed {
        ParsedApartmentStashKey::BareUnitKey(_) => Some(APARTMENT_STASH_KIND_FOOTLOCKER),
        ParsedApartmentStashKey::LegacyComposite { kind, .. } => Some(kind),
        ParsedApartmentStashKey::GrowTray { .. } => Some(APARTMENT_STASH_KIND_GROW_TRAY),
        ParsedApartmentStashKey::DecorInstance { unit_key, decor_id } => {
            let decor = ctx.db.apartment_unit_decor().decor_id().find(*decor_id)?;
            if decor.unit_key.as_str() != *unit_key {
                return None;
            }
            Some(decor_stash_kind_for_row(
                decor.item_kind,
                decor.model_rel_path.as_str(),
            ))
        }
    }
}

fn unit_key_from<'a>(parsed: &'a ParsedApartmentStashKey<'a>) -> &'a str {
    match parsed {
        ParsedApartmentStashKey::BareUnitKey(u) => u,
        ParsedApartmentStashKey::LegacyComposite { unit_key, .. } => unit_key,
        ParsedApartmentStashKey::DecorInstance { unit_key, .. } => unit_key,
        ParsedApartmentStashKey::GrowTray { unit_key, .. } => unit_key,
    }
}

fn footlocker_location_alias(
    stored: &ParsedApartmentStashKey<'_>,
    requested: &ParsedApartmentStashKey<'_>,
) -> bool {
    match (stored, requested) {
        (
            ParsedApartmentStashKey::DecorInstance {
                unit_key: su,
                decor_id: si,
            },
            ParsedApartmentStashKey::DecorInstance {
                unit_key: ru,
                decor_id: ri,
            },
        ) => *su == *ru && si == ri,
        (ParsedApartmentStashKey::DecorInstance { unit_key: su, .. }, other) => {
            unit_key_from(other) == *su
        }
        (other, ParsedApartmentStashKey::DecorInstance { unit_key: ru, .. }) => {
            unit_key_from(other) == *ru
        }
        _ => true,
    }
}

/// Whether a persisted stash row belongs to the stash volume opened as `requested_stash_key`.
pub(crate) fn apartment_stash_locations_match(
    ctx: &ReducerContext,
    stored_key: &str,
    requested_key: &str,
) -> bool {
    if stash_location_matches(stored_key, requested_key) {
        return true;
    }

    let stored = parse_apartment_stash_key_v2(stored_key);
    let requested = parse_apartment_stash_key_v2(requested_key);

    let stored_kind = resolved_stash_kind(ctx, &stored);
    let requested_kind = resolved_stash_kind(ctx, &requested);
    let (Some(sk), Some(rk)) = (stored_kind, requested_kind) else {
        return false;
    };
    if sk != rk || unit_key_from(&stored) != unit_key_from(&requested) {
        return false;
    }

    if sk == APARTMENT_STASH_KIND_FOOTLOCKER {
        return footlocker_location_alias(&stored, &requested);
    }

    same_kind_storage_alias(&stored, &requested)
}

fn same_kind_storage_alias(
    stored: &ParsedApartmentStashKey<'_>,
    requested: &ParsedApartmentStashKey<'_>,
) -> bool {
    match (stored, requested) {
        (
            ParsedApartmentStashKey::DecorInstance {
                unit_key: su,
                decor_id: si,
            },
            ParsedApartmentStashKey::DecorInstance {
                unit_key: ru,
                decor_id: ri,
            },
        ) => *su == *ru && si == ri,
        _ => unit_key_from(stored) == unit_key_from(requested),
    }
}

#[cfg(test)]
mod tests {
    use super::footlocker_location_alias;
    use crate::inventory_models::parse_apartment_stash_key_v2;

    #[test]
    fn footlocker_decor_ids_must_match_for_decor_only_pair() {
        let a = parse_apartment_stash_key_v2("u1#d7");
        let b = parse_apartment_stash_key_v2("u1#d8");
        assert!(!footlocker_location_alias(&a, &b));
        let c = parse_apartment_stash_key_v2("u1#d7");
        assert!(footlocker_location_alias(&a, &c));
    }

    #[test]
    fn footlocker_legacy_aliases_decor() {
        let legacy = parse_apartment_stash_key_v2("u1#footlocker");
        let decor = parse_apartment_stash_key_v2("u1#d7");
        assert!(footlocker_location_alias(&legacy, &decor));
    }
}

//! Inventory location tags — player slots, stash (per-claimed apartment storage instances), …

use spacetimedb::{Identity, SpacetimeType};

pub(crate) const APARTMENT_STASH_KIND_FOOTLOCKER: &str = "footlocker";
pub(crate) const APARTMENT_STASH_KIND_WARDROBE: &str = "wardrobe";
pub(crate) const APARTMENT_STASH_KIND_STOVE: &str = "stove";
const APARTMENT_STASH_KEY_SEP: &str = "#";

/// Per-instance stash: `{unit_key}#d{decor_id}` (e.g. `floor_mamutica_typical|21|unit_e_003#d7`).
pub(crate) fn apartment_stash_key_decor(unit_key: &str, decor_id: u64) -> String {
    format!("{unit_key}{APARTMENT_STASH_KEY_SEP}d{decor_id}")
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ParsedApartmentStashKey<'a> {
    /// Legacy DB rows stored exact `unit_key` string with no `#` suffix (footlocker-only).
    BareUnitKey(&'a str),
    /// `unit_key` + `#` + `wardrobe` / `footlocker` / `stove`.
    LegacyComposite {
        unit_key: &'a str,
        kind: &'static str,
    },
    DecorInstance {
        unit_key: &'a str,
        decor_id: u64,
    },
}

/// Parse client / DB stash location strings (supports legacy kind suffixes and per-decor instance keys).
pub(crate) fn parse_apartment_stash_key_v2(raw: &str) -> ParsedApartmentStashKey<'_> {
    if let Some((unit_part, tail)) = raw.rsplit_once(APARTMENT_STASH_KEY_SEP) {
        if let Some(digits) = tail.strip_prefix('d') {
            if let Ok(id) = digits.parse::<u64>() {
                if id > 0 {
                    return ParsedApartmentStashKey::DecorInstance {
                        unit_key: unit_part,
                        decor_id: id,
                    };
                }
            }
        }
        if tail == APARTMENT_STASH_KIND_FOOTLOCKER
            || tail == APARTMENT_STASH_KIND_WARDROBE
            || tail == APARTMENT_STASH_KIND_STOVE
        {
            let kind: &'static str = if tail == APARTMENT_STASH_KIND_WARDROBE {
                APARTMENT_STASH_KIND_WARDROBE
            } else if tail == APARTMENT_STASH_KIND_STOVE {
                APARTMENT_STASH_KIND_STOVE
            } else {
                APARTMENT_STASH_KIND_FOOTLOCKER
            };
            return ParsedApartmentStashKey::LegacyComposite { unit_key: unit_part, kind };
        }
    }
    ParsedApartmentStashKey::BareUnitKey(raw)
}

/// Backwards-compatible: returns (`unit_key`, `stash_kind`) for **legacy kind** keys only.
/// Per-decor keys (`…#d7`) map to (`unit_key`, `"footlocker"`) — prefer [`parse_apartment_stash_key_v2`].
pub(crate) fn parse_apartment_stash_key(raw: &str) -> (&str, &str) {
    match parse_apartment_stash_key_v2(raw) {
        ParsedApartmentStashKey::BareUnitKey(u) => (u, APARTMENT_STASH_KIND_FOOTLOCKER),
        ParsedApartmentStashKey::LegacyComposite { unit_key, kind } => (unit_key, kind),
        ParsedApartmentStashKey::DecorInstance { unit_key, .. } => (unit_key, APARTMENT_STASH_KIND_FOOTLOCKER),
    }
}

pub(crate) fn apartment_stash_key(unit_key: &str, stash_kind: &str) -> String {
    format!("{unit_key}{APARTMENT_STASH_KEY_SEP}{stash_kind}")
}

pub(crate) fn apartment_stash_kind_display_name(stash_kind: &str) -> &'static str {
    match stash_kind {
        APARTMENT_STASH_KIND_WARDROBE => "wardrobe",
        APARTMENT_STASH_KIND_STOVE => "stove",
        _ => "footlocker",
    }
}

/// `stored` / `requested` are values in `StashLocationData.unit_key` (composite stash id) or reducer args.
pub(crate) fn stash_location_matches(stored_unit_key: &str, requested_stash_key: &str) -> bool {
    if stored_unit_key == requested_stash_key {
        return true;
    }
    let sa = parse_apartment_stash_key_v2(stored_unit_key);
    let sb = parse_apartment_stash_key_v2(requested_stash_key);
    match (sa, sb) {
        (
            ParsedApartmentStashKey::DecorInstance {
                unit_key: su,
                decor_id: si,
            },
            ParsedApartmentStashKey::DecorInstance {
                unit_key: ru,
                decor_id: ri,
            },
        ) => su == ru && si == ri,
        (
            ParsedApartmentStashKey::LegacyComposite {
                unit_key: su,
                kind: sk,
            },
            ParsedApartmentStashKey::LegacyComposite {
                unit_key: ru,
                kind: rk,
            },
        ) => su == ru && sk == rk,
        (
            ParsedApartmentStashKey::BareUnitKey(su),
            ParsedApartmentStashKey::LegacyComposite {
                unit_key: ru,
                kind: rk,
            },
        ) => su == ru && rk == APARTMENT_STASH_KIND_FOOTLOCKER,
        (
            ParsedApartmentStashKey::LegacyComposite {
                unit_key: su,
                kind: sk,
            },
            ParsedApartmentStashKey::BareUnitKey(ru),
        ) => su == ru && sk == APARTMENT_STASH_KIND_FOOTLOCKER,
        _ => false,
    }
}

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

/// Apartment storage object for a claimed unit (`owner_identity` = apartment owner).
#[derive(Clone, Debug, PartialEq, SpacetimeType)]
pub struct StashLocationData {
    pub owner_identity: Identity,
    pub unit_key: String,
    pub slot_index: u16,
}

#[derive(Clone, Debug, PartialEq, SpacetimeType)]
pub enum ItemLocation {
    Inventory(InventoryLocationData),
    Hotbar(HotbarLocationData),
    Stash(StashLocationData),
    Unknown,
}

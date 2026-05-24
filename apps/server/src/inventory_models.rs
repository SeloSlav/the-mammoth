//! Inventory location tags — player slots, stash (per-claimed apartment storage instances), …

use spacetimedb::{Identity, SpacetimeType};

pub(crate) const APARTMENT_STASH_KIND_FOOTLOCKER: &str = "footlocker";
pub(crate) const APARTMENT_STASH_KIND_WARDROBE: &str = "wardrobe";
pub(crate) const APARTMENT_STASH_KIND_STOVE: &str = "stove";
pub(crate) const APARTMENT_STASH_KIND_FRIDGE: &str = "fridge";
pub(crate) const APARTMENT_STASH_KIND_WATER_TANK: &str = "water_tank";
pub(crate) const APARTMENT_STASH_KIND_FISH_TANK: &str = "fish_tank";
pub(crate) const APARTMENT_STASH_KIND_FISH_TANK_FILTER: &str = "fish_tank_filter";
pub(crate) const APARTMENT_STASH_KIND_GROW_TRAY: &str = "grow_tray";
const APARTMENT_STASH_KEY_SEP: &str = "#";
const GROW_TRAY_STASH_PREFIX: &str = "grow_tray:";

/// Per-instance stash: `{unit_key}#d{decor_id}` (e.g. `floor_mamutica_typical|21|unit_e_003#d7`).
pub(crate) fn apartment_stash_key_decor(unit_key: &str, decor_id: u64) -> String {
    format!("{unit_key}{APARTMENT_STASH_KEY_SEP}d{decor_id}")
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ParsedApartmentStashKey<'a> {
    /// Legacy DB rows stored exact `unit_key` string with no `#` suffix (footlocker-only).
    BareUnitKey(&'a str),
    /// `unit_key` + `#` + `wardrobe` / `footlocker` / `stove` / `fridge`.
    LegacyComposite {
        unit_key: &'a str,
        kind: &'static str,
    },
    DecorInstance {
        unit_key: &'a str,
        decor_id: u64,
    },
    /// `{unit_key}#grow_tray:{tray_builtin_uuid}` — per-tray fertilizer slot.
    GrowTray {
        unit_key: &'a str,
        tray_id: &'a str,
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
            || tail == APARTMENT_STASH_KIND_FRIDGE
            || tail == APARTMENT_STASH_KIND_WATER_TANK
            || tail == APARTMENT_STASH_KIND_FISH_TANK
            || tail == APARTMENT_STASH_KIND_FISH_TANK_FILTER
            || tail == APARTMENT_STASH_KIND_GROW_TRAY
        {
            let kind: &'static str = if tail == APARTMENT_STASH_KIND_WARDROBE {
                APARTMENT_STASH_KIND_WARDROBE
            } else if tail == APARTMENT_STASH_KIND_STOVE {
                APARTMENT_STASH_KIND_STOVE
            } else if tail == APARTMENT_STASH_KIND_FRIDGE {
                APARTMENT_STASH_KIND_FRIDGE
            } else if tail == APARTMENT_STASH_KIND_WATER_TANK {
                APARTMENT_STASH_KIND_WATER_TANK
            } else if tail == APARTMENT_STASH_KIND_FISH_TANK {
                APARTMENT_STASH_KIND_FISH_TANK
            } else if tail == APARTMENT_STASH_KIND_FISH_TANK_FILTER {
                APARTMENT_STASH_KIND_FISH_TANK_FILTER
            } else if tail == APARTMENT_STASH_KIND_GROW_TRAY {
                APARTMENT_STASH_KIND_GROW_TRAY
            } else {
                APARTMENT_STASH_KIND_FOOTLOCKER
            };
            return ParsedApartmentStashKey::LegacyComposite {
                unit_key: unit_part,
                kind,
            };
        }
        if let Some(tray_id) = tail.strip_prefix(GROW_TRAY_STASH_PREFIX) {
            if !tray_id.is_empty() {
                return ParsedApartmentStashKey::GrowTray {
                    unit_key: unit_part,
                    tray_id,
                };
            }
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
        ParsedApartmentStashKey::DecorInstance { unit_key, .. } => {
            (unit_key, APARTMENT_STASH_KIND_FOOTLOCKER)
        }
        ParsedApartmentStashKey::GrowTray { unit_key, .. } => {
            (unit_key, APARTMENT_STASH_KIND_GROW_TRAY)
        }
    }
}

pub(crate) fn apartment_stash_key(unit_key: &str, stash_kind: &str) -> String {
    format!("{unit_key}{APARTMENT_STASH_KEY_SEP}{stash_kind}")
}

pub(crate) fn apartment_stash_kind_display_name(stash_kind: &str) -> &'static str {
    match stash_kind {
        APARTMENT_STASH_KIND_WARDROBE => "wardrobe",
        APARTMENT_STASH_KIND_STOVE => "stove",
        APARTMENT_STASH_KIND_FRIDGE => "fridge",
        APARTMENT_STASH_KIND_WATER_TANK => "water tank",
        APARTMENT_STASH_KIND_FISH_TANK => "fish tank",
        APARTMENT_STASH_KIND_FISH_TANK_FILTER => "fish filter",
        APARTMENT_STASH_KIND_GROW_TRAY => "grow tray",
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
        (
            ParsedApartmentStashKey::GrowTray {
                unit_key: su,
                tray_id: st,
            },
            ParsedApartmentStashKey::GrowTray {
                unit_key: ru,
                tray_id: rt,
            },
        ) => su == ru && st == rt,
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

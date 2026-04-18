//! Melee combat placeholders — damage from active hotbar + stub per-weapon tuning.
//!
//! Replace `stub_melee_damage_for_def_id` with catalog-driven stats when combat lands.

use spacetimedb::{Identity, ReducerContext};

use crate::inventory::{find_item_in_hotbar_slot, NUM_PLAYER_HOTBAR_SLOTS};
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};

/// `true` when the active hotbar row is one of the currently implemented melee weapons.
pub fn is_stub_melee_weapon_def_id(def_id: &str) -> bool {
    matches!(def_id, "knife" | "crowbar" | "srbosjek" | "baseball_bat")
}

/// Selected hotbar item `def_id` when the combat rail points at an implemented melee weapon;
/// otherwise `None`.
pub fn active_hotbar_weapon_def_id(ctx: &ReducerContext, attacker: Identity) -> Option<String> {
    let row = ctx.db.player_active_hotbar().identity().find(&attacker)?;
    if row.slot_index == ACTIVE_HOTBAR_SLOT_CLEARED || row.slot_index >= NUM_PLAYER_HOTBAR_SLOTS {
        return None;
    }
    let item = find_item_in_hotbar_slot(ctx, attacker, row.slot_index)?;
    if is_stub_melee_weapon_def_id(&item.def_id) {
        Some(item.def_id)
    } else {
        None
    }
}

/// Stub per weapon `def_id`. Non-weapons / unknown ids → `0`.
pub fn stub_melee_damage_for_def_id(def_id: &str) -> f32 {
    match def_id {
        "knife" => 12.0,
        "crowbar" => 22.0,
        "srbosjek" => 18.0,
        "baseball_bat" => 20.0,
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_weapon_filter_matches_supported_melee_defs() {
        assert!(is_stub_melee_weapon_def_id("crowbar"));
        assert!(is_stub_melee_weapon_def_id("knife"));
        assert!(!is_stub_melee_weapon_def_id("water_bottle"));
        assert!(!is_stub_melee_weapon_def_id("apple"));
    }

    #[test]
    fn unknown_defs_have_no_stub_melee_damage() {
        assert_eq!(stub_melee_damage_for_def_id("water_bottle"), 0.0);
        assert_eq!(stub_melee_damage_for_def_id(""), 0.0);
    }
}

//! Melee combat placeholders — damage from active hotbar + stub per-weapon tuning.
//!
//! Replace `stub_melee_damage_for_def_id` with catalog-driven stats when combat lands.

use spacetimedb::{Identity, ReducerContext};

use crate::inventory::{find_item_in_hotbar_slot, NUM_PLAYER_HOTBAR_SLOTS};
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};

/// Baseline melee when no weapon stats apply (cleared hotbar rail, empty slot, or non-melee `def_id`).
pub const STUB_FIST_BASE_DAMAGE: f32 = 8.0;

/// Stub per weapon `def_id`. Non-weapons / unknown ids → `0` (callers use [`STUB_FIST_BASE_DAMAGE`] via
/// [`stub_melee_damage_for_active_loadout`]).
pub fn stub_melee_damage_for_def_id(def_id: &str) -> f32 {
    match def_id {
        "knife" => 12.0,
        "crowbar" => 22.0,
        "srbosjek" => 18.0,
        "baseball_bat" => 20.0,
        _ => 0.0,
    }
}

/// Base damage for `attacker`'s selected hotbar slot — always at least [`STUB_FIST_BASE_DAMAGE`] (unarmed punches).
pub fn stub_melee_damage_for_active_loadout(ctx: &ReducerContext, attacker: Identity) -> f32 {
    let Some(row) = ctx.db.player_active_hotbar().identity().find(&attacker) else {
        return STUB_FIST_BASE_DAMAGE;
    };
    if row.slot_index == ACTIVE_HOTBAR_SLOT_CLEARED || row.slot_index >= NUM_PLAYER_HOTBAR_SLOTS {
        return STUB_FIST_BASE_DAMAGE;
    }
    let Some(item) = find_item_in_hotbar_slot(ctx, attacker, row.slot_index) else {
        return STUB_FIST_BASE_DAMAGE;
    };
    let w = stub_melee_damage_for_def_id(&item.def_id);
    if w > 0.0 {
        w
    } else {
        STUB_FIST_BASE_DAMAGE
    }
}

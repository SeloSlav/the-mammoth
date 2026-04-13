//! Server-authoritative hotbar rail selection (which slot is "active" for melee / future combat).

use spacetimedb::{Identity, ReducerContext, Table};

use crate::auth;
use crate::inventory::NUM_PLAYER_HOTBAR_SLOTS;

/// Client cleared the rail / explicit unarmed (`getFpHotbarSelectedSlot() === null`).
pub const ACTIVE_HOTBAR_SLOT_CLEARED: u8 = u8::MAX;

#[spacetimedb::table(public, accessor = player_active_hotbar)]
pub struct PlayerActiveHotbar {
    #[primary_key]
    pub identity: Identity,
    /// `0..NUM_PLAYER_HOTBAR_SLOTS` or [`ACTIVE_HOTBAR_SLOT_CLEARED`].
    pub slot_index: u8,
}

pub fn ensure_player_active_hotbar_row(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_active_hotbar().identity().find(&id).is_some() {
        return;
    }
    let _ = ctx.db.player_active_hotbar().insert(PlayerActiveHotbar {
        identity: id,
        slot_index: 0,
    });
}

#[spacetimedb::reducer]
pub fn set_active_hotbar_slot(ctx: &ReducerContext, slot_index: u8) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("set_active_hotbar_slot blocked: {e}");
        return;
    }
    if slot_index != ACTIVE_HOTBAR_SLOT_CLEARED && slot_index >= NUM_PLAYER_HOTBAR_SLOTS {
        log::warn!("set_active_hotbar_slot: invalid slot_index {slot_index}");
        return;
    }
    let id = ctx.sender();
    if let Some(mut row) = ctx.db.player_active_hotbar().identity().find(&id) {
        row.slot_index = slot_index;
        ctx.db.player_active_hotbar().identity().update(row);
    } else {
        let _ = ctx.db.player_active_hotbar().insert(PlayerActiveHotbar {
            identity: id,
            slot_index,
        });
    }
}

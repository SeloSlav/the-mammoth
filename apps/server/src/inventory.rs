//! Player inventory + hotbar. Rows use `def_id` matching catalog `id` (weapons, materials, etc. — see `items_catalog`).

use spacetimedb::{Identity, ReducerContext, Table};
use log;

use crate::auth;
use crate::inventory_models::{HotbarLocationData, InventoryLocationData, ItemLocation};
use crate::items_catalog;
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};
use crate::player_vitals;

pub(crate) const NUM_PLAYER_INVENTORY_SLOTS: u16 = 24;
pub(crate) const NUM_PLAYER_HOTBAR_SLOTS: u8 = 6;

#[spacetimedb::table(public, accessor = inventory_item)]
pub struct InventoryItem {
    #[primary_key]
    #[auto_inc]
    pub instance_id: u64,
    pub def_id: String,
    pub quantity: u32,
    pub location: ItemLocation,
}

fn player_item_count(ctx: &ReducerContext, owner: Identity) -> usize {
    ctx.db
        .inventory_item()
        .iter()
        .filter(|i| {
            matches!(
                &i.location,
                ItemLocation::Inventory(d) if d.owner_id == owner
            ) || matches!(
                &i.location,
                ItemLocation::Hotbar(d) if d.owner_id == owner
            )
        })
        .count()
}

fn find_item_in_inventory_slot(ctx: &ReducerContext, owner: Identity, slot: u16) -> Option<InventoryItem> {
    ctx.db.inventory_item().iter().find(|i| {
        matches!(
            &i.location,
            ItemLocation::Inventory(d) if d.owner_id == owner && d.slot_index == slot
        )
    })
}

pub(crate) fn find_item_in_hotbar_slot(
    ctx: &ReducerContext,
    owner: Identity,
    slot: u8,
) -> Option<InventoryItem> {
    ctx.db.inventory_item().iter().find(|i| {
        matches!(
            &i.location,
            ItemLocation::Hotbar(d) if d.owner_id == owner && d.slot_index == slot
        )
    })
}

pub(crate) fn get_player_item(ctx: &ReducerContext, instance_id: u64) -> Result<InventoryItem, String> {
    let sender = ctx.sender();
    let row = ctx
        .db
        .inventory_item()
        .instance_id()
        .find(instance_id)
        .ok_or_else(|| format!("item instance {instance_id} not found"))?;
    let ok = match &row.location {
        ItemLocation::Inventory(d) => d.owner_id == sender,
        ItemLocation::Hotbar(d) => d.owner_id == sender,
        ItemLocation::Unknown => false,
    };
    if !ok {
        return Err("item not in caller inventory/hotbar".to_string());
    }
    Ok(row)
}

/// `Ok((new_source_qty, new_target_qty, delete_source))` or `Err` if merge is impossible.
fn try_merge_into(
    source: &InventoryItem,
    target: &InventoryItem,
    max_stack: u32,
) -> Result<(u32, u32, bool), ()> {
    if source.def_id != target.def_id {
        return Err(());
    }
    if max_stack <= 1 {
        return Err(());
    }
    let room = max_stack.saturating_sub(target.quantity);
    if room == 0 {
        return Err(());
    }
    let xfer = source.quantity.min(room);
    let new_target = target.quantity + xfer;
    let new_source = source.quantity - xfer;
    let delete_source = new_source == 0;
    Ok((new_source, new_target, delete_source))
}

fn first_empty_inventory_slot(ctx: &ReducerContext, owner: Identity) -> Option<u16> {
    for slot in 0..NUM_PLAYER_INVENTORY_SLOTS {
        if find_item_in_inventory_slot(ctx, owner, slot).is_none() {
            return Some(slot);
        }
    }
    None
}

fn first_empty_hotbar_slot(ctx: &ReducerContext, owner: Identity) -> Option<u8> {
    for slot in 0..NUM_PLAYER_HOTBAR_SLOTS {
        if find_item_in_hotbar_slot(ctx, owner, slot).is_none() {
            return Some(slot);
        }
    }
    None
}

/// Add [`quantity`] of [`def_id`] into the player's inventory/hotbar (merge into stacks, then empty slots).
/// New stacks use the lowest-index empty **hotbar** slot before any empty inventory slot (world pickups rely on this).
pub(crate) fn try_grant_stack_to_player(
    ctx: &ReducerContext,
    owner: Identity,
    def_id: String,
    mut quantity: u32,
) -> Result<(), String> {
    if quantity == 0 {
        return Err("quantity must be positive".to_string());
    }
    if !items_catalog::is_known_def(&def_id) {
        return Err(format!("unknown def_id {def_id}"));
    }
    let max_stack = items_catalog::max_stack_for(&def_id).unwrap_or(1);
    let inv = ctx.db.inventory_item();

    for row in inv.iter() {
        if row.def_id != def_id {
            continue;
        }
        let owned = match &row.location {
            ItemLocation::Inventory(d) => d.owner_id == owner,
            ItemLocation::Hotbar(d) => d.owner_id == owner,
            ItemLocation::Unknown => false,
        };
        if !owned || quantity == 0 {
            continue;
        }
        if row.quantity >= max_stack {
            continue;
        }
        let room = max_stack - row.quantity;
        let take = quantity.min(room);
        if take == 0 {
            continue;
        }
        let mut u = inv
            .instance_id()
            .find(row.instance_id)
            .ok_or_else(|| "grant: stale item row".to_string())?;
        u.quantity += take;
        quantity -= take;
        inv.instance_id().update(u);
    }

    while quantity > 0 {
        let take = quantity.min(max_stack);
        if let Some(slot) = first_empty_hotbar_slot(ctx, owner) {
            let _ = inv.insert(InventoryItem {
                instance_id: 0,
                def_id: def_id.clone(),
                quantity: take,
                location: ItemLocation::Hotbar(HotbarLocationData {
                    owner_id: owner,
                    slot_index: slot,
                }),
            });
            quantity -= take;
            continue;
        }
        if let Some(slot) = first_empty_inventory_slot(ctx, owner) {
            let _ = inv.insert(InventoryItem {
                instance_id: 0,
                def_id: def_id.clone(),
                quantity: take,
                location: ItemLocation::Inventory(InventoryLocationData {
                    owner_id: owner,
                    slot_index: slot,
                }),
            });
            quantity -= take;
            continue;
        }
        return Err("inventory full".to_string());
    }
    Ok(())
}

/// Remove [`quantity`] from a stack in the caller's inventory/hotbar (deletes row if emptied).
pub(crate) fn remove_player_item_quantity(
    ctx: &ReducerContext,
    instance_id: u64,
    quantity: u32,
) -> Result<(String, u32), String> {
    let mut row = get_player_item(ctx, instance_id)?;
    let def_id = row.def_id.clone();
    let max_stack = items_catalog::max_stack_for(&def_id)
        .ok_or_else(|| format!("unknown def_id {}", row.def_id))?;
    if quantity == 0 {
        return Err("cannot remove quantity 0".to_string());
    }
    if quantity > row.quantity {
        return Err(format!(
            "cannot remove {quantity} items (only {} in stack)",
            row.quantity
        ));
    }
    if quantity < row.quantity && max_stack <= 1 {
        return Err("cannot split this stack".to_string());
    }
    let inv = ctx.db.inventory_item();
    if quantity == row.quantity {
        let mut tmp = inv
            .instance_id()
            .find(instance_id)
            .ok_or_else(|| "remove: row missing".to_string())?;
        tmp.location = ItemLocation::Unknown;
        inv.instance_id().update(tmp);
        inv.instance_id().delete(instance_id);
    } else {
        row.quantity -= quantity;
        inv.instance_id().update(row);
    }
    Ok((def_id, quantity))
}

pub(crate) fn move_between_player_slots(
    ctx: &ReducerContext,
    item_instance_id: u64,
    dest: ItemLocation,
) -> Result<(), String> {
    let sender = ctx.sender();
    let inv = ctx.db.inventory_item();

    match &dest {
        ItemLocation::Inventory(d) => {
            if d.owner_id != sender {
                return Err("destination owner mismatch".to_string());
            }
            if d.slot_index >= NUM_PLAYER_INVENTORY_SLOTS {
                return Err("bad inventory slot".to_string());
            }
        }
        ItemLocation::Hotbar(d) => {
            if d.owner_id != sender {
                return Err("destination owner mismatch".to_string());
            }
            if d.slot_index >= NUM_PLAYER_HOTBAR_SLOTS {
                return Err("bad hotbar slot".to_string());
            }
        }
        ItemLocation::Unknown => return Err("invalid destination".to_string()),
    }

    let mut item_to_move = get_player_item(ctx, item_instance_id)?;
    let max_stack = items_catalog::max_stack_for(&item_to_move.def_id)
        .ok_or_else(|| format!("unknown def_id {}", item_to_move.def_id))?;

    let original_location = item_to_move.location.clone();

    let target_opt = match &dest {
        ItemLocation::Inventory(d) => find_item_in_inventory_slot(ctx, sender, d.slot_index),
        ItemLocation::Hotbar(d) => find_item_in_hotbar_slot(ctx, sender, d.slot_index),
        ItemLocation::Unknown => None,
    };

    if let Some(target_item) = target_opt {
        if target_item.instance_id == item_instance_id {
            item_to_move.location = dest.clone();
            inv.instance_id().update(item_to_move);
            return Ok(());
        }

        match try_merge_into(&item_to_move, &target_item, max_stack) {
            Ok((new_source_qty, new_target_qty, delete_source)) => {
                let mut tgt = inv
                    .instance_id()
                    .find(target_item.instance_id)
                    .ok_or_else(|| "merge: target row missing".to_string())?;
                tgt.quantity = new_target_qty;
                inv.instance_id().update(tgt);

                if delete_source {
                    let mut del = inv
                        .instance_id()
                        .find(item_instance_id)
                        .ok_or_else(|| "merge: source row missing".to_string())?;
                    del.location = ItemLocation::Unknown;
                    inv.instance_id().update(del);
                    inv.instance_id().delete(item_instance_id);
                } else {
                    let mut src = inv
                        .instance_id()
                        .find(item_instance_id)
                        .ok_or_else(|| "merge: source row missing".to_string())?;
                    src.quantity = new_source_qty;
                    src.location = original_location.clone();
                    inv.instance_id().update(src);
                }
            }
            Err(()) => {
                let mut occ = inv
                    .instance_id()
                    .find(target_item.instance_id)
                    .ok_or_else(|| "swap: target row missing".to_string())?;
                occ.location = original_location.clone();
                inv.instance_id().update(occ);

                let mut mv = inv
                    .instance_id()
                    .find(item_instance_id)
                    .ok_or_else(|| "swap: source row missing".to_string())?;
                mv.location = dest.clone();
                inv.instance_id().update(mv);
            }
        }
    } else {
        let mut mv = inv
            .instance_id()
            .find(item_instance_id)
            .ok_or_else(|| "place: item row missing".to_string())?;
        mv.location = dest.clone();
        inv.instance_id().update(mv);
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn move_item_to_inventory(ctx: &ReducerContext, item_instance_id: u64, target_inventory_slot: u16) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("move_item_to_inventory blocked: {e}");
        return;
    }
    let dest = ItemLocation::Inventory(InventoryLocationData {
        owner_id: ctx.sender(),
        slot_index: target_inventory_slot,
    });
    if let Err(e) = move_between_player_slots(ctx, item_instance_id, dest) {
        log::warn!("move_item_to_inventory: {e}");
    }
}

#[spacetimedb::reducer]
pub fn move_item_to_hotbar(ctx: &ReducerContext, item_instance_id: u64, target_hotbar_slot: u8) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("move_item_to_hotbar blocked: {e}");
        return;
    }
    let dest = ItemLocation::Hotbar(HotbarLocationData {
        owner_id: ctx.sender(),
        slot_index: target_hotbar_slot,
    });
    if let Err(e) = move_between_player_slots(ctx, item_instance_id, dest) {
        log::warn!("move_item_to_hotbar: {e}");
    }
}

/// Use one consumable from a hotbar slot: clears the combat rail (see `player_active_hotbar`), then
/// removes one item and applies vitals from catalog [`items_catalog::instant_hotbar_consume_vital_deltas`].
/// Caller should select that slot client-side before invoking.
#[spacetimedb::reducer]
pub fn consume_hotbar_item(ctx: &ReducerContext, hotbar_slot: u8) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("consume_hotbar_item blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    if hotbar_slot >= NUM_PLAYER_HOTBAR_SLOTS {
        log::warn!("consume_hotbar_item: invalid hotbar_slot {hotbar_slot}");
        return;
    }

    if let Some(mut rail) = ctx.db.player_active_hotbar().identity().find(&sender) {
        if rail.slot_index != ACTIVE_HOTBAR_SLOT_CLEARED {
            rail.slot_index = ACTIVE_HOTBAR_SLOT_CLEARED;
            ctx.db.player_active_hotbar().identity().update(rail);
        }
    }

    let Some(item) = find_item_in_hotbar_slot(ctx, sender, hotbar_slot) else {
        log::debug!("consume_hotbar_item: empty hotbar slot {hotbar_slot}");
        return;
    };
    let Some((dhp, dh, dy)) = items_catalog::instant_hotbar_consume_vital_deltas(&item.def_id) else {
        log::debug!(
            "consume_hotbar_item: no instant use for {} (need category consumable + consumeOnUse vitals)",
            item.def_id
        );
        return;
    };

    let instance_id = item.instance_id;
    if let Err(e) = remove_player_item_quantity(ctx, instance_id, 1) {
        log::warn!("consume_hotbar_item: remove failed: {e}");
        return;
    }

    player_vitals::apply_instant_vital_deltas(ctx, sender, dhp, dh, dy);
}

/// Brand-new players (no inventory rows yet) spawn with melee tools in hotbar 0–3
/// plus stackable `apple` / `water_bottle` in slots 4–5.
pub(crate) fn ensure_starter_loadout(ctx: &ReducerContext, owner: Identity) {
    if player_item_count(ctx, owner) > 0 {
        return;
    }
    for def in [
        "knife",
        "crowbar",
        "srbosjek",
        "baseball_bat",
        "apple",
        "water_bottle",
    ] {
        if !items_catalog::is_known_def(def) {
            log::error!("starter loadout: catalog missing {def}");
            return;
        }
    }

    let _ = ctx.db.inventory_item().insert(InventoryItem {
        instance_id: 0,
        def_id: "knife".to_string(),
        quantity: 1,
        location: ItemLocation::Hotbar(HotbarLocationData {
            owner_id: owner,
            slot_index: 0,
        }),
    });
    let _ = ctx.db.inventory_item().insert(InventoryItem {
        instance_id: 0,
        def_id: "crowbar".to_string(),
        quantity: 1,
        location: ItemLocation::Hotbar(HotbarLocationData {
            owner_id: owner,
            slot_index: 1,
        }),
    });
    let _ = ctx.db.inventory_item().insert(InventoryItem {
        instance_id: 0,
        def_id: "srbosjek".to_string(),
        quantity: 1,
        location: ItemLocation::Hotbar(HotbarLocationData {
            owner_id: owner,
            slot_index: 2,
        }),
    });
    let _ = ctx.db.inventory_item().insert(InventoryItem {
        instance_id: 0,
        def_id: "baseball_bat".to_string(),
        quantity: 1,
        location: ItemLocation::Hotbar(HotbarLocationData {
            owner_id: owner,
            slot_index: 3,
        }),
    });
    let _ = ctx.db.inventory_item().insert(InventoryItem {
        instance_id: 0,
        def_id: "apple".to_string(),
        quantity: 8,
        location: ItemLocation::Hotbar(HotbarLocationData {
            owner_id: owner,
            slot_index: 4,
        }),
    });
    let _ = ctx.db.inventory_item().insert(InventoryItem {
        instance_id: 0,
        def_id: "water_bottle".to_string(),
        quantity: 6,
        location: ItemLocation::Hotbar(HotbarLocationData {
            owner_id: owner,
            slot_index: 5,
        }),
    });
}

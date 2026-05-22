//! Player inventory + hotbar. Rows use `def_id` matching catalog `id` (weapons, materials, etc. — see `items_catalog`).

mod starting_item;

use log;
use spacetimedb::{Identity, ReducerContext, Table};

use crate::auth;
use crate::inventory_models::{HotbarLocationData, InventoryLocationData, ItemLocation};
use crate::items_catalog;
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};
use crate::player_vitals;
use crate::pose::player_pose;
use crate::world_sound;

pub(crate) use starting_item::{
    ensure_starter_footlocker_grow_op, ensure_starter_fridge, ensure_starter_loadout,
    reset_player_loadout_for_respawn,
};

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

pub(super) fn player_item_count(ctx: &ReducerContext, owner: Identity) -> usize {
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

/// Removes every hotbar + backpack row for `owner`. Stash rows are untouched.
pub(crate) fn delete_all_player_inventory_and_hotbar_items(ctx: &ReducerContext, owner: Identity) {
    let to_delete: Vec<u64> = ctx
        .db
        .inventory_item()
        .iter()
        .filter_map(|i| match &i.location {
            ItemLocation::Hotbar(h) if h.owner_id == owner => Some(i.instance_id),
            ItemLocation::Inventory(inv) if inv.owner_id == owner => Some(i.instance_id),
            _ => None,
        })
        .collect();
    let inv = ctx.db.inventory_item();
    for instance_id in to_delete {
        inv.instance_id().delete(instance_id);
    }
}

pub(crate) const NUM_STASH_SLOTS: u16 = 24;

pub(crate) fn find_item_in_stash_slot(
    ctx: &ReducerContext,
    owner_identity: Identity,
    stash_key: &str,
    slot: u16,
) -> Option<InventoryItem> {
    ctx.db.inventory_item().iter().find(|i| {
        matches!(
            &i.location,
            ItemLocation::Stash(s)
                if s.owner_identity == owner_identity
                    && crate::apartment_stash_location_match::apartment_stash_locations_match(
                        ctx,
                        &s.unit_key,
                        stash_key,
                    )
                    && s.slot_index == slot
        )
    })
}

/// Find hotbar/inventory stacks for merge targets (stash reducers, …).
pub(crate) fn find_item_in_inventory_slot(
    ctx: &ReducerContext,
    owner: Identity,
    slot: u16,
) -> Option<InventoryItem> {
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

pub(crate) fn get_player_item(
    ctx: &ReducerContext,
    instance_id: u64,
) -> Result<InventoryItem, String> {
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
        ItemLocation::Stash(_) => false,
        ItemLocation::Unknown => false,
    };
    if !ok {
        return Err("item not in caller inventory/hotbar".to_string());
    }
    Ok(row)
}

/// Remove [`quantity`] from a stash slot (deletes row when emptied).
pub(crate) fn remove_stash_item_quantity(
    ctx: &ReducerContext,
    owner: Identity,
    stash_key: &str,
    slot: u16,
    quantity: u32,
) -> Result<(), String> {
    let item = find_item_in_stash_slot(ctx, owner, stash_key, slot)
        .ok_or_else(|| "stash slot empty".to_string())?;
    if quantity == 0 {
        return Err("cannot remove quantity 0".to_string());
    }
    if quantity > item.quantity {
        return Err(format!(
            "cannot remove {quantity} items (only {} in stack)",
            item.quantity
        ));
    }
    let inv = ctx.db.inventory_item();
    if quantity == item.quantity {
        inv.instance_id().delete(item.instance_id);
    } else {
        let mut row = item;
        row.quantity -= quantity;
        inv.instance_id().update(row);
    }
    Ok(())
}

/// `Ok((new_source_qty, new_target_qty, delete_source))` or `Err` if merge is impossible.
pub(crate) fn try_merge_into(
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

/// Lowest-index empty hotbar slot, else lowest-index empty inventory slot.
pub(crate) fn first_empty_player_carry_slot(
    ctx: &ReducerContext,
    owner: Identity,
) -> Option<ItemLocation> {
    if let Some(slot) = first_empty_hotbar_slot(ctx, owner) {
        return Some(ItemLocation::Hotbar(HotbarLocationData {
            owner_id: owner,
            slot_index: slot,
        }));
    }
    if let Some(slot) = first_empty_inventory_slot(ctx, owner) {
        return Some(ItemLocation::Inventory(InventoryLocationData {
            owner_id: owner,
            slot_index: slot,
        }));
    }
    None
}

fn merge_grant_into_player_stack(
    ctx: &ReducerContext,
    def_id: &str,
    max_stack: u32,
    quantity: &mut u32,
    row: &InventoryItem,
) -> Result<(), String> {
    if *quantity == 0 || row.def_id != def_id || row.quantity >= max_stack {
        return Ok(());
    }
    let room = max_stack - row.quantity;
    let take = (*quantity).min(room);
    if take == 0 {
        return Ok(());
    }
    let inv = ctx.db.inventory_item();
    let mut u = inv
        .instance_id()
        .find(row.instance_id)
        .ok_or_else(|| "grant: stale item row".to_string())?;
    u.quantity += take;
    *quantity -= take;
    inv.instance_id().update(u);
    Ok(())
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

    for slot in 0..NUM_PLAYER_HOTBAR_SLOTS {
        if quantity == 0 {
            break;
        }
        if let Some(row) = find_item_in_hotbar_slot(ctx, owner, slot) {
            merge_grant_into_player_stack(ctx, &def_id, max_stack, &mut quantity, &row)?;
        }
    }
    for slot in 0..NUM_PLAYER_INVENTORY_SLOTS {
        if quantity == 0 {
            break;
        }
        if let Some(row) = find_item_in_inventory_slot(ctx, owner, slot) {
            merge_grant_into_player_stack(ctx, &def_id, max_stack, &mut quantity, &row)?;
        }
    }

    while quantity > 0 {
        let take = quantity.min(max_stack);
        if let Some(slot) = first_empty_hotbar_slot(ctx, owner) {
            let row = inv.insert(InventoryItem {
                instance_id: 0,
                def_id: def_id.clone(),
                quantity: take,
                location: ItemLocation::Hotbar(HotbarLocationData {
                    owner_id: owner,
                    slot_index: slot,
                }),
            });
            crate::water_container::on_water_bottle_inventory_inserted(ctx, &row);
            quantity -= take;
            continue;
        }
        if let Some(slot) = first_empty_inventory_slot(ctx, owner) {
            let row = inv.insert(InventoryItem {
                instance_id: 0,
                def_id: def_id.clone(),
                quantity: take,
                location: ItemLocation::Inventory(InventoryLocationData {
                    owner_id: owner,
                    slot_index: slot,
                }),
            });
            crate::water_container::on_water_bottle_inventory_inserted(ctx, &row);
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

fn effective_move_quantity(source_qty: u32, quantity_to_move: u32) -> Result<u32, String> {
    if quantity_to_move == 0 {
        Ok(source_qty)
    } else if quantity_to_move > source_qty {
        Err(format!(
            "cannot move {quantity_to_move} items (only {source_qty} in stack)"
        ))
    } else {
        Ok(quantity_to_move)
    }
}

/// Move some or all units from one inventory row into `dest` (empty slot, merge, swap, or split).
/// `quantity_to_move == 0` means move the entire stack.
pub(crate) fn transfer_inventory_row_quantity(
    ctx: &ReducerContext,
    item_instance_id: u64,
    dest: ItemLocation,
    target_opt: Option<InventoryItem>,
    quantity_to_move: u32,
) -> Result<(), String> {
    let inv = ctx.db.inventory_item();
    let item_to_move = inv
        .instance_id()
        .find(item_instance_id)
        .ok_or_else(|| format!("item instance {item_instance_id} not found"))?;

    let qty = effective_move_quantity(item_to_move.quantity, quantity_to_move)?;
    let max_stack = items_catalog::max_stack_for(&item_to_move.def_id)
        .ok_or_else(|| format!("unknown def_id {}", item_to_move.def_id))?;

    if qty < item_to_move.quantity {
        if max_stack <= 1 {
            return Err("cannot split this stack".to_string());
        }
        if let Some(target_item) = target_opt {
            if target_item.instance_id == item_instance_id {
                return Ok(());
            }
            if target_item.def_id != item_to_move.def_id {
                return Err("cannot split onto a different item".to_string());
            }
            let room = max_stack.saturating_sub(target_item.quantity);
            let xfer = qty.min(room);
            if xfer == 0 {
                return Err("target stack full".to_string());
            }
            let mut tgt = inv
                .instance_id()
                .find(target_item.instance_id)
                .ok_or_else(|| "split merge: target row missing".to_string())?;
            tgt.quantity += xfer;
            inv.instance_id().update(tgt);

            let mut src = inv
                .instance_id()
                .find(item_instance_id)
                .ok_or_else(|| "split merge: source row missing".to_string())?;
            src.quantity -= xfer;
            inv.instance_id().update(src);
            return Ok(());
        }

        let mut src = inv
            .instance_id()
            .find(item_instance_id)
            .ok_or_else(|| "split place: source row missing".to_string())?;
        src.quantity -= qty;
        inv.instance_id().update(src);

        let row = inv.insert(InventoryItem {
            instance_id: 0,
            def_id: item_to_move.def_id.clone(),
            quantity: qty,
            location: dest,
        });
        crate::water_container::on_water_bottle_inventory_inserted(ctx, &row);
        return Ok(());
    }

    let original_location = item_to_move.location.clone();

    if let Some(target_item) = target_opt {
        if target_item.instance_id == item_instance_id {
            let mut mv = inv
                .instance_id()
                .find(item_instance_id)
                .ok_or_else(|| "same-slot move: item row missing".to_string())?;
            mv.location = dest.clone();
            inv.instance_id().update(mv);
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

pub(crate) fn move_between_player_slots(
    ctx: &ReducerContext,
    item_instance_id: u64,
    dest: ItemLocation,
    quantity_to_move: u32,
) -> Result<(), String> {
    let sender = ctx.sender();

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
        ItemLocation::Stash(_) => {
            return Err("stash transfers use dedicated reducers".to_string());
        }
        ItemLocation::Unknown => return Err("invalid destination".to_string()),
    };

    let _item_to_move = get_player_item(ctx, item_instance_id)?;

    let target_opt = match &dest {
        ItemLocation::Inventory(d) => find_item_in_inventory_slot(ctx, sender, d.slot_index),
        ItemLocation::Hotbar(d) => find_item_in_hotbar_slot(ctx, sender, d.slot_index),
        ItemLocation::Stash(_) | ItemLocation::Unknown => None,
    };

    transfer_inventory_row_quantity(ctx, item_instance_id, dest, target_opt, quantity_to_move)
}

#[spacetimedb::reducer]
pub fn move_item_to_inventory(
    ctx: &ReducerContext,
    item_instance_id: u64,
    target_inventory_slot: u16,
    quantity_to_move: u32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("move_item_to_inventory blocked: {e}");
        return;
    }
    let dest = ItemLocation::Inventory(InventoryLocationData {
        owner_id: ctx.sender(),
        slot_index: target_inventory_slot,
    });
    if let Err(e) = move_between_player_slots(ctx, item_instance_id, dest, quantity_to_move) {
        log::warn!("move_item_to_inventory: {e}");
    }
}

#[spacetimedb::reducer]
pub fn move_item_to_hotbar(
    ctx: &ReducerContext,
    item_instance_id: u64,
    target_hotbar_slot: u8,
    quantity_to_move: u32,
) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("move_item_to_hotbar blocked: {e}");
        return;
    }
    let dest = ItemLocation::Hotbar(HotbarLocationData {
        owner_id: ctx.sender(),
        slot_index: target_hotbar_slot,
    });
    if let Err(e) = move_between_player_slots(ctx, item_instance_id, dest, quantity_to_move) {
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

    if player_vitals::hotbar_instant_consume_on_cooldown(ctx, sender) {
        log::debug!("consume_hotbar_item: instant consume cooldown active");
        return;
    }

    if player_vitals::is_player_dead(ctx, sender) {
        log::debug!("consume_hotbar_item: dead players cannot consume");
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

    if crate::water_container::is_water_container_def(&item.def_id) {
        crate::water_container::drink_water_bottle_from_hotbar(ctx, sender, hotbar_slot);
        return;
    }

    let Some((dhp, dh, dy)) = items_catalog::instant_hotbar_consume_vital_deltas(&item.def_id)
    else {
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

    player_vitals::apply_instant_vital_deltas(ctx, sender, dhp, dh, dy, true);

    let kind = match items_catalog::hotbar_consume_sound(&item.def_id) {
        items_catalog::HotbarConsumeSound::Eat => world_sound::KIND_CONSUME_EAT,
        items_catalog::HotbarConsumeSound::Drink => world_sound::KIND_CONSUME_DRINK,
        items_catalog::HotbarConsumeSound::Smoke => world_sound::KIND_CONSUME_SMOKE,
    };
    if let Some(pose) = ctx.db.player_pose().identity().find(&sender) {
        world_sound::emit_hotbar_consume_at(ctx, kind, pose.x, pose.y + 0.92, pose.z, sender);
    }
}

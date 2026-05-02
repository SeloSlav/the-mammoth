//! Crafting queue (authoritative) + lightweight HUD toast rows for pickup receipts and craft-complete pings.
//!
//! Recipes are intentionally small curated constants (`CRAFT_*`). Expand with catalog-driven data later.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};

use crate::auth;
use crate::inventory;
use crate::inventory::inventory_item;
use crate::inventory_models::ItemLocation;
use crate::items_catalog;
use crate::player_vitals;

pub const HUD_TOAST_KIND_ITEM_RECEIVED: u8 = 0;
pub const HUD_TOAST_KIND_CRAFT_COMPLETE: u8 = 1;

pub const CRAFT_RECIPE_DOOR_LOCK_ID: u8 = 1;
const DOOR_LOCK_OUTPUT_DEF: &str = "door-lock";
const DOOR_LOCK_SCRAP_COST: u32 = 3;
const SCREWDRIVER_DEF: &str = "screwdriver";
/// Wall time for one door-lock assemble (matches client copy in `fpCraftRecipes.ts`).
const DOOR_LOCK_CRAFT_MICROS: i64 = 12 * 1_000_000;

/// Max queued rows per player (waiting + active).
const MAX_QUEUE_PER_PLAYER: usize = 14;

#[spacetimedb::table(public, accessor = craft_queue_item)]
pub struct CraftQueueItem {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub owner: Identity,
    pub recipe_id: u8,
    pub order_index: u32,
    /// `0` = waiting for idle bench / prior crafts; otherwise wall clock µs epoch when materials were consumed.
    pub start_micros: i64,
    pub finish_micros: i64,
}

#[spacetimedb::table(public, accessor = hud_toast_event)]
pub struct HudToastEvent {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub recipient: Identity,
    pub toast_kind: u8,
    pub def_id: String,
    pub quantity: u32,
    pub created_at: Timestamp,
}

#[spacetimedb::table(
    public,
    accessor = craft_queue_tick,
    scheduled(tick_craft_queue_step)
)]
pub struct CraftQueueTickSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::table(
    public,
    accessor = hud_toast_cleanup_tick,
    scheduled(cleanup_old_hud_toasts_step)
)]
pub struct HudToastCleanupSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

const TICK_INTERVAL_MICROS: i64 = 1_000_000;
/// Drop toast rows older than this to keep subscriptions light.
const HUD_TOAST_RETENTION_MICROS: i64 = 180_000_000;

#[inline]
fn carrier_owns(row: &inventory::InventoryItem, owner: Identity) -> bool {
    match &row.location {
        ItemLocation::Inventory(d) => d.owner_id == owner,
        ItemLocation::Hotbar(d) => d.owner_id == owner,
        _ => false,
    }
}

fn carrier_def_count(ctx: &ReducerContext, owner: Identity, def_id: &str) -> u32 {
    let mut sum = 0u32;
    for row in ctx.db.inventory_item().iter() {
        if !carrier_owns(&row, owner) || row.def_id != def_id {
            continue;
        }
        sum = sum.saturating_add(row.quantity);
    }
    sum
}

fn carrier_has_tools(ctx: &ReducerContext, owner: Identity, def_id: &str, min: u32) -> bool {
    carrier_def_count(ctx, owner, def_id) >= min
}

fn consume_carrier_def_quantity(
    ctx: &ReducerContext,
    owner: Identity,
    def_id: &str,
    mut remaining: u32,
) -> Result<(), String> {
    if remaining == 0 {
        return Ok(());
    }

    let mut stacks: Vec<u64> = ctx
        .db
        .inventory_item()
        .iter()
        .filter_map(|r| {
            if carrier_owns(&r, owner) && r.def_id == def_id {
                Some(r.instance_id)
            } else {
                None
            }
        })
        .collect();
    stacks.sort_unstable();

    for instance_id in stacks {
        if remaining == 0 {
            break;
        }
        let Some(row) = ctx.db.inventory_item().instance_id().find(instance_id) else {
            continue;
        };
        if row.def_id != def_id || !carrier_owns(&row, owner) {
            continue;
        }
        let take = remaining.min(row.quantity);
        inventory::remove_player_item_quantity(ctx, instance_id, take)?;
        remaining -= take;
    }

    if remaining > 0 {
        return Err(format!("not enough {def_id}"));
    }
    Ok(())
}

#[inline]
fn now_micros(ctx: &ReducerContext) -> i64 {
    ctx.timestamp.to_micros_since_unix_epoch()
}

fn owner_has_active_craft(ctx: &ReducerContext, owner: Identity, now: i64) -> bool {
    ctx.db.craft_queue_item().iter().any(|q| {
        q.owner == owner && q.start_micros > 0 && q.finish_micros > now
    })
}

fn next_order_index(ctx: &ReducerContext, owner: Identity) -> u32 {
    ctx.db
        .craft_queue_item()
        .iter()
        .filter(|q| q.owner == owner)
        .map(|q| q.order_index)
        .max()
        .unwrap_or(0)
        .saturating_add(1)
}

fn queue_len_for_owner(ctx: &ReducerContext, owner: Identity) -> usize {
    ctx.db
        .craft_queue_item()
        .iter()
        .filter(|q| q.owner == owner)
        .count()
}

/// Try to start the next waiting door-lock craft for `owner`.
fn try_activate_waiting_for_owner(ctx: &ReducerContext, owner: Identity) {
    let now = now_micros(ctx);
    if owner_has_active_craft(ctx, owner, now) {
        return;
    }

    let mut waiting: Vec<_> = ctx
        .db
        .craft_queue_item()
        .iter()
        .filter(|q| q.owner == owner && q.start_micros == 0)
        .collect();
    waiting.sort_by_key(|q| q.order_index);
    let Some(next) = waiting.into_iter().next() else {
        return;
    };

    if next.recipe_id != CRAFT_RECIPE_DOOR_LOCK_ID {
        log::warn!("crafting: dropping unknown recipe_id {}", next.recipe_id);
        ctx.db.craft_queue_item().id().delete(next.id);
        try_activate_waiting_for_owner(ctx, owner);
        return;
    }

    if player_vitals::is_player_dead(ctx, owner) {
        return;
    }
    if !carrier_has_tools(ctx, owner, SCREWDRIVER_DEF, 1) {
        ctx.db.craft_queue_item().id().delete(next.id);
        try_activate_waiting_for_owner(ctx, owner);
        return;
    }
    if carrier_def_count(ctx, owner, "scrap-metal") < DOOR_LOCK_SCRAP_COST {
        ctx.db.craft_queue_item().id().delete(next.id);
        try_activate_waiting_for_owner(ctx, owner);
        return;
    }

    if let Err(e) = consume_carrier_def_quantity(ctx, owner, "scrap-metal", DOOR_LOCK_SCRAP_COST) {
        log::warn!("crafting: consume scrap failed queue {}: {e}", next.id);
        ctx.db.craft_queue_item().id().delete(next.id);
        try_activate_waiting_for_owner(ctx, owner);
        return;
    }

    let finish = now + DOOR_LOCK_CRAFT_MICROS;
    let Some(mut row) = ctx.db.craft_queue_item().id().find(next.id) else {
        return;
    };
    row.start_micros = now;
    row.finish_micros = finish;
    ctx.db.craft_queue_item().id().update(row);
}

fn complete_door_lock_job(ctx: &ReducerContext, job: CraftQueueItem) {
    let owner = job.owner;
    if player_vitals::is_player_dead(ctx, owner) {
        ctx.db.craft_queue_item().id().delete(job.id);
        try_activate_waiting_for_owner(ctx, owner);
        return;
    }
    if let Err(e) =
        inventory::try_grant_stack_to_player(ctx, owner, DOOR_LOCK_OUTPUT_DEF.into(), 1)
    {
        log::error!("crafting: grant {} failed {:?}: {e}", DOOR_LOCK_OUTPUT_DEF, owner);
        ctx.db.craft_queue_item().id().delete(job.id);
        try_activate_waiting_for_owner(ctx, owner);
        return;
    }

    emit_hud_toast(
        ctx,
        owner,
        HUD_TOAST_KIND_CRAFT_COMPLETE,
        DOOR_LOCK_OUTPUT_DEF.to_string(),
        1,
    );
    ctx.db.craft_queue_item().id().delete(job.id);
    try_activate_waiting_for_owner(ctx, owner);
}

#[spacetimedb::reducer]
pub fn tick_craft_queue_step(ctx: &ReducerContext, _arg: CraftQueueTickSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    let now = now_micros(ctx);

    let due: Vec<CraftQueueItem> = ctx
        .db
        .craft_queue_item()
        .iter()
        .filter(|q| q.start_micros > 0 && q.finish_micros <= now && q.finish_micros > 0)
        .collect();

    for job in due {
        if job.recipe_id == CRAFT_RECIPE_DOOR_LOCK_ID {
            complete_door_lock_job(ctx, job);
        } else {
            ctx.db.craft_queue_item().id().delete(job.id);
            try_activate_waiting_for_owner(ctx, job.owner);
        }
    }
}

#[spacetimedb::reducer]
pub fn cleanup_old_hud_toasts_step(ctx: &ReducerContext, _arg: HudToastCleanupSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    let cutoff = ctx.timestamp - TimeDuration::from_micros(HUD_TOAST_RETENTION_MICROS);
    let ids: Vec<u64> = ctx
        .db
        .hud_toast_event()
        .iter()
        .filter(|t| t.created_at < cutoff)
        .map(|t| t.id)
        .collect();
    for id in ids {
        ctx.db.hud_toast_event().id().delete(id);
    }
}

pub fn start_craft_queue_tick_schedule(ctx: &ReducerContext) {
    if ctx.db.craft_queue_tick().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(TICK_INTERVAL_MICROS);
    let _ = ctx.db.craft_queue_tick().insert(CraftQueueTickSchedule {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

pub fn start_hud_toast_cleanup_schedule(ctx: &ReducerContext) {
    if ctx.db.hud_toast_cleanup_tick().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(45_000_000);
    let _ = ctx.db.hud_toast_cleanup_tick().insert(HudToastCleanupSchedule {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

#[spacetimedb::reducer]
pub fn enqueue_craft(ctx: &ReducerContext, recipe_id: u8) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("enqueue_craft blocked: {e}");
        return;
    }
    let owner = ctx.sender();
    if player_vitals::is_player_dead(ctx, owner) {
        return;
    }
    if recipe_id != CRAFT_RECIPE_DOOR_LOCK_ID || !items_catalog::is_known_def(DOOR_LOCK_OUTPUT_DEF) {
        log::debug!("enqueue_craft: unsupported recipe {}", recipe_id);
        return;
    }

    if queue_len_for_owner(ctx, owner) >= MAX_QUEUE_PER_PLAYER {
        log::debug!("enqueue_craft: queue full");
        return;
    }

    let order_index = next_order_index(ctx, owner);
    let _ = ctx.db.craft_queue_item().insert(CraftQueueItem {
        id: 0,
        owner,
        recipe_id,
        order_index,
        start_micros: 0,
        finish_micros: 0,
    });

    try_activate_waiting_for_owner(ctx, owner);
}

#[spacetimedb::reducer]
pub fn cancel_waiting_craft(ctx: &ReducerContext, queue_item_id: u64) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("cancel_waiting_craft blocked: {e}");
        return;
    }
    let owner = ctx.sender();
    let Some(row) = ctx.db.craft_queue_item().id().find(queue_item_id) else {
        return;
    };
    if row.owner != owner || row.start_micros != 0 {
        return;
    }
    ctx.db.craft_queue_item().id().delete(queue_item_id);
}

pub fn emit_hud_toast(
    ctx: &ReducerContext,
    recipient: Identity,
    toast_kind: u8,
    def_id: String,
    quantity: u32,
) {
    let _ = ctx.db.hud_toast_event().insert(HudToastEvent {
        id: 0,
        recipient,
        toast_kind,
        def_id,
        quantity,
        created_at: ctx.timestamp,
    });
}

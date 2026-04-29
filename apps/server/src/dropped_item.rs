//! World pickups: drag-out from inventory/hotbar → `drop_item`, `E` / reducer → `pickup_dropped_item`.
//! Static world loot uses the **same** `dropped_item` rows with [`DroppedItem.world_spawn_slot`], filled on
//! `init`, refreshed on a timer with weighted RNG. Player drops stay `world_spawn_slot = None`; cleanup only
//! ages those rows so server-spawn piles do not silently despawn mid-session.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};

use crate::auth;
use crate::inventory::{
    get_player_item, inventory_item, remove_player_item_quantity, try_grant_stack_to_player,
};
use crate::items_catalog;
use crate::pose::{player_pose, PlayerPose};
use crate::world_sound;

/// Squared max distance (m²) from player feet to allow pickup.
const PICKUP_RADIUS_SQ: f32 = 2.75 * 2.75;
/// Forward offset along look direction when spawning a drop (m).
const DROP_FORWARD_M: f32 = 0.55;
/// Lift mesh slightly above replicated foot height to avoid z-fighting (m).
const DROP_Y_LIFT_M: f32 = 0.08;
/// Remove drops older than this (seconds) during periodic cleanup.
const DROP_DESPAWN_SECS: i64 = 900;
/// How often to reroll anchored world loot (random defs/qty/yaw).
const WORLD_LOOT_REFRESH_MICROS: i64 = 180 * 1_000_000;

/// Authoring anchors (hall / corridor — keep clear of elevators in data later).
/// Index IS `world_spawn_slot`.
const WORLD_LOOT_ANCHORS: &[(f32, f32, f32)] = &[
    (0.85, 3.52, -15.42),
    (1.1, 3.52, -40.15),
    (1.95, 3.52, -88.42),
    (-0.72, 3.52, 22.1),
    (0.62, 1.82, -0.4),
];

/// `(def_id, qty_min_inclusive, qty_max_inclusive, weight)`.
const WORLD_LOOT_TIERS: &[(&str, u32, u32, u32)] = &[
    ("cigarettes", 4, 12, 4),
    ("nails", 8, 20, 5),
    ("ammo-9mm", 8, 18, 4),
    ("scrap-metal", 1, 4, 3),
    ("pistol", 1, 1, 1),
    ("bandage-roll", 1, 3, 2),
];

#[spacetimedb::table(public, accessor = dropped_item)]
pub struct DroppedItem {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub def_id: String,
    pub quantity: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    /// Body yaw at drop time (radians) — client presentation only.
    pub yaw: f32,
    pub created_at: Timestamp,
    /// `Some(slot)` = static world spawn anchor; `None` = player drop or death scatter.
    pub world_spawn_slot: Option<u16>,
}

#[spacetimedb::table(
    public,
    accessor = dropped_item_cleanup,
    scheduled(cleanup_old_dropped_items)
)]
pub struct DroppedItemCleanup {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::table(
    public,
    accessor = world_loot_refresh,
    scheduled(refresh_world_loot_spawns)
)]
pub struct WorldLootRefresh {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

#[spacetimedb::reducer]
pub fn cleanup_old_dropped_items(ctx: &ReducerContext, _arg: DroppedItemCleanup) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    let cutoff = ctx.timestamp - TimeDuration::from_micros(DROP_DESPAWN_SECS * 1_000_000);
    let ids: Vec<u64> = ctx
        .db
        .dropped_item()
        .iter()
        .filter(|d| d.world_spawn_slot.is_none() && d.created_at < cutoff)
        .map(|d| d.id)
        .collect();
    for id in ids {
        ctx.db.dropped_item().id().delete(id);
    }
}

pub fn start_dropped_item_cleanup_schedule(ctx: &ReducerContext) {
    if ctx.db.dropped_item_cleanup().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(120_000_000); // 2 minutes
    let _ = ctx.db.dropped_item_cleanup().insert(DroppedItemCleanup {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

pub fn start_world_loot_refresh_schedule(ctx: &ReducerContext) {
    if ctx.db.world_loot_refresh().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(WORLD_LOOT_REFRESH_MICROS);
    let _ = ctx.db.world_loot_refresh().insert(WorldLootRefresh {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

#[spacetimedb::reducer]
pub fn refresh_world_loot_spawns(ctx: &ReducerContext, _arg: WorldLootRefresh) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    refresh_world_loot_spawns_inner(ctx);
}

fn splitmix64(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

fn roll_world_loot(seed: u64) -> Option<(&'static str, u32)> {
    let total_w: u32 = WORLD_LOOT_TIERS.iter().map(|t| t.3).sum();
    if total_w == 0 {
        return None;
    }
    let mut r = splitmix64(seed) % (total_w as u64);
    for tier in WORLD_LOOT_TIERS {
        let w = tier.3 as u64;
        if r < w {
            let span = tier.2.saturating_sub(tier.1).saturating_add(1);
            let qty = if span <= 1 {
                tier.1
            } else {
                tier.1 + (splitmix64(seed ^ 0xC0FFEE) % span as u64) as u32
            };
            return Some((tier.0, qty));
        }
        r -= w;
    }
    None
}

fn insert_world_loot_at_anchor(ctx: &ReducerContext, slot: u16, x: f32, y: f32, z: f32) {
    let seed = ctx.timestamp.to_micros_since_unix_epoch() as u64 ^ ((slot as u64) << 48);
    let Some((def_id, quantity)) = roll_world_loot(seed) else {
        return;
    };
    if !items_catalog::is_known_def(def_id) {
        log::warn!("world loot roll unknown def {def_id}, skip slot {slot}");
        return;
    }
    let yaw = (splitmix64(seed.rotate_left(5)) as f32 / u64::MAX as f32) * (std::f32::consts::TAU);
    let _ = ctx.db.dropped_item().insert(DroppedItem {
        id: 0,
        def_id: def_id.to_string(),
        quantity,
        x,
        y,
        z,
        yaw,
        created_at: ctx.timestamp,
        world_spawn_slot: Some(slot),
    });
}

fn delete_drops_for_world_slot(ctx: &ReducerContext, slot: u16) {
    let ids: Vec<u64> = ctx
        .db
        .dropped_item()
        .iter()
        .filter(|d| d.world_spawn_slot == Some(slot))
        .map(|d| d.id)
        .collect();
    for id in ids {
        ctx.db.dropped_item().id().delete(id);
    }
}

fn refresh_world_loot_spawns_inner(ctx: &ReducerContext) {
    let n = WORLD_LOOT_ANCHORS.len().min(u16::MAX as usize) as u16;
    for slot in 0u16..n {
        delete_drops_for_world_slot(ctx, slot);
        let (x, y, z) = WORLD_LOOT_ANCHORS[slot as usize];
        insert_world_loot_at_anchor(ctx, slot, x, y, z);
    }
}

/// First init: fill anchors (subsequent runs use the refresh schedule).
pub fn seed_world_loot_spawns(ctx: &ReducerContext) {
    refresh_world_loot_spawns_inner(ctx);
}

#[inline]
fn forward_from_yaw(yaw: f32) -> (f32, f32) {
    // Same basis as `movement.rs` `integrate_one`.
    let forward_x = -yaw.sin();
    let forward_z = -yaw.cos();
    (forward_x, forward_z)
}

fn drop_spawn_transform(pose: &PlayerPose) -> (f32, f32, f32, f32) {
    let (fx, fz) = forward_from_yaw(pose.yaw);
    let x = pose.x + fx * DROP_FORWARD_M;
    let z = pose.z + fz * DROP_FORWARD_M;
    let y = pose.y + DROP_Y_LIFT_M;
    (x, y, z, pose.yaw)
}

fn dist_sq(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32) -> f32 {
    let dx = ax - bx;
    let dy = ay - by;
    let dz = az - bz;
    dx * dx + dy * dy + dz * dz
}

/// Remove from inventory/hotbar and spawn a [`DroppedItem`] in front of the player.
#[spacetimedb::reducer]
pub fn drop_item(ctx: &ReducerContext, item_instance_id: u64, quantity_to_drop: u32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("drop_item blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    let Some(pose) = ctx.db.player_pose().identity().find(&sender) else {
        log::warn!("drop_item: no pose for {sender}");
        return;
    };
    if let Err(e) = drop_item_inner(ctx, sender, pose, item_instance_id, quantity_to_drop) {
        log::warn!("drop_item: {e}");
    }
}

fn drop_item_inner(
    ctx: &ReducerContext,
    sender: Identity,
    pose: PlayerPose,
    item_instance_id: u64,
    quantity_to_drop: u32,
) -> Result<(), String> {
    let row = get_player_item(ctx, item_instance_id)?;
    if row.quantity < quantity_to_drop {
        return Err(format!(
            "only {} in stack",
            row.quantity
        ));
    }
    let (def_id, removed_qty) =
        remove_player_item_quantity(ctx, item_instance_id, quantity_to_drop)?;
    let (x, y, z, yaw) = drop_spawn_transform(&pose);
    log::info!(
        "drop_item: {:?} dropping {}×{} at ({:.2},{:.2},{:.2})",
        sender, removed_qty, def_id, x, y, z
    );
    let _ = ctx.db.dropped_item().insert(DroppedItem {
        id: 0,
        def_id,
        quantity: removed_qty,
        x,
        y,
        z,
        yaw,
        created_at: ctx.timestamp,
        world_spawn_slot: None,
    });
    Ok(())
}

/// Pick up the nearest dropped stack (client sends id after local query).
#[spacetimedb::reducer]
pub fn pickup_dropped_item(ctx: &ReducerContext, dropped_item_id: u64) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("pickup_dropped_item blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    if let Err(e) = pickup_dropped_item_inner(ctx, sender, dropped_item_id) {
        log::warn!("pickup_dropped_item: {e}");
    }
}

fn pickup_dropped_item_inner(
    ctx: &ReducerContext,
    sender: Identity,
    dropped_item_id: u64,
) -> Result<(), String> {
    let pose = ctx
        .db
        .player_pose()
        .identity()
        .find(&sender)
        .ok_or_else(|| "no player pose".to_string())?;
    let dropped = ctx
        .db
        .dropped_item()
        .id()
        .find(dropped_item_id)
        .ok_or_else(|| format!("dropped item {dropped_item_id} not found"))?;

    let d2 = dist_sq(pose.x, pose.y, pose.z, dropped.x, dropped.y, dropped.z);
    if d2 > PICKUP_RADIUS_SQ {
        return Err("too far away".to_string());
    }

    let def_id = dropped.def_id.clone();
    let qty = dropped.quantity;
    let px = dropped.x;
    let py = dropped.y;
    let pz = dropped.z;
    try_grant_stack_to_player(ctx, sender, def_id.clone(), qty)?;
    world_sound::emit_item_pickup_at(ctx, px, py, pz, sender);
    ctx.db.dropped_item().id().delete(dropped_item_id);
    log::info!("pickup_dropped_item: {:?} picked up {}×{} (id {})",
        sender,
        qty,
        def_id,
        dropped_item_id
    );
    Ok(())
}

/// Death: spill carried inventory/hotbar (not apartment stash rows).
pub(crate) fn scatter_carrier_inventory_at_death(ctx: &ReducerContext, victim: Identity) {
    use crate::inventory_models::ItemLocation;

    let Some(pose) = ctx.db.player_pose().identity().find(&victim) else {
        return;
    };
    let mut idx = 0u32;
    let rows: Vec<(u64, String, u32)> = ctx
        .db
        .inventory_item()
        .iter()
        .filter_map(|r| {
            let carrier = match &r.location {
                ItemLocation::Inventory(d) if d.owner_id == victim => true,
                ItemLocation::Hotbar(d) if d.owner_id == victim => true,
                _ => false,
            };
            if carrier {
                Some((r.instance_id, r.def_id.clone(), r.quantity))
            } else {
                None
            }
        })
        .collect();
    let inv_tbl = ctx.db.inventory_item();

    for (instance_id, def_id, qty) in rows {
        let jitter = ((idx % 9) as f32) * 0.11 - 0.44;
        idx += 1;
        let (fx, fz) = forward_from_yaw(pose.yaw);
        let x = pose.x + fx * (0.45 + jitter * 0.15) + (idx as f32 * 0.02);
        let z = pose.z + fz * (0.45 + jitter * 0.15);
        let y = pose.y + DROP_Y_LIFT_M;
        inv_tbl.instance_id().delete(instance_id);
        let _ = ctx.db.dropped_item().insert(DroppedItem {
            id: 0,
            def_id,
            quantity: qty,
            x,
            y,
            z,
            yaw: pose.yaw,
            created_at: ctx.timestamp,
            world_spawn_slot: None,
        });
    }
}

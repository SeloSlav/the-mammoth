//! World pickups: drag-out from inventory/hotbar → `drop_item`, `E` / reducer → `pickup_dropped_item`.
//! Positions are server-authoritative (player pose + forward offset), matching `movement.rs` yaw basis.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};

use crate::auth;
use crate::inventory::{get_player_item, remove_player_item_quantity, try_grant_stack_to_player};
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
        .filter(|d| d.created_at < cutoff)
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
    log::info!(
        "pickup_dropped_item: {:?} picked up {}×{} (id {})",
        sender,
        qty,
        def_id,
        dropped_item_id
    );
    Ok(())
}

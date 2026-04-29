//! Static world pickups (elevator shafts stay empty except player drops elsewhere).

use spacetimedb::{ReducerContext, Table};

use crate::auth;
use crate::inventory::try_grant_stack_to_player;
use crate::pose::player_pose;
use crate::world_sound;

const PICKUP_RADIUS_SQ: f32 = 2.95 * 2.95;

#[spacetimedb::table(public, accessor = world_loot_pickup)]
pub struct WorldLootPickup {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub def_id: String,
    pub quantity: u32,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// Seed authored loot near corridor / units — deterministic on each `init`.
pub fn seed_world_loot(ctx: &ReducerContext) {
    let samples: &[(f32, f32, f32, &str, u32)] = &[
        (0.85, 3.52, -15.42, "cigarettes", 6),
        (1.1, 3.52, -40.15, "nails", 14),
        (1.95, 3.52, -88.42, "ammo_9mm", 14),
        (-0.72, 3.52, 22.1, "scrap_metal", 2),
        (0.62, 1.82, -0.4, "rusty_pistol", 1),
    ];
    if ctx.db.world_loot_pickup().iter().next().is_some() {
        return;
    }
    for (x, y, z, def, qty) in samples {
        let _ = ctx.db.world_loot_pickup().insert(WorldLootPickup {
            id: 0,
            def_id: (*def).to_string(),
            quantity: *qty,
            x: *x,
            y: *y,
            z: *z,
        });
    }
}

#[spacetimedb::reducer]
pub fn pickup_world_loot(ctx: &ReducerContext, loot_id: u64) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("pickup_world_loot blocked: {e}");
        return;
    }
    let sender = ctx.sender();
    let Some(loot) = ctx.db.world_loot_pickup().id().find(&loot_id) else {
        return;
    };
    let Some(pose) = ctx.db.player_pose().identity().find(&sender) else {
        return;
    };
    let dx = pose.x - loot.x;
    let dy = pose.y - loot.y;
    let dz = pose.z - loot.z;
    if dx * dx + dy * dy + dz * dz > PICKUP_RADIUS_SQ {
        return;
    }
    let def_id = loot.def_id.clone();
    let quantity = loot.quantity;
    ctx.db.world_loot_pickup().id().delete(loot_id);
    let px = loot.x;
    let py = loot.y;
    let pz = loot.z;
    if try_grant_stack_to_player(ctx, sender, def_id.clone(), quantity).is_ok() {
        world_sound::emit_item_pickup_at(ctx, px, py, pz, sender);
        log::info!("pickup_world_loot: {sender:?} loot {loot_id} {def_id} x{quantity}");
    } else {
        let _ = ctx.db.world_loot_pickup().insert(WorldLootPickup {
            id: 0,
            def_id,
            quantity,
            x: px,
            y: py,
            z: pz,
        });
    }
}

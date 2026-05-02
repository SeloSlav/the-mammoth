//! World pickups: drag-out from inventory/hotbar → `drop_item`, `E` / reducer → `pickup_dropped_item`.
//! Static world loot uses the **same** `dropped_item` rows with [`DroppedItem.world_spawn_slot`], filled on
//! `init`, refreshed on a timer with weighted RNG. A **sparse** set of corridor anchors rolls **ammo + rations only**;
//! up to [`MAX_UNCLAIMED_APARTMENT_LOOT_SPOTS`] **unclaimed** apartment units get weapon-biased loot (sorted by floor)
//! plus a guaranteed scrap-metal resource pile in a varied interior spot.
//! Player drops stay `world_spawn_slot = None`; cleanup only
//! ages those rows so server-spawn piles do not silently despawn mid-session.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};

use crate::apartments::{apartment_unit, ApartmentUnit, UNIT_STATE_UNCLAIMED};
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

/// Top of ground-floor elevator-lobby walk slabs (see `generated_walk_surfaces/part_0000.rs`, ≈0.08..0.20 m Y).
/// Matches client placement: bottom of the pickup mesh sits on this plane.
/// **Keep equal to** `MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M` in `packages/assets/src/droppedWorldVisual.ts`.
const WORLD_LOOT_Y_GROUND_FLOOR_M: f32 = 0.20;

/// Sparse hallway anchors — light pickups only (ammo / rations). Weapons stay in unclaimed apartments.
/// Keep ground-floor lobby spots aligned with public spawn; a few upper spine samples along Z.
/// Index IS the corridor `world_spawn_slot`; apartment slots are allocated after this sparse list.
const WORLD_LOOT_ANCHORS: &[(f32, f32, f32)] = &[
    (0.62, WORLD_LOOT_Y_GROUND_FLOOR_M, -0.4),
    (0.55, WORLD_LOOT_Y_GROUND_FLOOR_M, 1.8),
    (0.9, WORLD_LOOT_Y_GROUND_FLOOR_M, -3.2),
    (1.1, 3.52, -40.15),
    (1.05, 3.52, -4.5),
    (1.55, 3.52, 7.5),
    (1.25, 3.52, 52.0),
];

/// Hall / corridor — ammo and consumables only (no weapons, cigarettes, etc.).
/// `(def_id, qty_min_inclusive, qty_max_inclusive, weight)`.
const WORLD_LOOT_TIERS: &[(&str, u32, u32, u32)] = &[
    ("ammo-9mm", 12, 40, 10),
    ("ammo-shotgun-shell", 4, 14, 8),
    ("apple", 2, 6, 6),
    ("water-bottle", 1, 3, 6),
];

/// Unclaimed residential units — biased toward weapons so new players find fighting gear inside lootable apartments.
const UNCLAIMED_APARTMENT_LOOT_TIERS: &[(&str, u32, u32, u32)] = &[
    ("pistol", 1, 1, 11),
    ("shotgun-coach", 1, 1, 9),
    ("crowbar", 1, 1, 13),
    ("baseball-bat", 1, 1, 13),
    ("ammo-9mm", 10, 32, 14),
    ("ammo-shotgun-shell", 4, 14, 11),
    ("apple", 1, 4, 6),
    ("water-bottle", 1, 2, 6),
    ("cigarettes", 2, 8, 4),
];

/// Max weapon-biased piles in unclaimed apartments per refresh (lower floors are filled first).
const MAX_UNCLAIMED_APARTMENT_LOOT_SPOTS: usize = 56;
/// Stable slot base for guaranteed apartment scrap piles.
const UNCLAIMED_APARTMENT_SCRAP_SLOT_BASE: usize =
    WORLD_LOOT_ANCHORS.len() + MAX_UNCLAIMED_APARTMENT_LOOT_SPOTS;
const APARTMENT_SCRAP_METAL_DEF_ID: &str = "scrap-metal";
const APARTMENT_SCRAP_QTY_MIN: u32 = 1;
const APARTMENT_SCRAP_QTY_MAX: u32 = 3;
const APARTMENT_SCRAP_WALL_MARGIN_M: f32 = 0.72;

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

fn roll_world_loot_from_tiers(
    seed: u64,
    tiers: &[(&'static str, u32, u32, u32)],
) -> Option<(&'static str, u32)> {
    let total_w: u32 = tiers.iter().map(|t| t.3).sum();
    if total_w == 0 {
        return None;
    }
    let mut r = splitmix64(seed) % (total_w as u64);
    for tier in tiers {
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

fn roll_u32_inclusive(seed: u64, min: u32, max: u32) -> u32 {
    if max <= min {
        return min;
    }
    min + (splitmix64(seed) % (max - min + 1) as u64) as u32
}

fn insert_world_loot_row(
    ctx: &ReducerContext,
    slot: u16,
    def_id: &str,
    quantity: u32,
    x: f32,
    y: f32,
    z: f32,
    seed: u64,
) {
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

fn insert_world_loot_at_anchor(
    ctx: &ReducerContext,
    slot: u16,
    x: f32,
    y: f32,
    z: f32,
    tiers: &[(&'static str, u32, u32, u32)],
) {
    let seed = ctx.timestamp.to_micros_since_unix_epoch() as u64 ^ ((slot as u64) << 48);
    let Some((def_id, quantity)) = roll_world_loot_from_tiers(seed, tiers) else {
        return;
    };
    insert_world_loot_row(ctx, slot, def_id, quantity, x, y, z, seed);
}

#[inline]
fn clamp_world_coord(v: f32, lo: f32, hi: f32) -> f32 {
    v.max(lo).min(hi)
}

fn clamp_inside_unit_xz(unit: &ApartmentUnit, x: f32, z: f32) -> (f32, f32) {
    (
        clamp_world_coord(
            x,
            unit.bound_min_x + APARTMENT_SCRAP_WALL_MARGIN_M,
            unit.bound_max_x - APARTMENT_SCRAP_WALL_MARGIN_M,
        ),
        clamp_world_coord(
            z,
            unit.bound_min_z + APARTMENT_SCRAP_WALL_MARGIN_M,
            unit.bound_max_z - APARTMENT_SCRAP_WALL_MARGIN_M,
        ),
    )
}

fn apartment_scrap_metal_anchor(unit: &ApartmentUnit, seed: u64) -> (f32, f32) {
    let center_z = (unit.bound_min_z + unit.bound_max_z) * 0.5;
    let toward_back_x = if unit.bed_x >= unit.wardrobe_x {
        1.0
    } else {
        -1.0
    };
    let toward_door_x = -toward_back_x;
    let away_from_wardrobe_wall_z = if unit.wardrobe_z >= center_z {
        -1.0
    } else {
        1.0
    };
    let side_z = if splitmix64(seed ^ 0x51DE_BEEF) & 1 == 0 {
        1.0
    } else {
        -1.0
    };

    match splitmix64(seed ^ 0xA17C_5C2A) % 4 {
        // Offcuts by the entry wardrobe / service nook.
        0 => clamp_inside_unit_xz(
            unit,
            unit.wardrobe_x + toward_back_x * 0.65,
            unit.wardrobe_z + away_from_wardrobe_wall_z * 0.52,
        ),
        // Loose hardware beside the footlocker.
        1 => clamp_inside_unit_xz(
            unit,
            unit.foot_x + toward_door_x * 0.52,
            unit.foot_z + side_z * 0.78,
        ),
        // Bent panel under the bed-side wall line.
        2 => clamp_inside_unit_xz(
            unit,
            unit.bed_x + toward_door_x * 0.9,
            unit.bed_z - side_z * 0.9,
        ),
        // Small pile in the open strip between entry and furniture.
        _ => clamp_inside_unit_xz(
            unit,
            (unit.wardrobe_x + unit.foot_x) * 0.5,
            center_z + side_z * 1.18,
        ),
    }
}

fn insert_apartment_scrap_metal(ctx: &ReducerContext, slot: u16, unit: &ApartmentUnit) {
    let seed = ctx.timestamp.to_micros_since_unix_epoch() as u64
        ^ ((slot as u64) << 48)
        ^ splitmix64(
            unit.unit_key
                .as_bytes()
                .iter()
                .fold(0u64, |acc, b| acc.wrapping_mul(131).wrapping_add(*b as u64)),
        );
    let (x, z) = apartment_scrap_metal_anchor(unit, seed);
    let quantity = roll_u32_inclusive(
        seed ^ 0x5C2A_9E77,
        APARTMENT_SCRAP_QTY_MIN,
        APARTMENT_SCRAP_QTY_MAX,
    );
    insert_world_loot_row(
        ctx,
        slot,
        APARTMENT_SCRAP_METAL_DEF_ID,
        quantity,
        x,
        unit.foot_y + 0.02,
        z,
        seed,
    );
}

fn delete_all_anchored_world_loot(ctx: &ReducerContext) {
    let ids: Vec<u64> = ctx
        .db
        .dropped_item()
        .iter()
        .filter(|d| d.world_spawn_slot.is_some())
        .map(|d| d.id)
        .collect();
    for id in ids {
        ctx.db.dropped_item().id().delete(id);
    }
}

fn refresh_world_loot_spawns_inner(ctx: &ReducerContext) {
    delete_all_anchored_world_loot(ctx);

    for (i, &(x, y, z)) in WORLD_LOOT_ANCHORS.iter().enumerate() {
        let Ok(slot) = u16::try_from(i) else {
            log::warn!("world loot: anchor index {i} does not fit u16, skipping");
            continue;
        };
        insert_world_loot_at_anchor(ctx, slot, x, y, z, WORLD_LOOT_TIERS);
    }

    let apartment_base = WORLD_LOOT_ANCHORS.len();
    let mut unclaimed: Vec<_> = ctx
        .db
        .apartment_unit()
        .iter()
        .filter(|u| u.state == UNIT_STATE_UNCLAIMED)
        .collect();
    unclaimed.sort_by(|a, b| {
        a.level
            .cmp(&b.level)
            .then_with(|| a.unit_key.cmp(&b.unit_key))
    });

    for (i, u) in unclaimed
        .into_iter()
        .take(MAX_UNCLAIMED_APARTMENT_LOOT_SPOTS)
        .enumerate()
    {
        let idx = apartment_base.saturating_add(i);
        let Ok(slot) = u16::try_from(idx) else {
            log::warn!(
                "world loot: unclaimed apartment slot index {idx} exceeds u16::MAX; stopping apartment loot"
            );
            break;
        };
        let cx = (u.bound_min_x + u.bound_max_x) * 0.5;
        let cz = (u.bound_min_z + u.bound_max_z) * 0.5;
        let cy = u.foot_y + 0.02;
        insert_world_loot_at_anchor(ctx, slot, cx, cy, cz, UNCLAIMED_APARTMENT_LOOT_TIERS);

        let scrap_idx = UNCLAIMED_APARTMENT_SCRAP_SLOT_BASE.saturating_add(i);
        let Ok(scrap_slot) = u16::try_from(scrap_idx) else {
            log::warn!(
                "world loot: unclaimed apartment scrap slot index {scrap_idx} exceeds u16::MAX; stopping apartment scrap"
            );
            break;
        };
        insert_apartment_scrap_metal(ctx, scrap_slot, &u);
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
        return Err(format!("only {} in stack", row.quantity));
    }
    let (def_id, removed_qty) =
        remove_player_item_quantity(ctx, item_instance_id, quantity_to_drop)?;
    let (x, y, z, yaw) = drop_spawn_transform(&pose);
    log::info!(
        "drop_item: {:?} dropping {}×{} at ({:.2},{:.2},{:.2})",
        sender,
        removed_qty,
        def_id,
        x,
        y,
        z
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
    log::info!(
        "pickup_dropped_item: {:?} picked up {}×{} (id {})",
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn sample_unit(unit_key: &str, west_facing: bool) -> ApartmentUnit {
        let (bound_min_x, bound_max_x, bed_x, foot_x, wardrobe_x) = if west_facing {
            (2.005, 14.925, 9.775, 8.175, 3.385)
        } else {
            (-14.925, -2.005, -9.775, -8.175, -3.385)
        };

        ApartmentUnit {
            unit_key: unit_key.to_string(),
            floor_doc_id: "test_floor".to_string(),
            level: 2,
            unit_id: unit_key.to_string(),
            state: UNIT_STATE_UNCLAIMED,
            owner: None,
            claim_progress_secs: 0.0,
            claim_started_by: None,
            last_claim_pulse_micros: 0,
            reinforce_progress_secs: 0.0,
            reinforce_by: None,
            reinforced: 0,
            bed_x,
            bed_y: 3.16,
            bed_z: -113.1625,
            bed_yaw: if west_facing {
                std::f32::consts::FRAC_PI_2
            } else {
                -std::f32::consts::FRAC_PI_2
            },
            foot_x,
            foot_y: 3.16,
            foot_z: -113.1625,
            wardrobe_x,
            wardrobe_z: -109.7425,
            bound_min_x,
            bound_max_x,
            bound_min_z: -117.5825,
            bound_max_z: -106.5825,
            bound_min_y: 3.16,
            bound_max_y: 6.16,
        }
    }

    fn assert_scrap_anchor_inside(unit: &ApartmentUnit, seed: u64) {
        let (x, z) = apartment_scrap_metal_anchor(unit, seed);
        assert!(
            x >= unit.bound_min_x + APARTMENT_SCRAP_WALL_MARGIN_M
                && x <= unit.bound_max_x - APARTMENT_SCRAP_WALL_MARGIN_M,
            "x={x} outside unit {}",
            unit.unit_key
        );
        assert!(
            z >= unit.bound_min_z + APARTMENT_SCRAP_WALL_MARGIN_M
                && z <= unit.bound_max_z - APARTMENT_SCRAP_WALL_MARGIN_M,
            "z={z} outside unit {}",
            unit.unit_key
        );
    }

    #[test]
    fn apartment_scrap_metal_anchors_stay_inside_mirrored_units() {
        for unit in [
            sample_unit("unit_w_test", true),
            sample_unit("unit_e_test", false),
        ] {
            for seed in 0..128 {
                assert_scrap_anchor_inside(&unit, seed);
            }
        }
    }

    #[test]
    fn apartment_scrap_metal_anchors_vary_across_seeds() {
        let unit = sample_unit("unit_w_test", true);
        let mut seen = HashSet::new();
        for seed in 0..128 {
            let (x, z) = apartment_scrap_metal_anchor(&unit, seed);
            seen.insert(format!("{x:.2}:{z:.2}"));
        }
        assert!(
            seen.len() >= 4,
            "expected several authored scrap positions, got {seen:?}"
        );
    }

    #[test]
    fn apartment_scrap_quantity_roll_stays_in_catalog_stack_range() {
        for seed in 0..128 {
            let qty = roll_u32_inclusive(seed, APARTMENT_SCRAP_QTY_MIN, APARTMENT_SCRAP_QTY_MAX);
            assert!((APARTMENT_SCRAP_QTY_MIN..=APARTMENT_SCRAP_QTY_MAX).contains(&qty));
        }
    }
}

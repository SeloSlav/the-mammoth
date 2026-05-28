//! World pickups: drag-out from inventory/hotbar → `drop_item`, `E` / reducer → `pickup_dropped_item`.
//! Static world loot uses the **same** `dropped_item` rows with [`DroppedItem.world_spawn_slot`], filled on
//! `init`, refreshed on a timer with weighted RNG. Corridor anchors roll **ammo, rations, and chemical-stock**
//! (custodial/service-cache proxy until janitor closets are anchored). Corridor spine loot is gated by
//! [`crate::feature_flags::ENABLE_CORRIDOR_HALLWAY_WORLD_LOOT`] (off by default). Unclaimed apartment loot is
//! gated by [`crate::feature_flags::ENABLE_UNCLAIMED_APARTMENT_WORLD_LOOT`] (off by default). When enabled, a **subset**
//! of units get weapon-biased loot (sorted by floor); many stay empty each refresh. Scrap metal is common but
//! not guaranteed on every looted unit — fewer rows, clearer scavenging, less subscription/render load.
//! Anchored apartment XZ omits bbox centroids and the bed footprint projection so pickups land in clear living/entry lanes.
//! Player drops stay `world_spawn_slot = None`; cleanup ages those rows on a per-item schedule
//! (see [`crate::items_catalog::world_drop_despawn_secs`]) so server-spawn piles do not silently
//! despawn mid-session.

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration, Timestamp};

use crate::apartment_interior_anchors::{BED_HALF_X_M, BED_HALF_Z_M};
use crate::apartments::{
    apartment_unit, feet_inside_unit, is_vacant_home_pool_unit_row, ApartmentUnit,
    UNIT_STATE_UNCLAIMED,
};
use crate::auth;
use crate::crafting;
use crate::feature_flags;
use crate::elevator_layout::{BUILDING_ORIGIN_Y, STOREY_SPACING_M};
use crate::inventory::{
    get_player_item, inventory_item, remove_player_item_quantity, try_grant_stack_to_player,
};
use crate::items_catalog;
use crate::pose::{player_pose, PlayerPose};
use crate::world_sound;

/// Squared max **horizontal** distance (m²) from player feet to drop — matches client
/// `MAMMOTH_PICKUP_RADIUS_M`. Vertical stacking uses the same storey band as FP visibility
/// (`elevator_layout` storey spacing + −0.25 m pad) so anchors near slab bottoms cannot vacuum the deck above/below when XZ aligns.
const PICKUP_RADIUS_SQ: f32 = 3.5 * 3.5;
/// Feet sit above slab tops while anchored loot uses `WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M` — comparing raw |Δy|
/// to a storey fraction under-rejects slabs. Matching discrete bands fixes that; keep a parachute sanity cap.
/// Keep in sync with client `mammothVerticalStoryBandIndex` / `mammothSameStoreyPickupWindowM`.
const PICKUP_VERTICAL_STORY_PAD_Y: f32 = 0.25;
/// Max |ΔY| guard after same-storey band passes (handles rare outliers / regressions).
const PICKUP_MAX_ABS_DY_SAME_BAND_M: f32 = STOREY_SPACING_M * 1.08;
/// Forward offset along look direction when spawning a drop (m).
const DROP_FORWARD_M: f32 = 0.55;
/// Lift mesh slightly above replicated foot height to avoid sinking through thin slabs / Z-fight (m).
const DROP_Y_LIFT_M: f32 = 0.11;
/// How often the cleanup reducer scans player-origin drops (µs).
const DROP_CLEANUP_INTERVAL_MICROS: i64 = 120_000_000;
/// How often to reroll anchored world loot (random defs/qty/yaw).
const WORLD_LOOT_REFRESH_MICROS: i64 = 180 * 1_000_000;

/// Vertical clearance above each storey’s **plate** Y so pickup mesh bottoms sit clearly above walk slab tops
/// (avoids Z-fight / mesh sinking on ~0.08–0.20 m slabs). Level-1 reference matches client constant
/// `MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M` in `packages/assets/src/droppedWorldVisual.ts`.
const WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M: f32 = 0.28;

#[inline]
fn mammoth_pickup_vertical_band(world_y: f32) -> i32 {
    (((world_y - BUILDING_ORIGIN_Y - PICKUP_VERTICAL_STORY_PAD_Y) / STOREY_SPACING_M).floor())
        as i32
}

#[inline]
const fn building_plate_world_y(level: u32) -> f32 {
    let lv = if level < 1 { 1 } else { level };
    BUILDING_ORIGIN_Y + (lv as f32 - 1.0) * STOREY_SPACING_M
}

/// Corridor anchors on level 1 (ground spine).
const WORLD_LOOT_Y_GROUND_FLOOR_M: f32 =
    building_plate_world_y(1) + WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M;

/// Upper spine anchors authored for typical residential plate **level 2**.
const WORLD_LOOT_Y_UPPER_SPINE_M: f32 =
    building_plate_world_y(2) + WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M;

/// `apartments::derive_bounds` sets `bound_min_y = feet_world_y - 0.06`. Undo that pad, then apply the same
/// clearance as corridor loot (`WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M`).
const APARTMENT_BOUND_MIN_Y_BELOW_PLATE_M: f32 = 0.06;

#[inline]
fn apartment_world_loot_floor_y(unit: &ApartmentUnit) -> f32 {
    unit.bound_min_y + APARTMENT_BOUND_MIN_Y_BELOW_PLATE_M + WORLD_LOOT_Y_OFFSET_ABOVE_PLATE_M
}

/// Sparse hallway anchors — ammo, consumables, **chemical-stock** (service-route pickups). Weapons stay inside units.
/// Ground-floor points sit on **wide walk slabs** along the spine (see `generated_walk_surfaces/part_0000.rs`),
/// away from the west elevator landing (`elevator_layout` ≈ X −3.17, Z 0) so pickups are contested in open
/// traffic instead of blocking cab exits. Upper samples follow the same spine.
/// Index IS the corridor `world_spawn_slot`; apartment slots are allocated after this sparse list.
const WORLD_LOOT_ANCHORS: &[(f32, f32, f32)] = &[
    (-1.2, WORLD_LOOT_Y_GROUND_FLOOR_M, -22.0),
    (1.2, WORLD_LOOT_Y_GROUND_FLOOR_M, 22.0),
    (-1.0, WORLD_LOOT_Y_GROUND_FLOOR_M, 68.0),
    (1.1, WORLD_LOOT_Y_UPPER_SPINE_M, -40.15),
    (1.05, WORLD_LOOT_Y_UPPER_SPINE_M, -4.5),
    (1.55, WORLD_LOOT_Y_UPPER_SPINE_M, 7.5),
    (1.25, WORLD_LOOT_Y_UPPER_SPINE_M, 52.0),
];

/// Hall / corridor — ammo, consumables, **chemical-stock** (service-route spawns; closet props later).
/// `(def_id, qty_min_inclusive, qty_max_inclusive, weight)`.
const WORLD_LOOT_TIERS: &[(&str, u32, u32, u32)] = &[
    ("ammo-9mm", 12, 40, 10),
    ("ammo-shotgun-shell", 4, 14, 8),
    ("chemical-stock", 2, 6, 8),
    ("apple", 2, 6, 6),
    ("water-bottle", 1, 3, 6),
    ("fish-filter-sponge", 1, 2, 4),
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

/// Hard cap on main (weapon-tier) apartment loot rows per refresh — keeps DB + client AOI load bounded.
const MAX_APARTMENT_MAIN_LOOT_ROWS: usize = 26;
/// Per unclaimed unit (stable for a given refresh salt): pass rate before the cap trims the tail.
/// (~62% ⇒ most floors show loot without spamming every unit — cap still bounds DB/replication.)
const APARTMENT_LOOT_UNIT_PASS_PERCENT: u64 = 62;
/// After a unit rolls main loot, chance it also gets a scrap pile (rest are firearms/melee/ammo only).
const APARTMENT_SCRAP_SPAWN_PERCENT: u64 = 60;
/// First slot index reserved for apartment scrap rows (after the max possible main-apartment block).
#[inline]
fn unclaimed_apartment_scrap_slot_base() -> usize {
    apartment_world_loot_slot_base() + MAX_APARTMENT_MAIN_LOOT_ROWS
}

/// Slot index where unclaimed-apartment main loot starts (after corridor anchors when enabled).
#[inline]
fn apartment_world_loot_slot_base() -> usize {
    if feature_flags::ENABLE_CORRIDOR_HALLWAY_WORLD_LOOT {
        WORLD_LOOT_ANCHORS.len()
    } else {
        0
    }
}
const APARTMENT_SCRAP_METAL_DEF_ID: &str = "scrap-metal";
const APARTMENT_SCRAP_QTY_MIN: u32 = 1;
const APARTMENT_SCRAP_QTY_MAX: u32 = 3;
const APARTMENT_SCRAP_WALL_MARGIN_M: f32 = 0.72;
/// Horizontal clearance around authored bed extents so loot feet don't sit inside the mattress OBB projection.
const APARTMENT_BED_KEEPOUT_PAD_M: f32 = 0.38;

#[inline]
fn bed_world_aabb_half_extents_m(bed_yaw: f32) -> (f32, f32) {
    let c = bed_yaw.cos().abs();
    let s = bed_yaw.sin().abs();
    (
        BED_HALF_X_M * c + BED_HALF_Z_M * s,
        BED_HALF_X_M * s + BED_HALF_Z_M * c,
    )
}

#[inline]
fn xz_in_horizontal_bed_keepout(px: f32, pz: f32, unit: &ApartmentUnit, pad_m: f32) -> bool {
    let (hx, hz) = bed_world_aabb_half_extents_m(unit.bed_yaw);
    let dx = (px - unit.bed_x).abs();
    let dz = (pz - unit.bed_z).abs();
    dx <= hx + pad_m && dz <= hz + pad_m
}

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
    let ids: Vec<u64> = ctx
        .db
        .dropped_item()
        .iter()
        .filter(|d| player_origin_drop_expired(ctx, d))
        .map(|d| d.id)
        .collect();
    for id in ids {
        ctx.db.dropped_item().id().delete(id);
    }
}

/// Player drops and death scatter (`world_spawn_slot = None`) age out per catalog item lifetime.
fn player_origin_drop_expired(ctx: &ReducerContext, drop: &DroppedItem) -> bool {
    if drop.world_spawn_slot.is_some() {
        return false;
    }
    let despawn_secs = items_catalog::world_drop_despawn_secs(&drop.def_id);
    let cutoff = ctx.timestamp - TimeDuration::from_micros(despawn_secs * 1_000_000);
    drop.created_at < cutoff
}

pub fn start_dropped_item_cleanup_schedule(ctx: &ReducerContext) {
    if ctx.db.dropped_item_cleanup().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(DROP_CLEANUP_INTERVAL_MICROS);
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

#[inline]
fn apartment_unit_loot_seed(unit: &ApartmentUnit, refresh_salt: u64) -> u64 {
    let key_hash = unit
        .unit_key
        .as_bytes()
        .iter()
        .fold(0u64, |acc, b| acc.wrapping_mul(131).wrapping_add(*b as u64));
    splitmix64(refresh_salt ^ key_hash ^ ((unit.level as u64) << 40))
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

/// Mission-authored pickup — uses reserved slots outside world-loot refresh.
pub(crate) fn insert_mission_loot_row(
    ctx: &ReducerContext,
    slot: u16,
    def_id: &str,
    quantity: u32,
    x: f32,
    y: f32,
    z: f32,
) {
    let seed = ctx.timestamp.to_micros_since_unix_epoch() as u64 ^ ((slot as u64) << 48);
    insert_world_loot_row(ctx, slot, def_id, quantity, x, y, z, seed);
}

pub(crate) fn mission_loot_slot_exists(ctx: &ReducerContext, slot: u16) -> bool {
    ctx.db
        .dropped_item()
        .iter()
        .any(|d| d.world_spawn_slot == Some(slot))
}

pub(crate) fn delete_mission_loot_by_slot(ctx: &ReducerContext, slot: u16) {
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

/// Whether mission loot for `slot` already sits inside `unit_key` (not a legacy corridor anchor).
pub(crate) fn mission_loot_spawned_in_apartment_unit(
    ctx: &ReducerContext,
    slot: u16,
    unit_key: &str,
) -> bool {
    let Some(unit) = ctx.db.apartment_unit().unit_key().find(&unit_key.to_string()) else {
        return false;
    };
    ctx.db.dropped_item().iter().any(|d| {
        d.world_spawn_slot == Some(slot)
            && feet_inside_unit(&unit, d.x, d.y, d.z)
    })
}

/// Spawn a mission pickup on the unit floor — entry/living strip, clear of the bed footprint.
pub(crate) fn insert_mission_loot_in_apartment_unit(
    ctx: &ReducerContext,
    slot: u16,
    unit_key: &str,
    def_id: &str,
    quantity: u32,
    placement_seed: u64,
) -> bool {
    let Some(unit) = ctx.db.apartment_unit().unit_key().find(&unit_key.to_string()) else {
        log::warn!("mission loot: unknown apartment unit {unit_key:?}");
        return false;
    };
    let (x, z) = apartment_clear_pickup_anchor_xz(&unit, placement_seed);
    let y = apartment_world_loot_floor_y(&unit);
    insert_mission_loot_row(ctx, slot, def_id, quantity, x, y, z);
    true
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

/// Entry / living-strip anchor for anchored apartment pickups — avoids centroid (often overlaps the mattress)
/// and every candidate is checked against a yaw-aware bed AABB inflated by [`APARTMENT_BED_KEEPOUT_PAD_M`].
fn apartment_clear_pickup_anchor_xz(unit: &ApartmentUnit, seed: u64) -> (f32, f32) {
    let toward_back_x = if unit.bed_x >= unit.wardrobe_x {
        1.0
    } else {
        -1.0
    };
    let toward_door_x = -toward_back_x;
    let center_z = (unit.bound_min_z + unit.bound_max_z) * 0.5;
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

    #[inline]
    fn try_candidates(
        unit: &ApartmentUnit,
        cands: [(f32, f32); 6],
        pad_m: f32,
    ) -> Option<(f32, f32)> {
        for (cx, cz) in cands {
            let (x, z) = clamp_inside_unit_xz(unit, cx, cz);
            if !xz_in_horizontal_bed_keepout(x, z, unit, pad_m) {
                return Some((x, z));
            }
        }
        None
    }

    let cands_row1 = [
        (
            (unit.wardrobe_x + unit.foot_x) * 0.5 + toward_door_x * 0.85,
            center_z + side_z * 1.06,
        ),
        (
            (unit.wardrobe_x + unit.foot_x) * 0.5 + toward_door_x * 0.42,
            center_z - side_z * 1.12,
        ),
        (
            unit.wardrobe_x + toward_back_x * 0.58,
            unit.wardrobe_z + away_from_wardrobe_wall_z * 0.54,
        ),
        (
            unit.foot_x + toward_door_x * 0.68,
            unit.foot_z + side_z * 0.76,
        ),
        (
            (unit.bound_min_x + unit.bound_max_x) * 0.5 + toward_door_x * 2.25,
            center_z + side_z * 0.72,
        ),
        (
            (unit.bound_min_x + unit.bound_max_x) * 0.5 + toward_door_x * 1.55,
            center_z - side_z * 0.94,
        ),
    ];

    if let Some(xz) = try_candidates(unit, cands_row1, APARTMENT_BED_KEEPOUT_PAD_M) {
        return xz;
    }

    // Last resort shove toward the wardrobe / door hemisphere until we leave the inflated bed hull.
    let (mut x, mut z) = clamp_inside_unit_xz(
        unit,
        unit.wardrobe_x + toward_door_x * 1.05,
        unit.wardrobe_z + side_z * 0.92,
    );
    let step_x = toward_door_x * 0.28;
    let step_z = side_z * 0.26;
    for _ in 0..14 {
        if !xz_in_horizontal_bed_keepout(x, z, unit, APARTMENT_BED_KEEPOUT_PAD_M) {
            return (x, z);
        }
        x = clamp_world_coord(
            x + step_x,
            unit.bound_min_x + APARTMENT_SCRAP_WALL_MARGIN_M,
            unit.bound_max_x - APARTMENT_SCRAP_WALL_MARGIN_M,
        );
        z = clamp_world_coord(
            z + step_z,
            unit.bound_min_z + APARTMENT_SCRAP_WALL_MARGIN_M,
            unit.bound_max_z - APARTMENT_SCRAP_WALL_MARGIN_M,
        );
    }

    clamp_inside_unit_xz(
        unit,
        unit.bed_x
            + toward_door_x * (BED_HALF_X_M + BED_HALF_Z_M + APARTMENT_BED_KEEPOUT_PAD_M + 0.42),
        unit.bed_z,
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

    let (mut x, mut z) = match splitmix64(seed ^ 0xA17C_5C2A) % 4 {
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
        // Near the bed-head wall line — if that's still inside the mattress keep-out, fall back to the entry strip.
        2 => {
            let (ax, az) = clamp_inside_unit_xz(
                unit,
                unit.bed_x + toward_door_x * 0.9,
                unit.bed_z - side_z * 0.9,
            );
            if xz_in_horizontal_bed_keepout(ax, az, unit, APARTMENT_BED_KEEPOUT_PAD_M) {
                clamp_inside_unit_xz(
                    unit,
                    (unit.wardrobe_x + unit.foot_x) * 0.5 + toward_door_x * 0.55,
                    center_z + side_z * 1.08,
                )
            } else {
                (ax, az)
            }
        }
        // Small pile in the open strip between entry and furniture.
        _ => clamp_inside_unit_xz(
            unit,
            (unit.wardrobe_x + unit.foot_x) * 0.5,
            center_z + side_z * 1.18,
        ),
    };
    if xz_in_horizontal_bed_keepout(x, z, unit, APARTMENT_BED_KEEPOUT_PAD_M) {
        (x, z) = apartment_clear_pickup_anchor_xz(unit, seed ^ 0x9E37_79B97F4A7C15);
    }
    (x, z)
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
        apartment_world_loot_floor_y(unit),
        z,
        seed,
    );
}

fn delete_all_anchored_world_loot(ctx: &ReducerContext) {
    let ids: Vec<u64> = ctx
        .db
        .dropped_item()
        .iter()
        .filter(|d| {
            d.world_spawn_slot.is_some()
                && d.world_spawn_slot.unwrap() < crate::player_mission::MISSION_WORLD_SPAWN_SLOT_MIN
        })
        .map(|d| d.id)
        .collect();
    for id in ids {
        ctx.db.dropped_item().id().delete(id);
    }
}

fn refresh_world_loot_spawns_inner(ctx: &ReducerContext) {
    delete_all_anchored_world_loot(ctx);

    if feature_flags::ENABLE_CORRIDOR_HALLWAY_WORLD_LOOT {
        for (i, &(x, y, z)) in WORLD_LOOT_ANCHORS.iter().enumerate() {
            let Ok(slot) = u16::try_from(i) else {
                log::warn!("world loot: anchor index {i} does not fit u16, skipping");
                continue;
            };
            insert_world_loot_at_anchor(ctx, slot, x, y, z, WORLD_LOOT_TIERS);
        }
    }

    if feature_flags::ENABLE_UNCLAIMED_APARTMENT_WORLD_LOOT {
        let apartment_base = apartment_world_loot_slot_base();
        let refresh_salt = ctx.timestamp.to_micros_since_unix_epoch() as u64;
        let mut unclaimed: Vec<_> = ctx
            .db
            .apartment_unit()
            .iter()
            .filter(|u| u.state == UNIT_STATE_UNCLAIMED && !is_vacant_home_pool_unit_row(u))
            .collect();
        unclaimed.sort_by(|a, b| {
            a.level
                .cmp(&b.level)
                .then_with(|| a.unit_key.cmp(&b.unit_key))
        });

        let mut main_loot_rows = 0usize;
        let mut scrap_rows = 0usize;

        for u in unclaimed {
            if main_loot_rows >= MAX_APARTMENT_MAIN_LOOT_ROWS {
                break;
            }
            let unit_seed = apartment_unit_loot_seed(&u, refresh_salt);
            if splitmix64(unit_seed) % 100 >= APARTMENT_LOOT_UNIT_PASS_PERCENT {
                continue;
            }

            let idx = apartment_base + main_loot_rows;
            let Ok(slot) = u16::try_from(idx) else {
                log::warn!(
                    "world loot: unclaimed apartment slot index {idx} exceeds u16::MAX; stopping apartment loot"
                );
                break;
            };
            let loot_seed = refresh_salt ^ ((slot as u64) << 48) ^ splitmix64(unit_seed);
            let (lx, lz) = apartment_clear_pickup_anchor_xz(&u, loot_seed);
            let ly = apartment_world_loot_floor_y(&u);
            insert_world_loot_at_anchor(ctx, slot, lx, ly, lz, UNCLAIMED_APARTMENT_LOOT_TIERS);
            main_loot_rows += 1;

            if splitmix64(unit_seed ^ 0x5CA2_A9B8_01D0_11D5) % 100
                >= APARTMENT_SCRAP_SPAWN_PERCENT
            {
                continue;
            }
            let scrap_idx = unclaimed_apartment_scrap_slot_base() + scrap_rows;
            let Ok(scrap_slot) = u16::try_from(scrap_idx) else {
                log::warn!(
                    "world loot: unclaimed apartment scrap slot index {scrap_idx} exceeds u16::MAX; stopping apartment scrap"
                );
                break;
            };
            insert_apartment_scrap_metal(ctx, scrap_slot, &u);
            scrap_rows += 1;
        }
    }
}

/// First init: fill anchors (subsequent runs use the refresh schedule).
pub fn seed_world_loot_spawns(ctx: &ReducerContext) {
    refresh_world_loot_spawns_inner(ctx);
}

/// Backfill static world loot for long-lived local dev databases that predate the init seed or had
/// their anchored rows cleared. Player-dropped rows are left untouched.
pub fn ensure_world_loot_spawns(ctx: &ReducerContext) {
    if ctx
        .db
        .dropped_item()
        .iter()
        .any(|d| d.world_spawn_slot.is_some())
    {
        return;
    }
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

/// Spawn a player-origin drop slightly in front of the feet (intentional drop / inventory spill).
pub(crate) fn spawn_dropped_stack_at_player_feet(
    ctx: &ReducerContext,
    pose: &PlayerPose,
    def_id: String,
    quantity: u32,
    jitter_index: u32,
) -> Result<(), String> {
    if quantity == 0 {
        return Ok(());
    }
    let jitter = ((jitter_index % 9) as f32) * 0.11 - 0.44;
    let (fx, fz) = forward_from_yaw(pose.yaw);
    let x = pose.x + fx * (0.45 + jitter * 0.15) + (jitter_index as f32 * 0.02);
    let z = pose.z + fz * (0.45 + jitter * 0.15);
    let y = pose.y + DROP_Y_LIFT_M;
    let _ = ctx.db.dropped_item().insert(DroppedItem {
        id: 0,
        def_id,
        quantity,
        x,
        y,
        z,
        yaw: pose.yaw,
        created_at: ctx.timestamp,
        world_spawn_slot: None,
    });
    Ok(())
}

/// Grant into hotbar/inventory; spill any remainder as a world drop at the player's feet.
pub(crate) fn grant_stack_to_player_spilling_at_feet(
    ctx: &ReducerContext,
    owner: Identity,
    def_id: String,
    quantity: u32,
) -> Result<u32, String> {
    let remaining = try_grant_stack_to_player(ctx, owner, def_id.clone(), quantity)?;
    if remaining == 0 {
        return Ok(0);
    }
    let Some(pose) = ctx.db.player_pose().identity().find(&owner) else {
        return Err("no pose for inventory spill".to_string());
    };
    spawn_dropped_stack_at_player_feet(ctx, &pose, def_id, remaining, 0)?;
    Ok(remaining)
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
    let dropped = ctx
        .db
        .dropped_item()
        .id()
        .find(dropped_item_id)
        .ok_or_else(|| format!("dropped item {dropped_item_id} not found"))?;

    let def_id = dropped.def_id.clone();
    let qty = dropped.quantity;
    let px = dropped.x;
    let py = dropped.y;
    let pz = dropped.z;
    let remaining = try_grant_stack_to_player(ctx, sender, def_id.clone(), qty)?;
    let granted = qty.saturating_sub(remaining);
    if granted == 0 {
        crafting::emit_hud_notice(ctx, sender, "Inventory full".to_string());
        return Err("inventory full".to_string());
    }
    crafting::emit_hud_toast(
        ctx,
        sender,
        crafting::HUD_TOAST_KIND_ITEM_RECEIVED,
        def_id.clone(),
        granted,
    );
    world_sound::emit_item_pickup_at(ctx, px, py, pz, sender);
    if remaining == 0 {
        ctx.db.dropped_item().id().delete(dropped_item_id);
    } else {
        let mut partial = dropped;
        partial.quantity = remaining;
        ctx.db.dropped_item().id().update(partial);
        crafting::emit_hud_notice(
            ctx,
            sender,
            "Inventory full — left the rest on the ground".to_string(),
        );
    }
    log::info!(
        "pickup_dropped_item: {:?} picked up {}×{} (id {}, {} left on ground)",
        sender,
        granted,
        def_id,
        dropped_item_id,
        remaining
    );
    crate::player_mission::on_mission_item_pickup(ctx, sender, def_id.as_str());
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
        idx += 1;
        inv_tbl.instance_id().delete(instance_id);
        let _ = spawn_dropped_stack_at_player_feet(ctx, &pose, def_id, qty, idx);
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
            stove_x: if west_facing { 2.445 } else { -14.485 },
            stove_z: -117.1425,
            bound_min_x,
            bound_max_x,
            bound_min_z: -117.5825,
            bound_max_z: -106.5825,
            bound_min_y: 3.16,
            bound_max_y: 6.16,
        }
    }

    fn assert_inside_unit_pickup_margin(unit: &ApartmentUnit, label: &str, x: f32, z: f32) {
        let m = APARTMENT_SCRAP_WALL_MARGIN_M;
        assert!(
            x >= unit.bound_min_x + m && x <= unit.bound_max_x - m,
            "{label} x={x} outside unit {}",
            unit.unit_key
        );
        assert!(
            z >= unit.bound_min_z + m && z <= unit.bound_max_z - m,
            "{label} z={z} outside unit {}",
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
                let (x, z) = apartment_scrap_metal_anchor(&unit, seed);
                assert_inside_unit_pickup_margin(&unit, "scrap", x, z);
            }
        }
    }

    fn assert_misses_bed_keepout(label: &str, unit: &ApartmentUnit, x: f32, z: f32, seed: u64) {
        assert!(
            !xz_in_horizontal_bed_keepout(x, z, unit, APARTMENT_BED_KEEPOUT_PAD_M),
            "{label}: seed={seed} xz=({x},{z}) overlaps bed keepout for {}",
            unit.unit_key,
        );
    }

    #[test]
    fn apartment_weapon_loot_anchors_miss_bed_keepout() {
        for unit in [
            sample_unit("unit_w_test", true),
            sample_unit("unit_e_test", false),
        ] {
            for seed in 0u64..512 {
                let (x, z) = apartment_clear_pickup_anchor_xz(&unit, seed);
                assert_inside_unit_pickup_margin(&unit, "weapon", x, z);
                assert_misses_bed_keepout("weapon_anchor", &unit, x, z, seed);
            }
        }
    }

    #[test]
    fn apartment_scrap_anchors_miss_bed_keepout() {
        for unit in [
            sample_unit("unit_w_test", true),
            sample_unit("unit_e_test", false),
        ] {
            for seed in 0u64..256 {
                let (x, z) = apartment_scrap_metal_anchor(&unit, seed);
                assert_inside_unit_pickup_margin(&unit, "scrap", x, z);
                assert_misses_bed_keepout("scrap_anchor", &unit, x, z, seed);
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

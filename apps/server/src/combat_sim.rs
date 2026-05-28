//! Combat sim — **entry/exit and arena shell only**, not a separate combat stack.
//!
//! ## One system with live FP / in-apartment combat
//!
//! | Layer | Shared with live game | Combat-sim-only |
//! |-------|----------------------|-----------------|
//! | Shooting | `submit_firearm_shot`, hitscan, `world_npc` damage | Open-arena LOS skip while session NPCs live |
//! | Melee | `submit_melee_swing`, `resolve_melee_swing_vs_npcs` | — |
//! | NPCs | `world_npc` table, `npc_tick_step`, `apply_npc_damage` | `session_key` prefix `combat_sim:{unit_key}` |
//! | Client session | `mountFpSession` (locomotion, hotbar, HUD, reducers) | `combatSimMode` → empty arena + inert apartment mounts |
//!
//! Client entry: `mountCombatSimSession` → `enter_combat_sim` → `mountFpSession({ combatSimMode: true })`.
//! Disabled apartment features (elevators, doors, decor, balcony) are **inert stubs** in
//! `fpSessionInertSubsystems.ts` — same session loop, not a fork.
//!
//! ## Arena-specific server behavior
//! - `enter_combat_sim`: full combat loadout, safe player spawn outside babushka aggro, session NPCs
//! - `shooter_in_combat_sim_open_arena`: skip megablock firearm LOS while live combat-sim NPCs exist
//! - Combat-sim death: no world item drops; respawn restores the full combat loadout in-arena
//! - `leave_combat_sim`: despawn session NPCs and teleport owner back to their bed (does not restore prior loadout)

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments::{self, apartment_unit, ApartmentUnit, UNIT_STATE_CLAIMED};
use crate::auth;
use crate::combat_sim_npc_spawn;
use crate::generated_collision_constants::{
    combat_sim_arena_collision_aabbs_for_unit_bounds, COMBAT_SIM_ARENA_PAD_M,
    COMBAT_SIM_FALLBACK_HALF_EXTENT_M,
};
use crate::inventory::{
    delete_all_player_inventory_and_hotbar_items, reset_player_loadout_for_respawn,
    try_grant_stack_to_player,
};
use crate::loadout;
use crate::movement;
use crate::npc::{self, world_npc};
use crate::player_vitals;
use crate::pose::{self, player_pose};

/// Every ranged + melee weapon and a full ammo stack for combat sim testing.
/// Grant order fills hotbar first (6 slots), then backpack.
const COMBAT_SIM_LOADOUT: &[(&str, u32)] = &[
    ("shotgun-coach", 1),
    ("pistol", 1),
    ("knife", 1),
    ("crowbar", 1),
    ("srbosjek", 1),
    ("baseball-bat", 1),
    ("screwdriver", 1),
    ("ammo-shotgun-shell", 24),
    ("ammo-9mm", 60),
];

/// Match live-world babushka aggro so combat sim behaves like the real apartment encounter.
pub const COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M: f32 = npc::BABUSHKA_AGGRO_RANGE_M;
/// Planar buffer beyond aggro — player and babushka must start/respawn outside this gap.
const BABUSHKA_PLAYER_SPAWN_BUFFER_M: f32 = 4.0;
/// Minimum planar distance from the player to babushka on enter + corpse respawn.
pub const BABUSHKA_PLAYER_MIN_SEPARATION_M: f32 =
    COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M + BABUSHKA_PLAYER_SPAWN_BUFFER_M;

/// Death clip (~2.47 s) + die one-shot + epitaph MP3 — keep corpse until voice lines finish.
const BABUSHKA_CORPSE_TOTAL_MICROS: i64 = 22_000_000;
const COMBAT_SIM_DEFAULT_BABUSHKA_COUNT: usize = 5;
const COMBAT_SIM_DEFAULT_BABUSHKA_CENTER_RING_M: f32 = 2.25;

pub fn session_owner_for_session_key(ctx: &ReducerContext, session_key: &str) -> Option<Identity> {
    let unit_key = session_key.strip_prefix("combat_sim:")?;
    ctx.db
        .apartment_unit()
        .iter()
        .find(|u| u.unit_key == unit_key && u.owner.is_some())
        .and_then(|u| u.owner)
}

fn hash_u64_to_unit(seed: u64) -> f32 {
    let mixed = seed.wrapping_mul(1103515245).wrapping_add(12345);
    (mixed & 0xffff) as f32 / 65535.0
}

/// Play floor XZ (before perimeter pad) — fixed combat radius centered on the apartment unit.
fn combat_sim_play_footprint(unit: &ApartmentUnit) -> (f32, f32, f32, f32) {
    let cx = (unit.bound_min_x + unit.bound_max_x) * 0.5;
    let cz = (unit.bound_min_z + unit.bound_max_z) * 0.5;
    let h = COMBAT_SIM_FALLBACK_HALF_EXTENT_M;
    (cx - h, cx + h, cz - h, cz + h)
}

fn combat_sim_padded_shell_xz(unit: &ApartmentUnit) -> (f32, f32, f32, f32) {
    let (min_x, max_x, min_z, max_z) = combat_sim_play_footprint(unit);
    (
        min_x - COMBAT_SIM_ARENA_PAD_M,
        max_x + COMBAT_SIM_ARENA_PAD_M,
        min_z - COMBAT_SIM_ARENA_PAD_M,
        max_z + COMBAT_SIM_ARENA_PAD_M,
    )
}

/// Random babushka pose inside authored apartment bounds (megablock floor encounters).
pub fn random_babushka_pose_in_apartment_bounds(
    unit: &ApartmentUnit,
    salt: u64,
) -> (f32, f32, f32, f32) {
    let inset = 0.75;
    let min_x = unit.bound_min_x + inset;
    let max_x = unit.bound_max_x - inset;
    let min_z = unit.bound_min_z + inset;
    let max_z = unit.bound_max_z - inset;
    if max_x <= min_x || max_z <= min_z {
        let cx = (unit.bound_min_x + unit.bound_max_x) * 0.5;
        let cz = (unit.bound_min_z + unit.bound_max_z) * 0.5;
        return (cx, unit.foot_y, cz, 0.0);
    }
    let x = min_x + hash_u64_to_unit(salt) * (max_x - min_x);
    let z = min_z + hash_u64_to_unit(salt.wrapping_mul(31)) * (max_z - min_z);
    let yaw = hash_u64_to_unit(salt.wrapping_mul(97)) * std::f32::consts::TAU;
    (x, unit.foot_y, z, yaw)
}

/// Random babushka pose inside the combat arena (inset from bounds).
pub fn random_babushka_pose_in_unit(unit: &ApartmentUnit, salt: u64) -> (f32, f32, f32, f32) {
    let inset = 0.75;
    let (min_x, max_x, min_z, max_z) = combat_sim_play_footprint(unit);
    let min_x = min_x + inset;
    let max_x = max_x - inset;
    let min_z = min_z + inset;
    let max_z = max_z - inset;
    let x = min_x + hash_u64_to_unit(salt) * (max_x - min_x);
    let z = min_z + hash_u64_to_unit(salt.wrapping_mul(31)) * (max_z - min_z);
    let yaw = hash_u64_to_unit(salt.wrapping_mul(97)) * std::f32::consts::TAU;
    (x, unit.foot_y, z, yaw)
}

/// After corpse linger, delete the dead row and spawn a fresh babushka at a random arena spot.
/// Returns `true` when the corpse row was deleted (caller must not update that `npc_id`).
pub fn maybe_despawn_corpse_and_respawn(ctx: &ReducerContext, npc: &npc::WorldNpc, now_us: i64) -> bool {
    if npc.state != npc::NPC_STATE_DEAD {
        return false;
    }
    let Some(unit_key) = npc.session_key.strip_prefix("combat_sim:") else {
        return false;
    };
    if now_us - npc.last_melee_micros < BABUSHKA_CORPSE_TOTAL_MICROS {
        return false;
    }
    let Some(unit) = ctx
        .db
        .apartment_unit()
        .iter()
        .find(|u| u.unit_key == unit_key)
    else {
        return false;
    };
    let Some(owner) = unit.owner else {
        return false;
    };
    let session_key = npc.session_key.clone();
    let salt = now_us as u64 ^ npc.npc_id.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    let (player_x, player_z) = ctx
        .db
        .player_pose()
        .identity()
        .find(&owner)
        .map(|pose| (pose.x, pose.z))
        .unwrap_or_else(|| {
            let (px, _, pz) = combat_sim_player_spawn_pose(&unit);
            (px, pz)
        });
    let (x, y, z, yaw) = babushka_pose_separated_from_player(&unit, player_x, player_z, salt);
    let npc_id = npc.npc_id;
    ctx.db.world_npc().npc_id().delete(&npc_id);
    let _ = npc::spawn_babushka(ctx, session_key, x, y, z, yaw, Some(owner));
    true
}

pub fn combat_sim_arena_center(unit: &ApartmentUnit) -> (f32, f32, f32) {
    let cx = (unit.bound_min_x + unit.bound_max_x) * 0.5;
    let cz = (unit.bound_min_z + unit.bound_max_z) * 0.5;
    (cx, unit.foot_y, cz)
}

/// Perimeter walls + authored cover volumes — shared with client `combatSimArenaCollisionAabbs`.
pub fn combat_sim_arena_collision_aabbs(unit: &ApartmentUnit) -> Vec<([f32; 3], [f32; 3])> {
    let (min_x, max_x, min_z, max_z) = combat_sim_play_footprint(unit);
    combat_sim_arena_collision_aabbs_for_unit_bounds(
        min_x,
        max_x,
        min_z,
        max_z,
        unit.foot_y,
    )
}

/// Highest authored walk top under probe feet — used by combat-sim babushka vertical follow.
pub fn combat_sim_sample_walk_top_y(
    unit: &ApartmentUnit,
    x: f32,
    z: f32,
    probe_feet_y: f32,
) -> f32 {
    let (min_x, max_x, min_z, max_z) = combat_sim_play_footprint(unit);
    crate::generated_collision_constants::combat_sim_sample_walk_top_y_for_unit_bounds(
        min_x,
        max_x,
        min_z,
        max_z,
        unit.foot_y,
        x,
        z,
        probe_feet_y,
    )
}

fn clamp_player_xz_in_combat_arena(unit: &ApartmentUnit, x: f32, z: f32) -> (f32, f32) {
    clamp_babushka_xz_in_combat_arena(unit, x, z)
}

/// Push the player spawn away from a babushka threat point along the arena long axis.
fn player_spawn_xz_separated_from(
    unit: &ApartmentUnit,
    threat_x: f32,
    threat_z: f32,
) -> (f32, f32) {
    let (dx, dz) = separation_direction_toward_arena_edge(unit, threat_x, threat_z);
    let px = threat_x + dx * BABUSHKA_PLAYER_MIN_SEPARATION_M;
    let pz = threat_z + dz * BABUSHKA_PLAYER_MIN_SEPARATION_M;
    clamp_player_xz_in_combat_arena(unit, px, pz)
}

fn separation_direction_toward_arena_edge(
    unit: &ApartmentUnit,
    from_x: f32,
    from_z: f32,
) -> (f32, f32) {
    let (min_x, max_x, min_z, max_z) = combat_sim_play_footprint(unit);
    let cx = (min_x + max_x) * 0.5;
    let cz = (min_z + max_z) * 0.5;
    let width = max_x - min_x;
    let depth = max_z - min_z;
    if width >= depth {
        if from_x >= cx {
            (1.0, 0.0)
        } else {
            (-1.0, 0.0)
        }
    } else if from_z >= cz {
        (0.0, 1.0)
    } else {
        (0.0, -1.0)
    }
}

fn cardinal_player_spawn_candidates(
    unit: &ApartmentUnit,
    threat_x: f32,
    threat_z: f32,
) -> [(f32, f32); 4] {
    let inset = 0.55;
    let (min_x, max_x, min_z, max_z) = combat_sim_padded_shell_xz(unit);
    let min_x = min_x + inset;
    let max_x = max_x - inset;
    let min_z = min_z + inset;
    let max_z = max_z - inset;
    [
        clamp_player_xz_in_combat_arena(unit, max_x, threat_z),
        clamp_player_xz_in_combat_arena(unit, min_x, threat_z),
        clamp_player_xz_in_combat_arena(unit, threat_x, max_z),
        clamp_player_xz_in_combat_arena(unit, threat_x, min_z),
    ]
}

fn player_spawn_xz_farthest_from_babushkas(
    unit: &ApartmentUnit,
    threat_x: f32,
    threat_z: f32,
) -> (f32, f32) {
    let min_sep_sq = BABUSHKA_PLAYER_MIN_SEPARATION_M * BABUSHKA_PLAYER_MIN_SEPARATION_M;
    let mut best: Option<(f32, f32, f32)> = None;
    for (x, z) in cardinal_player_spawn_candidates(unit, threat_x, threat_z) {
        let d_sq = planar_distance_sq(x, z, threat_x, threat_z);
        if d_sq >= min_sep_sq && best.map(|b| d_sq > b.2).unwrap_or(true) {
            best = Some((x, z, d_sq));
        }
    }
    if let Some((x, z, _)) = best {
        return (x, z);
    }
    player_spawn_xz_separated_from(unit, threat_x, threat_z)
}

fn nearest_living_babushka_xz_near(
    ctx: &ReducerContext,
    session_key: &str,
    near_x: f32,
    near_z: f32,
) -> Option<(f32, f32)> {
    let mut best: Option<(f32, f32, f32)> = None;
    for npc in ctx.db.world_npc().iter() {
        if npc.session_key != session_key
            || npc.archetype != npc::NPC_ARCHETYPE_BABUSHKA
            || npc.state == npc::NPC_STATE_DEAD
            || npc.health <= 0.0
        {
            continue;
        }
        let d_sq = planar_distance_sq(npc.x, npc.z, near_x, near_z);
        if best.map(|b| d_sq < b.2).unwrap_or(true) {
            best = Some((npc.x, npc.z, d_sq));
        }
    }
    best.map(|b| (b.0, b.1))
}

/// Default combat-sim player feet — outside aggro from the arena-center babushka cluster.
pub fn combat_sim_player_spawn_pose(unit: &ApartmentUnit) -> (f32, f32, f32) {
    let (cx, _, cz) = combat_sim_arena_center(unit);
    let (px, pz) = player_spawn_xz_separated_from(unit, cx, cz);
    (px, unit.foot_y, pz)
}

/// Respawn feet — farthest safe padded-arena point from the nearest living session babushka.
pub fn combat_sim_player_respawn_pose(
    ctx: &ReducerContext,
    unit: &ApartmentUnit,
    session_key: &str,
    from_x: f32,
    from_z: f32,
) -> (f32, f32, f32) {
    let (threat_x, threat_z) = nearest_living_babushka_xz_near(ctx, session_key, from_x, from_z)
        .unwrap_or_else(|| {
            let (cx, _, cz) = combat_sim_arena_center(unit);
            (cx, cz)
        });
    let (px, pz) = player_spawn_xz_farthest_from_babushkas(unit, threat_x, threat_z);
    (px, unit.foot_y, pz)
}

/// True while the player is still in an active combat-sim session (live NPCs or arena pose).
pub fn player_in_combat_sim(ctx: &ReducerContext, owner: Identity) -> bool {
    let CombatSimArena { unit, session_key } = resolve_combat_sim_arena(ctx, owner);
    if ctx
        .db
        .world_npc()
        .iter()
        .any(|n| n.session_key == session_key)
    {
        return true;
    }
    let Some(sp) = ctx.db.player_pose().identity().find(&owner) else {
        return false;
    };
    player_at_combat_sim_arena(&unit, &sp)
}

/// While in combat sim, respawn at a safe arena point outside babushka aggro (not bed).
pub fn respawn_pose_if_in_open_arena(
    ctx: &ReducerContext,
    owner: Identity,
    base_seq: u64,
    in_seq: u64,
) -> Option<pose::PlayerPose> {
    if !player_in_combat_sim(ctx, owner) {
        return None;
    }
    let CombatSimArena { unit, session_key } = resolve_combat_sim_arena(ctx, owner);
    pose::ensure_player_pose_row(ctx, owner);
    let mut sp = ctx.db.player_pose().identity().find(&owner)?;
    let (arena_x, arena_y, arena_z) =
        combat_sim_player_respawn_pose(ctx, &unit, &session_key, sp.x, sp.z);
    let (threat_x, threat_z) = nearest_living_babushka_xz_near(ctx, &session_key, sp.x, sp.z)
        .unwrap_or_else(|| {
            let (cx, _, cz) = combat_sim_arena_center(&unit);
            (cx, cz)
        });
    sp.x = arena_x;
    sp.y = arena_y;
    sp.z = arena_z;
    sp.vel_x = 0.0;
    sp.vel_y = 0.0;
    sp.vel_z = 0.0;
    sp.grounded = 1;
    sp.yaw = (threat_x - arena_x).atan2(threat_z - arena_z);
    sp.seq = base_seq.max(in_seq).saturating_add(1);
    Some(sp)
}

pub fn combat_sim_session_key(unit: &ApartmentUnit) -> String {
    format!("combat_sim:{}", unit.unit_key)
}

pub fn fallback_combat_sim_session_key(owner: Identity) -> String {
    format!("combat_sim:fallback:{owner}")
}

fn fallback_combat_sim_unit() -> ApartmentUnit {
    let h = COMBAT_SIM_FALLBACK_HALF_EXTENT_M;
    ApartmentUnit {
        unit_key: "combat_sim:fallback".to_string(),
        floor_doc_id: String::new(),
        level: 0,
        unit_id: "combat_sim_fallback".to_string(),
        state: UNIT_STATE_CLAIMED,
        owner: None,
        claim_started_by: None,
        claim_progress_secs: 0.0,
        last_claim_pulse_micros: 0,
        reinforce_progress_secs: 0.0,
        reinforce_by: None,
        reinforced: 0,
        bed_x: 0.0,
        bed_y: 0.0,
        bed_z: 0.0,
        bed_yaw: 0.0,
        foot_x: 0.0,
        foot_y: 0.0,
        foot_z: 0.0,
        wardrobe_x: 0.0,
        wardrobe_z: 0.0,
        stove_x: 0.0,
        stove_z: 0.0,
        bound_min_x: -h,
        bound_max_x: h,
        bound_min_y: 0.0,
        bound_max_y: 4.0,
        bound_min_z: -h,
        bound_max_z: h,
    }
}

struct CombatSimArena {
    unit: ApartmentUnit,
    session_key: String,
}

/// Claimed apartment bounds when available; otherwise a fixed open arena (dev / no home slot).
fn resolve_combat_sim_arena(ctx: &ReducerContext, owner: Identity) -> CombatSimArena {
    apartments::ensure_player_home_apartment(ctx, owner);
    if let Some(unit) = owned_claimed_unit(ctx, owner) {
        return CombatSimArena {
            session_key: combat_sim_session_key(&unit),
            unit,
        };
    }
    log::warn!("enter_combat_sim: no claimed apartment for {owner} — using fallback arena");
    CombatSimArena {
        unit: fallback_combat_sim_unit(),
        session_key: fallback_combat_sim_session_key(owner),
    }
}

fn combat_sim_session_key_for_owner(ctx: &ReducerContext, owner: Identity) -> String {
    owned_claimed_unit(ctx, owner)
        .map(|unit| combat_sim_session_key(&unit))
        .unwrap_or_else(|| fallback_combat_sim_session_key(owner))
}

fn combat_sim_session_keys_for_owner(ctx: &ReducerContext, owner: Identity) -> Vec<String> {
    let mut keys = vec![fallback_combat_sim_session_key(owner)];
    if let Some(unit) = owned_claimed_unit(ctx, owner) {
        keys.push(combat_sim_session_key(&unit));
    }
    keys
}

pub fn owned_claimed_unit(ctx: &ReducerContext, owner: Identity) -> Option<ApartmentUnit> {
    ctx.db
        .apartment_unit()
        .iter()
        .find(|u| u.owner == Some(owner) && u.state == UNIT_STATE_CLAIMED)
}

/// True while this player has live combat-sim NPCs — skip megablock firearm LOS (see module docs).
pub fn shooter_in_combat_sim_open_arena(ctx: &ReducerContext, shooter: Identity) -> bool {
    let session_key = combat_sim_session_key_for_owner(ctx, shooter);
    ctx.db
        .world_npc()
        .iter()
        .any(|n| n.session_key == session_key && n.state != npc::NPC_STATE_DEAD && n.health > 0.0)
}

pub(crate) fn grant_combat_sim_loadout(ctx: &ReducerContext, owner: Identity) {
    delete_all_player_inventory_and_hotbar_items(ctx, owner);
    crate::firearm::reset_player_firearm_chamber(ctx, owner);
    for &(def_id, qty) in COMBAT_SIM_LOADOUT {
        match try_grant_stack_to_player(ctx, owner, def_id.to_string(), qty) {
            Ok(remaining) if remaining > 0 => {
                log::error!(
                    "combat sim loadout: could not fit all of {def_id} (remaining {remaining})"
                );
            }
            Err(e) => {
                log::error!("combat sim loadout: grant {def_id} failed: {e}");
            }
            _ => {}
        }
    }
    loadout::reset_player_active_hotbar_slot_to_first(ctx, owner);
}

fn planar_distance_sq(ax: f32, az: f32, bx: f32, bz: f32) -> f32 {
    let dx = ax - bx;
    let dz = az - bz;
    dx * dx + dz * dz
}

fn clamp_babushka_xz_in_unit(unit: &ApartmentUnit, x: f32, z: f32) -> (f32, f32) {
    let inset = 0.55;
    let (min_x, max_x, min_z, max_z) = combat_sim_play_footprint(unit);
    (
        x.clamp(min_x + inset, max_x - inset),
        z.clamp(min_z + inset, max_z - inset),
    )
}

/// Clamp NPC locomotion to the same padded combat arena shell authored on the client.
pub fn clamp_babushka_xz_in_combat_arena(unit: &ApartmentUnit, x: f32, z: f32) -> (f32, f32) {
    let inset = 0.55;
    let (min_x, max_x, min_z, max_z) = combat_sim_padded_shell_xz(unit);
    (
        x.clamp(min_x + inset, max_x - inset),
        z.clamp(min_z + inset, max_z - inset),
    )
}

/// Push babushka away from the player along the arena long axis fallback.
fn babushka_spawn_xz(unit: &ApartmentUnit, player_x: f32, player_z: f32) -> (f32, f32, f32, f32) {
    let (min_x, max_x, min_z, max_z) = combat_sim_play_footprint(unit);
    let cx = (min_x + max_x) * 0.5;
    let cz = (min_z + max_z) * 0.5;
    let width = max_x - min_x;
    let depth = max_z - min_z;
    let mut dx = if width >= depth {
        if player_x >= cx {
            -1.0
        } else {
            1.0
        }
    } else if player_z >= cz {
        -1.0
    } else {
        1.0
    };
    let mut dz = 0.0;
    if width < depth {
        dx = 0.0;
        dz = if player_z >= cz { -1.0 } else { 1.0 };
    }
    let mut nx = player_x + dx * BABUSHKA_PLAYER_MIN_SEPARATION_M;
    let mut nz = player_z + dz * BABUSHKA_PLAYER_MIN_SEPARATION_M;
    (nx, nz) = clamp_babushka_xz_in_unit(unit, nx, nz);
    let yaw = (player_x - nx).atan2(player_z - nz);
    (nx, unit.foot_y, nz, yaw)
}

fn default_center_babushka_pose(unit: &ApartmentUnit, index: usize) -> (f32, f32, f32, f32) {
    let (cx, _, cz) = combat_sim_arena_center(unit);
    let count = COMBAT_SIM_DEFAULT_BABUSHKA_COUNT as f32;
    let min_ring = npc::babushka_min_peer_center_distance_m()
        / (2.0 * (std::f32::consts::PI / count).sin().max(0.01));
    let ring = COMBAT_SIM_DEFAULT_BABUSHKA_CENTER_RING_M.max(min_ring);
    let angle = index as f32 / count * std::f32::consts::TAU;
    let x = cx + angle.sin() * ring;
    let z = cz + angle.cos() * ring;
    let (x, z) = clamp_babushka_xz_in_combat_arena(unit, x, z);
    let yaw = (cx - x).atan2(cz - z);
    (x, unit.foot_y, z, yaw)
}

/// Random arena pose at least `BABUSHKA_PLAYER_MIN_SEPARATION_M` from the player when possible.
pub fn babushka_pose_separated_from_player(
    unit: &ApartmentUnit,
    player_x: f32,
    player_z: f32,
    salt: u64,
) -> (f32, f32, f32, f32) {
    let min_sep_sq = BABUSHKA_PLAYER_MIN_SEPARATION_M * BABUSHKA_PLAYER_MIN_SEPARATION_M;
    let mut best: Option<(f32, f32, f32, f32, f32)> = None;
    for attempt in 0..16 {
        let sample_salt = salt.wrapping_add((attempt as u64).wrapping_mul(0x517c_c1b7_2722_0e95));
        let (x, y, z, yaw) = random_babushka_pose_in_unit(unit, sample_salt);
        let d_sq = planar_distance_sq(x, z, player_x, player_z);
        if d_sq >= min_sep_sq {
            return (x, y, z, yaw);
        }
        if best.map(|b| d_sq > b.4).unwrap_or(true) {
            best = Some((x, y, z, yaw, d_sq));
        }
    }
    if let Some((x, y, z, yaw, d_sq)) = best {
        if d_sq >= min_sep_sq * 0.64 {
            return (x, y, z, yaw);
        }
    }
    babushka_spawn_xz(unit, player_x, player_z)
}

/// Teleport into the combat sim arena, grant full weapons + ammo, spawn one idle babushka out of aggro.
#[spacetimedb::reducer]
pub fn enter_combat_sim(ctx: &ReducerContext) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("enter_combat_sim blocked: {e}");
        return;
    }
    let owner = ctx.sender();
    // Dead players may re-enter combat sim — vitals are restored below (no bed respawn gate).
    let CombatSimArena { unit, session_key } = resolve_combat_sim_arena(ctx, owner);
    npc::clear_npcs_for_session(ctx, &session_key);

    let bed_pose = apartments::join_pose_from_owned_bed(ctx, owner).unwrap_or_else(|| {
        pose::ensure_player_pose_row(ctx, owner);
        ctx.db
            .player_pose()
            .identity()
            .find(&owner)
            .expect("pose row after ensure")
    });

    let (arena_x, arena_y, arena_z) = combat_sim_player_spawn_pose(&unit);
    let (cluster_x, _, cluster_z) = combat_sim_arena_center(&unit);
    let face_cluster_yaw = (cluster_x - arena_x).atan2(cluster_z - arena_z);
    let mut sp = bed_pose;
    sp.x = arena_x;
    sp.y = arena_y;
    sp.z = arena_z;
    sp.vel_x = 0.0;
    sp.vel_y = 0.0;
    sp.vel_z = 0.0;
    sp.grounded = 1;
    sp.seq = sp.seq.saturating_add(1);
    sp.yaw = face_cluster_yaw;
    ctx.db.player_pose().identity().update(sp);
    movement::reset_player_input_row(ctx, owner, face_cluster_yaw);

    grant_combat_sim_loadout(ctx, owner);
    player_vitals::restore_player_vitals_full(ctx, owner);

    let authored =
        combat_sim_npc_spawn::authored_spawns_for_owner_unit(ctx, owner, unit.unit_key.as_str());
    let npc_count = if authored.is_empty() {
        for i in 0..COMBAT_SIM_DEFAULT_BABUSHKA_COUNT {
            let (bx, by, bz, byaw) = default_center_babushka_pose(&unit, i);
            let _npc_id =
                npc::spawn_babushka(ctx, session_key.clone(), bx, by, bz, byaw, Some(owner));
        }
        COMBAT_SIM_DEFAULT_BABUSHKA_COUNT
    } else {
        let count = authored.len();
        for row in authored {
            let _npc_id = npc::spawn_babushka(
                ctx,
                session_key.clone(),
                row.x,
                row.y,
                row.z,
                row.yaw,
                Some(owner),
            );
        }
        count
    };

    log::info!("enter_combat_sim: owner={owner} npc_count={npc_count}",);
}

fn player_at_combat_sim_arena(unit: &ApartmentUnit, pose: &pose::PlayerPose) -> bool {
    let inset = 0.55;
    let (min_x, max_x, min_z, max_z) = combat_sim_padded_shell_xz(unit);
    let min_x = min_x + inset;
    let max_x = max_x - inset;
    let min_z = min_z + inset;
    let max_z = max_z - inset;
    let dy = (pose.y - unit.foot_y).abs();
    pose.x >= min_x && pose.x <= max_x && pose.z >= min_z && pose.z <= max_z && dy < 1.75
}

/// Tear down combat-sim NPCs and return the owner to their bed spawn (does not restore prior loadout).
#[spacetimedb::reducer]
pub fn leave_combat_sim(ctx: &ReducerContext) {
    let owner = ctx.sender();
    apartments::ensure_player_home_apartment(ctx, owner);
    let session_keys = combat_sim_session_keys_for_owner(ctx, owner);
    let unit = owned_claimed_unit(ctx, owner).unwrap_or_else(fallback_combat_sim_unit);
    let had_session_npcs = ctx.db.world_npc().iter().any(|n| {
        session_keys
            .iter()
            .any(|session_key| n.session_key == *session_key)
    });
    for session_key in &session_keys {
        npc::clear_npcs_for_session(ctx, session_key.as_str());
    }

    pose::ensure_player_pose_row(ctx, owner);
    let Some(sp) = ctx.db.player_pose().identity().find(&owner) else {
        return;
    };
    if !had_session_npcs && !player_at_combat_sim_arena(&unit, &sp) {
        return;
    }

    let Some(bed_pose) = apartments::join_pose_from_owned_bed(ctx, owner) else {
        return;
    };
    let mut sp = sp;
    sp.x = bed_pose.x;
    sp.y = bed_pose.y;
    sp.z = bed_pose.z;
    sp.yaw = bed_pose.yaw;
    sp.vel_x = 0.0;
    sp.vel_y = 0.0;
    sp.vel_z = 0.0;
    sp.grounded = 1;
    sp.seq = sp.seq.saturating_add(1);
    let yaw = sp.yaw;
    ctx.db.player_pose().identity().update(sp);
    movement::reset_player_input_row(ctx, owner, yaw);
    reset_player_loadout_for_respawn(ctx, owner);
    loadout::reset_player_active_hotbar_slot_to_first(ctx, owner);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::apartments::ApartmentUnit;

    fn test_unit() -> ApartmentUnit {
        ApartmentUnit {
            unit_key: "combat_sim_test".to_string(),
            floor_doc_id: "floor_test".to_string(),
            level: 1,
            unit_id: "unit_test".to_string(),
            state: UNIT_STATE_CLAIMED,
            owner: None,
            claim_started_by: None,
            claim_progress_secs: 0.0,
            last_claim_pulse_micros: 0,
            reinforce_progress_secs: 0.0,
            reinforce_by: None,
            reinforced: 0,
            bound_min_x: -6.0,
            bound_max_x: 6.0,
            bound_min_y: 0.0,
            bound_max_y: 3.0,
            bound_min_z: -5.0,
            bound_max_z: 5.0,
            bed_x: 0.0,
            bed_y: 0.0,
            bed_z: 0.0,
            bed_yaw: 0.0,
            foot_x: 0.0,
            foot_y: 0.0,
            foot_z: 0.0,
            wardrobe_x: -4.0,
            wardrobe_z: -4.0,
            stove_x: 4.0,
            stove_z: 4.0,
        }
    }

    #[test]
    fn combat_sim_aggro_matches_live_world_babushka() {
        assert!((COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M - npc::BABUSHKA_AGGRO_RANGE_M).abs() < 1e-4);
    }

    #[test]
    fn player_spawn_is_outside_aggro_from_center_babushka_cluster() {
        let unit = test_unit();
        let (px, _, pz) = combat_sim_player_spawn_pose(&unit);
        let (cx, _, cz) = combat_sim_arena_center(&unit);
        let cluster_edge = COMBAT_SIM_DEFAULT_BABUSHKA_CENTER_RING_M;
        let to_center = planar_distance_sq(px, pz, cx, cz).sqrt();
        assert!(
            to_center >= BABUSHKA_PLAYER_MIN_SEPARATION_M - 0.05,
            "player spawn {to_center}m from cluster center"
        );
        let to_nearest_babushka = (to_center - cluster_edge).max(0.0);
        assert!(
            to_nearest_babushka > COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M,
            "player {to_nearest_babushka}m from nearest default-cluster babushka"
        );
    }

    #[test]
    fn initial_babushka_spawn_is_outside_aggro_from_player_spawn() {
        let unit = test_unit();
        let (px, _, pz) = combat_sim_player_spawn_pose(&unit);
        let (bx, _, bz, _) = babushka_spawn_xz(&unit, px, pz);
        let d = planar_distance_sq(bx, bz, px, pz).sqrt();
        assert!(
            d >= COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M + 2.0,
            "babushka spawned {d}m from player (min expected {})",
            COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M + 2.0
        );
    }

    #[test]
    fn respawn_pose_prefers_separation_from_player() {
        let unit = test_unit();
        let (px, _, pz) = combat_sim_player_spawn_pose(&unit);
        let (bx, _, bz, _) = babushka_pose_separated_from_player(&unit, px, pz, 0xdead_beef);
        let d = planar_distance_sq(bx, bz, px, pz).sqrt();
        assert!(
            d >= COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M + 1.5,
            "respawn pose {d}m from player"
        );
    }

    #[test]
    fn farthest_player_spawn_from_center_babushka_is_outside_aggro() {
        let unit = test_unit();
        let (cx, _, cz) = combat_sim_arena_center(&unit);
        let (px, pz) = player_spawn_xz_farthest_from_babushkas(&unit, cx, cz);
        let d = planar_distance_sq(px, pz, cx, cz).sqrt();
        assert!(
            d >= BABUSHKA_PLAYER_MIN_SEPARATION_M - 0.05,
            "respawn dist {d}"
        );
    }

    #[test]
    fn combat_arena_npc_clamp_matches_client_padded_bounds() {
        let unit = test_unit();
        let (_, play_max_x, play_min_z, _) = combat_sim_play_footprint(&unit);
        let (x, z) = clamp_babushka_xz_in_combat_arena(&unit, 99.0, -99.0);
        assert!((x - (play_max_x + COMBAT_SIM_ARENA_PAD_M - 0.55)).abs() < 1e-4);
        assert!((z - (play_min_z - COMBAT_SIM_ARENA_PAD_M + 0.55)).abs() < 1e-4);
    }

    #[test]
    fn default_combat_sim_babushkas_spawn_in_center_cluster() {
        let unit = test_unit();
        let (cx, _, cz) = combat_sim_arena_center(&unit);
        for i in 0..COMBAT_SIM_DEFAULT_BABUSHKA_COUNT {
            let (x, y, z, _) = default_center_babushka_pose(&unit, i);
            let d = planar_distance_sq(x, z, cx, cz).sqrt();
            assert!((y - unit.foot_y).abs() < 1e-4);
            assert!(d <= COMBAT_SIM_DEFAULT_BABUSHKA_CENTER_RING_M + 1e-4);
        }
    }
}

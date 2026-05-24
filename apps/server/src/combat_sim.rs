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
//! - `enter_combat_sim`: full combat loadout, arena-center pose, spawn NPCs for the session
//! - `shooter_in_combat_sim_open_arena`: skip megablock firearm LOS while live combat-sim NPCs exist
//! - Combat-sim death: no world item drops; respawn restores the full combat loadout in-arena
//! - `leave_combat_sim`: despawn session NPCs and teleport owner back to their bed (does not restore prior loadout)

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments::{self, apartment_unit, ApartmentUnit, UNIT_STATE_CLAIMED};
use crate::auth;
use crate::combat_sim_npc_spawn;
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

/// Match client `combatSimStaticWorld.ts` fallback arena when no owned unit row is synced yet.
const COMBAT_SIM_FALLBACK_HALF_EXTENT_M: f32 = 14.0;
const COMBAT_SIM_ARENA_PAD_M: f32 = 6.0;

/// Match live-world babushka aggro so combat sim behaves like the real apartment encounter.
pub const COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M: f32 = npc::BABUSHKA_AGGRO_RANGE_M;
/// Planar buffer beyond aggro — player and babushka must start/respawn outside this gap.
const BABUSHKA_PLAYER_SPAWN_BUFFER_M: f32 = 4.0;
/// Minimum planar distance from the player to babushka on enter + corpse respawn.
pub const BABUSHKA_PLAYER_MIN_SEPARATION_M: f32 =
    COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M + BABUSHKA_PLAYER_SPAWN_BUFFER_M;

/// Death clip (~2.47 s) + die one-shot + epitaph MP3 — keep corpse until voice lines finish.
const BABUSHKA_CORPSE_TOTAL_MICROS: i64 = 22_000_000;

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

/// Random babushka pose inside the combat arena (inset from bounds).
pub fn random_babushka_pose_in_unit(unit: &ApartmentUnit, salt: u64) -> (f32, f32, f32, f32) {
    let inset = 0.75;
    let min_x = unit.bound_min_x + inset;
    let max_x = unit.bound_max_x - inset;
    let min_z = unit.bound_min_z + inset;
    let max_z = unit.bound_max_z - inset;
    let x = min_x + hash_u64_to_unit(salt) * (max_x - min_x);
    let z = min_z + hash_u64_to_unit(salt.wrapping_mul(31)) * (max_z - min_z);
    let yaw = hash_u64_to_unit(salt.wrapping_mul(97)) * std::f32::consts::TAU;
    (x, unit.foot_y, z, yaw)
}

/// After corpse linger, delete the dead row and spawn a fresh babushka at a random arena spot.
pub fn maybe_despawn_corpse_and_respawn(ctx: &ReducerContext, npc: &npc::WorldNpc, now_us: i64) {
    if npc.state != npc::NPC_STATE_DEAD {
        return;
    }
    let Some(unit_key) = npc.session_key.strip_prefix("combat_sim:") else {
        return;
    };
    if now_us - npc.last_melee_micros < BABUSHKA_CORPSE_TOTAL_MICROS {
        return;
    }
    let Some(unit) = ctx
        .db
        .apartment_unit()
        .iter()
        .find(|u| u.unit_key == unit_key)
    else {
        return;
    };
    let Some(owner) = unit.owner else {
        return;
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
            let (cx, _, cz) = combat_sim_player_spawn_pose(&unit);
            (cx, cz)
        });
    let (x, y, z, yaw) =
        babushka_pose_separated_from_player(&unit, player_x, player_z, salt);
    let npc_id = npc.npc_id;
    ctx.db.world_npc().npc_id().delete(&npc_id);
    let _ = npc::spawn_babushka(ctx, session_key, x, y, z, yaw, Some(owner));
}

pub fn combat_sim_player_spawn_pose(unit: &ApartmentUnit) -> (f32, f32, f32) {
    let cx = (unit.bound_min_x + unit.bound_max_x) * 0.5;
    let cz = (unit.bound_min_z + unit.bound_max_z) * 0.5;
    (cx, unit.foot_y, cz)
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

/// While in combat sim, respawn at the arena center (not bed) so recovery stays in-session.
pub fn respawn_pose_if_in_open_arena(
    ctx: &ReducerContext,
    owner: Identity,
    base_seq: u64,
    in_seq: u64,
) -> Option<pose::PlayerPose> {
    if !player_in_combat_sim(ctx, owner) {
        return None;
    }
    let CombatSimArena { unit, .. } = resolve_combat_sim_arena(ctx, owner);
    pose::ensure_player_pose_row(ctx, owner);
    let mut sp = ctx.db.player_pose().identity().find(&owner)?;
    let (arena_x, arena_y, arena_z) = combat_sim_player_spawn_pose(&unit);
    sp.x = arena_x;
    sp.y = arena_y;
    sp.z = arena_z;
    sp.vel_x = 0.0;
    sp.vel_y = 0.0;
    sp.vel_z = 0.0;
    sp.grounded = 1;
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
    let half = COMBAT_SIM_FALLBACK_HALF_EXTENT_M + COMBAT_SIM_ARENA_PAD_M;
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
        bound_min_x: -half,
        bound_max_x: half,
        bound_min_y: 0.0,
        bound_max_y: 4.0,
        bound_min_z: -half,
        bound_max_z: half,
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
    (
        x.clamp(unit.bound_min_x + inset, unit.bound_max_x - inset),
        z.clamp(unit.bound_min_z + inset, unit.bound_max_z - inset),
    )
}

/// Push babushka away from the player along the arena long axis fallback.
fn babushka_spawn_xz(unit: &ApartmentUnit, player_x: f32, player_z: f32) -> (f32, f32, f32, f32) {
    let cx = (unit.bound_min_x + unit.bound_max_x) * 0.5;
    let cz = (unit.bound_min_z + unit.bound_max_z) * 0.5;
    let width = unit.bound_max_x - unit.bound_min_x;
    let depth = unit.bound_max_z - unit.bound_min_z;
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

    let player_yaw = bed_pose.yaw;
    let (arena_x, arena_y, arena_z) = combat_sim_player_spawn_pose(&unit);
    let mut sp = bed_pose;
    sp.x = arena_x;
    sp.y = arena_y;
    sp.z = arena_z;
    sp.vel_x = 0.0;
    sp.vel_y = 0.0;
    sp.vel_z = 0.0;
    sp.grounded = 1;
    sp.seq = sp.seq.saturating_add(1);
    let player_x = sp.x;
    let player_z = sp.z;
    ctx.db.player_pose().identity().update(sp);
    movement::reset_player_input_row(ctx, owner, player_yaw);

    grant_combat_sim_loadout(ctx, owner);
    player_vitals::restore_player_vitals_full(ctx, owner);

    let authored =
        combat_sim_npc_spawn::authored_spawns_for_owner_unit(ctx, owner, unit.unit_key.as_str());
    let npc_count = if authored.is_empty() {
        let (bx, by, bz, byaw) = babushka_spawn_xz(&unit, player_x, player_z);
        let _npc_id = npc::spawn_babushka(ctx, session_key, bx, by, bz, byaw, Some(owner));
        1
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
    let (ax, ay, az) = combat_sim_player_spawn_pose(unit);
    let dx = pose.x - ax;
    let dz = pose.z - az;
    let dy = (pose.y - ay).abs();
    dx * dx + dz * dz < 2.75 * 2.75 && dy < 1.75
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
    fn initial_babushka_spawn_is_outside_aggro_from_arena_center() {
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
}

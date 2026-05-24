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

/// Combat sim keeps aggro intentionally tight so animation states are easy to inspect.
pub const COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M: f32 = 2.75;
/// Minimum planar distance from the player spawn to the babushka (outside combat-sim aggro).
const BABUSHKA_SPAWN_SEPARATION_M: f32 = COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M + 1.75;

/// Death clip (~2.47 s) plus corpse linger before despawn + fresh spawn elsewhere in the arena.
const BABUSHKA_CORPSE_TOTAL_MICROS: i64 = 6_500_000;

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
    let (x, y, z, yaw) = random_babushka_pose_in_unit(&unit, salt);
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
    let Some(unit) = owned_claimed_unit(ctx, owner) else {
        return false;
    };
    let session_key = combat_sim_session_key(&unit);
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
    let unit = owned_claimed_unit(ctx, owner)?;
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

pub fn owned_claimed_unit(ctx: &ReducerContext, owner: Identity) -> Option<ApartmentUnit> {
    ctx.db
        .apartment_unit()
        .iter()
        .find(|u| u.owner == Some(owner) && u.state == UNIT_STATE_CLAIMED)
}

/// True while this player has live combat-sim NPCs — skip megablock firearm LOS (see module docs).
pub fn shooter_in_combat_sim_open_arena(ctx: &ReducerContext, shooter: Identity) -> bool {
    let Some(unit) = owned_claimed_unit(ctx, shooter) else {
        return false;
    };
    let session_key = combat_sim_session_key(&unit);
    ctx.db
        .world_npc()
        .iter()
        .any(|n| n.session_key == session_key && n.state != npc::NPC_STATE_DEAD && n.health > 0.0)
}

pub(crate) fn grant_combat_sim_loadout(ctx: &ReducerContext, owner: Identity) {
    delete_all_player_inventory_and_hotbar_items(ctx, owner);
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

fn babushka_spawn_xz(unit: &ApartmentUnit, player_x: f32, player_z: f32) -> (f32, f32, f32, f32) {
    let cx = (unit.bound_min_x + unit.bound_max_x) * 0.5;
    let cz = (unit.bound_min_z + unit.bound_max_z) * 0.5;
    let mut dx = cx - player_x;
    let mut dz = cz - player_z;
    let len = (dx * dx + dz * dz).sqrt();
    if len < 1e-3 {
        dx = 0.0;
        dz = 1.0;
    } else {
        dx /= len;
        dz /= len;
    }
    let mut nx = player_x + dx * BABUSHKA_SPAWN_SEPARATION_M;
    let mut nz = player_z + dz * BABUSHKA_SPAWN_SEPARATION_M;
    let inset = 0.55;
    nx = nx.clamp(unit.bound_min_x + inset, unit.bound_max_x - inset);
    nz = nz.clamp(unit.bound_min_z + inset, unit.bound_max_z - inset);
    let yaw = (player_x - nx).atan2(player_z - nz);
    (nx, unit.foot_y, nz, yaw)
}

/// Teleport into the combat sim arena, grant full weapons + ammo, spawn one idle babushka out of aggro.
#[spacetimedb::reducer]
pub fn enter_combat_sim(ctx: &ReducerContext) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("enter_combat_sim blocked: {e}");
        return;
    }
    let owner = ctx.sender();
    if player_vitals::is_player_dead(ctx, owner) {
        return;
    }
    apartments::ensure_player_home_apartment(ctx, owner);
    let Some(unit) = owned_claimed_unit(ctx, owner) else {
        log::warn!("enter_combat_sim: no claimed apartment for {owner}");
        return;
    };

    let session_key = combat_sim_session_key(&unit);
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
    let Some(unit) = owned_claimed_unit(ctx, owner) else {
        return;
    };
    let session_key = combat_sim_session_key(&unit);
    let had_session_npcs = ctx
        .db
        .world_npc()
        .iter()
        .any(|n| n.session_key == session_key);
    npc::clear_npcs_for_session(ctx, session_key.as_str());

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

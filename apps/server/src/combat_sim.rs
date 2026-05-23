//! Combat sim **entry/exit only** — not a separate combat stack.
//!
//! Spawns use the same `world_npc` table, AI tick, and damage path as future in-apartment NPCs.
//! Shooting and melee go through `submit_firearm_shot` / `submit_melee_swing` unchanged.
//!
//! Arena-specific behavior (not duplicated combat logic):
//! - `enter_combat_sim`: full combat loadout, bed pose, spawn NPCs tagged with `combat_sim:{unit_key}`
//! - `shooter_in_combat_sim_open_arena`: skip building firearm LOS while those NPCs are live
//!   (client mounts an empty plane; server still has baked megablock collision for hitscan)
//! - `leave_combat_sim`: despawn session NPCs

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartments::{self, apartment_unit, ApartmentUnit, UNIT_STATE_CLAIMED};
use crate::auth;
use crate::inventory::{delete_all_player_inventory_and_hotbar_items, try_grant_stack_to_player};
use crate::loadout;
use crate::movement;
use crate::combat_sim_npc_spawn;
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

/// Minimum planar distance from the player spawn to the babushka (outside default aggro).
const BABUSHKA_SPAWN_SEPARATION_M: f32 = 6.0;

pub fn session_owner_for_session_key(ctx: &ReducerContext, session_key: &str) -> Option<Identity> {
    let unit_key = session_key.strip_prefix("combat_sim:")?;
    ctx.db
        .apartment_unit()
        .iter()
        .find(|u| u.unit_key == unit_key)
        .and_then(|u| u.owner)
}

/// Replace a combat-sim babushka after death (delete row first, then call this).
pub fn respawn_babushka_for_session(ctx: &ReducerContext, session_key: &str) {
    let Some(unit_key) = session_key.strip_prefix("combat_sim:") else {
        return;
    };
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
    if player_vitals::is_player_dead(ctx, owner) {
        return;
    }
    pose::ensure_player_pose_row(ctx, owner);
    let Some(pose) = ctx.db.player_pose().identity().find(&owner) else {
        return;
    };
    let player_x = pose.x;
    let player_z = pose.z;

    let authored = combat_sim_npc_spawn::authored_spawns_for_owner_unit(
        ctx,
        owner,
        unit_key,
    );
    if let Some(row) = authored.first() {
        let _npc_id = npc::spawn_babushka(
            ctx,
            session_key.to_string(),
            row.x,
            row.y,
            row.z,
            row.yaw,
        );
    } else {
        let (bx, by, bz, byaw) = babushka_spawn_xz(&unit, player_x, player_z);
        let _npc_id = npc::spawn_babushka(ctx, session_key.to_string(), bx, by, bz, byaw);
    }
}

pub fn combat_sim_session_key(unit: &ApartmentUnit) -> String {
    format!("combat_sim:{}", unit.unit_key)
}

pub fn owned_claimed_unit(ctx: &ReducerContext, owner: Identity) -> Option<ApartmentUnit> {
    ctx.db.apartment_unit().iter().find(|u| {
        u.owner == Some(owner) && u.state == UNIT_STATE_CLAIMED
    })
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

fn grant_combat_sim_loadout(ctx: &ReducerContext, owner: Identity) {
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
    let mut sp = bed_pose;
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

    let authored = combat_sim_npc_spawn::authored_spawns_for_owner_unit(
        ctx,
        owner,
        unit.unit_key.as_str(),
    );
    let npc_count = if authored.is_empty() {
        let (bx, by, bz, byaw) = babushka_spawn_xz(&unit, player_x, player_z);
        let _npc_id = npc::spawn_babushka(ctx, session_key, bx, by, bz, byaw);
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
            );
        }
        count
    };

    log::info!(
        "enter_combat_sim: owner={owner} npc_count={npc_count}",
    );
}

/// Tear down combat-sim NPCs for the sender's claimed apartment (does not restore loadout).
#[spacetimedb::reducer]
pub fn leave_combat_sim(ctx: &ReducerContext) {
    let owner = ctx.sender();
    let Some(unit) = owned_claimed_unit(ctx, owner) else {
        return;
    };
    npc::clear_npcs_for_session(ctx, combat_sim_session_key(&unit).as_str());
}

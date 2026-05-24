//! Authoritative combat-sim NPC spawn anchors synced from client before `enter_combat_sim`.

use spacetimedb::{Identity, ReducerContext, Table};

#[spacetimedb::table(public, accessor = combat_sim_npc_spawn)]
pub struct CombatSimNpcSpawn {
    #[primary_key]
    #[auto_inc]
    pub row_id: u64,
    pub owner: Identity,
    pub unit_key: String,
    pub archetype: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub yaw: f32,
}

pub fn clear_combat_sim_spawns_for_owner_unit(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
) {
    let doomed: Vec<u64> = ctx
        .db
        .combat_sim_npc_spawn()
        .iter()
        .filter(|r| r.owner == owner && r.unit_key == unit_key)
        .map(|r| r.row_id)
        .collect();
    for id in doomed {
        ctx.db.combat_sim_npc_spawn().row_id().delete(&id);
    }
}

#[spacetimedb::reducer]
pub fn clear_combat_sim_npc_spawns(ctx: &ReducerContext, unit_key: String) {
    clear_combat_sim_spawns_for_owner_unit(ctx, ctx.sender(), unit_key.as_str());
}

#[spacetimedb::reducer]
pub fn add_combat_sim_npc_spawn(
    ctx: &ReducerContext,
    unit_key: String,
    archetype: String,
    x: f32,
    y: f32,
    z: f32,
    yaw: f32,
) {
    let owner = ctx.sender();
    let _ = ctx.db.combat_sim_npc_spawn().insert(CombatSimNpcSpawn {
        row_id: 0,
        owner,
        unit_key,
        archetype,
        x,
        y,
        z,
        yaw,
    });
}

pub fn authored_spawns_for_owner_unit(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
) -> Vec<CombatSimNpcSpawn> {
    ctx.db
        .combat_sim_npc_spawn()
        .iter()
        .filter(|r| r.owner == owner && r.unit_key == unit_key)
        .collect()
}

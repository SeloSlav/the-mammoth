//! Combat-sim babushka vertical follow + arena clamping — kept out of `npc.rs`.

use spacetimedb::{ReducerContext, Table};

use crate::apartments::apartment_unit;
use crate::combat_sim;
use crate::npc::WorldNpc;

pub fn snap_babushka_combat_sim_feet_y(ctx: &ReducerContext, npc: &mut WorldNpc) {
    if !npc.session_key.starts_with("combat_sim:") {
        return;
    }
    let Some(unit_key) = npc.session_key.strip_prefix("combat_sim:") else {
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
    npc.y = combat_sim::combat_sim_sample_walk_top_y(&unit, npc.x, npc.z, npc.y);
}

pub fn clamp_babushka_to_combat_arena(ctx: &ReducerContext, npc: &mut WorldNpc) {
    if !npc.session_key.starts_with("combat_sim:") {
        return;
    }
    let Some(unit_key) = npc.session_key.strip_prefix("combat_sim:") else {
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
    let (x, z) = combat_sim::clamp_babushka_xz_in_combat_arena(&unit, npc.x, npc.z);
    npc.x = x;
    npc.z = z;
}

//! Gather locomotion blockers for authoritative NPC capsule resolution.

use spacetimedb::{ReducerContext, Table};

use crate::apartment_door::{apartment_door, apartment_door_movement_blocking_aabb};
use crate::apartments::{apartment_partition_blocker, apartment_unit, ApartmentUnit};
use crate::combat_sim::combat_sim_arena_collision_aabbs;
use crate::elevator::{gather_elevator_locomotion_blockers, ElevatorBlockerQuery};
use crate::generated_collision_constants::{
    LOCOMOTION_BLOCKER_QUERY_PAD_M, LOCOMOTION_STATIC_MIN_BLOCKER_HEIGHT_M,
};
use crate::generated_collision_solids::{
    COLLISION_SOLID_AABB_SHARDS, COLLISION_SOLID_FOOTPRINT_MAX_X, COLLISION_SOLID_FOOTPRINT_MAX_Z,
    COLLISION_SOLID_FOOTPRINT_MIN_X, COLLISION_SOLID_FOOTPRINT_MIN_Z,
};
use crate::npc::{body_dims_for_archetype, WorldNpc};
use crate::stair_runtime_overlay;

struct BlockerQuery {
    x0: f32,
    x1: f32,
    z0: f32,
    z1: f32,
}

impl BlockerQuery {
    fn from_capsule_move(prev_x: f32, prev_z: f32, x: f32, z: f32, radius: f32) -> Self {
        let pad = radius + LOCOMOTION_BLOCKER_QUERY_PAD_M;
        Self {
            x0: prev_x.min(x) - pad,
            x1: prev_x.max(x) + pad,
            z0: prev_z.min(z) - pad,
            z1: prev_z.max(z) + pad,
        }
    }

    #[inline]
    fn disjoint_aabb(&self, mn: [f32; 3], mx: [f32; 3]) -> bool {
        self.x1 < mn[0] || self.x0 > mx[0] || self.z1 < mn[2] || self.z0 > mx[2]
    }
}

fn push_unique(out: &mut Vec<([f32; 3], [f32; 3])>, aabb: ([f32; 3], [f32; 3])) {
    out.push(aabb);
}

fn gather_megablock_static_blockers(
    query: &BlockerQuery,
    feet_y: f32,
    body_h: f32,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    for shard in COLLISION_SOLID_AABB_SHARDS.iter() {
        for (mn, mx) in shard.iter() {
            if mx[1] - mn[1] < LOCOMOTION_STATIC_MIN_BLOCKER_HEIGHT_M {
                continue;
            }
            if stair_runtime_overlay::suppress_static_blocker(*mn, *mx) {
                continue;
            }
            if query.disjoint_aabb(*mn, *mx) {
                continue;
            }
            if mx[0] < COLLISION_SOLID_FOOTPRINT_MIN_X - 160.0
                || mn[0] > COLLISION_SOLID_FOOTPRINT_MAX_X + 160.0
                || mx[2] < COLLISION_SOLID_FOOTPRINT_MIN_Z - 160.0
                || mn[2] > COLLISION_SOLID_FOOTPRINT_MAX_Z + 160.0
            {
                continue;
            }
            push_unique(out, (*mn, *mx));
        }
    }
    stair_runtime_overlay::append_runtime_replacement_blockers(
        query.x0,
        query.x1,
        query.z0,
        query.z1,
        feet_y,
        body_h,
        out,
    );
}

fn gather_apartment_door_blockers(
    ctx: &ReducerContext,
    feet_y: f32,
    height: f32,
    query: &BlockerQuery,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    for row in ctx.db.apartment_door().iter() {
        let Some((mn, mx)) = apartment_door_movement_blocking_aabb(&row) else {
            continue;
        };
        if query.disjoint_aabb(mn, mx) {
            continue;
        }
        if mx[1] <= feet_y + 1e-4 || mn[1] >= feet_y + height - 1e-4 {
            continue;
        }
        push_unique(out, (mn, mx));
    }
}

fn gather_elevator_blockers(
    ctx: &ReducerContext,
    query: &BlockerQuery,
    feet_y: f32,
    height: f32,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    let elev_query = ElevatorBlockerQuery {
        x0: query.x0,
        x1: query.x1,
        z0: query.z0,
        z1: query.z1,
    };
    gather_elevator_locomotion_blockers(ctx, &elev_query, feet_y, height, out);
}

fn unit_keys_for_npc(ctx: &ReducerContext, npc: &WorldNpc) -> Vec<String> {
    if npc.session_key.starts_with("combat_sim:") {
        return Vec::new();
    }
    let mut keys = vec![npc.session_key.clone()];
    for unit in ctx.db.apartment_unit().iter() {
        if npc.x >= unit.bound_min_x
            && npc.x <= unit.bound_max_x
            && npc.z >= unit.bound_min_z
            && npc.z <= unit.bound_max_z
        {
            if !keys.iter().any(|k| k == &unit.unit_key) {
                keys.push(unit.unit_key.clone());
            }
        }
    }
    keys
}

fn gather_partition_blockers(
    ctx: &ReducerContext,
    npc: &WorldNpc,
    query: &BlockerQuery,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    let unit_keys = unit_keys_for_npc(ctx, npc);
    if unit_keys.is_empty() {
        return;
    }
    for row in ctx.db.apartment_partition_blocker().iter() {
        if !unit_keys.iter().any(|k| k == &row.unit_key) {
            continue;
        }
        let mn = [row.min_x, row.min_y, row.min_z];
        let mx = [row.max_x, row.max_y, row.max_z];
        if query.disjoint_aabb(mn, mx) {
            continue;
        }
        push_unique(out, (mn, mx));
    }
}

fn combat_sim_unit_for_npc<'a>(
    ctx: &'a ReducerContext,
    npc: &WorldNpc,
) -> Option<ApartmentUnit> {
    let unit_key = npc.session_key.strip_prefix("combat_sim:")?;
    ctx.db
        .apartment_unit()
        .iter()
        .find(|u| u.unit_key == unit_key)
}

/// Locomotion blockers aligned with client dynamic chain: static (+ stair overlay) → elevators → doors → partitions.
pub fn gather_npc_locomotion_blockers(
    ctx: &ReducerContext,
    npc: &WorldNpc,
    prev_x: f32,
    prev_z: f32,
    x: f32,
    z: f32,
    radius: f32,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    let query = BlockerQuery::from_capsule_move(prev_x, prev_z, x, z, radius);
    let (_, height) = body_dims_for_archetype(npc.archetype.as_str());

    if npc.session_key.starts_with("combat_sim:") {
        if let Some(unit) = combat_sim_unit_for_npc(ctx, npc) {
            for aabb in combat_sim_arena_collision_aabbs(&unit) {
                if query.disjoint_aabb(aabb.0, aabb.1) {
                    continue;
                }
                push_unique(out, aabb);
            }
        }
        return;
    }

    gather_megablock_static_blockers(&query, npc.y, height, out);
    gather_elevator_blockers(ctx, &query, npc.y, height, out);
    gather_apartment_door_blockers(ctx, npc.y, height, &query, out);
    gather_partition_blockers(ctx, npc, &query, out);
}

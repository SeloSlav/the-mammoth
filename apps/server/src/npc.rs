//! Authoritative world NPCs (combat sim + future floor-placed spawns).

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::combat_stub::{ray_aabb_intersect_enter, RAY_AABB_T_ENTER_EPS};
use crate::pose::player_pose;

pub const NPC_ARCHETYPE_BABUSHKA: &str = "babushka";

pub const NPC_STATE_IDLE: u8 = 0;
pub const NPC_STATE_AGGRO: u8 = 1;
pub const NPC_STATE_DEAD: u8 = 2;

pub const NPC_LOCOMOTION_IDLE: u8 = 0;
pub const NPC_LOCOMOTION_WALK: u8 = 1;
pub const NPC_LOCOMOTION_RUN: u8 = 2;

pub const BABUSHKA_MAX_HEALTH: f32 = 120.0;
pub const BABUSHKA_BODY_RADIUS_M: f32 = 0.28;
pub const BABUSHKA_BODY_HEIGHT_M: f32 = 1.55;
pub const BABUSHKA_AGGRO_RANGE_M: f32 = 6.5;
pub const BABUSHKA_MELEE_RANGE_M: f32 = 1.35;
pub const BABUSHKA_WALK_SPEED_MPS: f32 = 1.45;
pub const BABUSHKA_MELEE_DAMAGE: f32 = 14.0;
pub const BABUSHKA_MELEE_COOLDOWN_MICROS: i64 = 900_000;

const NPC_TICK_INTERVAL_MICROS: i64 = 250_000;

#[spacetimedb::table(public, accessor = world_npc)]
pub struct WorldNpc {
    #[primary_key]
    #[auto_inc]
    pub npc_id: u64,
    pub archetype: String,
    /// Scope tag — e.g. apartment `unit_key` for a combat-sim instance.
    pub session_key: String,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub yaw: f32,
    pub vel_x: f32,
    pub vel_z: f32,
    pub grounded: u8,
    pub health: f32,
    pub max_health: f32,
    pub state: u8,
    pub locomotion: u8,
    pub melee_presentation_seq: u32,
    /// Increments on damage taken (client hit SFX).
    pub hit_presentation_seq: u32,
    pub last_melee_micros: i64,
}

#[spacetimedb::table(
    public,
    accessor = world_npc_schedule,
    scheduled(npc_tick_step)
)]
pub struct WorldNpcSchedule {
    #[primary_key]
    #[auto_inc]
    pub scheduled_id: u64,
    pub scheduled_at: ScheduleAt,
}

pub fn start_world_npc_schedule(ctx: &ReducerContext) {
    if ctx.db.world_npc_schedule().iter().next().is_some() {
        return;
    }
    let interval = TimeDuration::from_micros(NPC_TICK_INTERVAL_MICROS);
    let _ = ctx.db.world_npc_schedule().insert(WorldNpcSchedule {
        scheduled_id: 0,
        scheduled_at: interval.into(),
    });
}

pub fn clear_npcs_for_session(ctx: &ReducerContext, session_key: &str) {
    let doomed: Vec<u64> = ctx
        .db
        .world_npc()
        .iter()
        .filter(|n| n.session_key == session_key)
        .map(|n| n.npc_id)
        .collect();
    for id in doomed {
        ctx.db.world_npc().npc_id().delete(&id);
    }
}

pub fn spawn_babushka(
    ctx: &ReducerContext,
    session_key: String,
    x: f32,
    y: f32,
    z: f32,
    yaw: f32,
) -> u64 {
    let row = WorldNpc {
        npc_id: 0,
        archetype: NPC_ARCHETYPE_BABUSHKA.to_string(),
        session_key,
        x,
        y,
        z,
        yaw,
        vel_x: 0.0,
        vel_z: 0.0,
        grounded: 1,
        health: BABUSHKA_MAX_HEALTH,
        max_health: BABUSHKA_MAX_HEALTH,
        state: NPC_STATE_IDLE,
        locomotion: NPC_LOCOMOTION_IDLE,
        melee_presentation_seq: 0,
        hit_presentation_seq: 0,
        last_melee_micros: 0,
    };
    ctx.db.world_npc().insert(row).npc_id
}

pub fn apply_npc_damage(ctx: &ReducerContext, npc_id: u64, amount: f32) -> bool {
    if amount <= 0.0 {
        return false;
    }
    let Some(mut row) = ctx.db.world_npc().npc_id().find(&npc_id) else {
        return false;
    };
    if row.state == NPC_STATE_DEAD || row.health <= 0.0 {
        return false;
    }
    row.health = (row.health - amount).max(0.0);
    row.hit_presentation_seq = row.hit_presentation_seq.wrapping_add(1);
    if row.health <= 0.0 {
        row.state = NPC_STATE_DEAD;
        row.locomotion = NPC_LOCOMOTION_IDLE;
        row.vel_x = 0.0;
        row.vel_z = 0.0;
        let session_key = row.session_key.clone();
        let npc_id = row.npc_id;
        ctx.db.world_npc().npc_id().update(row);
        ctx.db.world_npc().npc_id().delete(&npc_id);
        if session_key.starts_with("combat_sim:") {
            crate::combat_sim::respawn_babushka_for_session(ctx, &session_key);
        }
        return true;
    }
    if row.state == NPC_STATE_IDLE {
        row.state = NPC_STATE_AGGRO;
    }
    ctx.db.world_npc().npc_id().update(row);
    true
}

pub fn trace_best_npc_hit(
    ctx: &ReducerContext,
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    max_t: f32,
    lateral_inflate: f32,
) -> Option<(u64, f32, f32, f32)> {
    let mut best: Option<(u64, f32, f32, f32)> = None;
    for npc in ctx.db.world_npc().iter() {
        if npc.state == NPC_STATE_DEAD || npc.health <= 0.0 {
            continue;
        }
        let (radius, height) = body_dims_for_archetype(npc.archetype.as_str());
        let pr = radius + lateral_inflate;
        let px = npc.x;
        let pz = npc.z;
        let py = npc.y;
        let mn_x = px - pr;
        let mx_x = px + pr;
        let mn_z = pz - pr;
        let mx_z = pz + pr;
        let mn_y = py;
        let mx_y = py + height;
        if let Some(hit) =
            ray_aabb_intersect_enter(ox, oy, oz, dx, dy, dz, mn_x, mn_y, mn_z, mx_x, mx_y, mx_z)
        {
            if hit.t_hit > max_t + RAY_AABB_T_ENTER_EPS {
                continue;
            }
            let replace = best.is_none() || hit.t_hit + 1e-4 < best.as_ref().unwrap().1;
            if replace {
                best = Some((npc.npc_id, hit.t_hit, py, height));
            }
        }
    }
    best
}

pub fn is_npc_headshot(feet_y: f32, body_h: f32, impact_y: f32) -> bool {
    let head_min = feet_y + body_h - 0.28;
    impact_y >= head_min
}

fn body_dims_for_archetype(archetype: &str) -> (f32, f32) {
    match archetype {
        NPC_ARCHETYPE_BABUSHKA => (BABUSHKA_BODY_RADIUS_M, BABUSHKA_BODY_HEIGHT_M),
        _ => (0.25, 1.6),
    }
}

const MELEE_REACH_M: f32 = 1.7;
const MELEE_HIT_RADIUS_M: f32 = 0.34;
const MELEE_ARC_DOT_MIN: f32 = 0.2;
const MELEE_HIT_MIN_Y_OFFSET_M: f32 = 0.2;
const MELEE_HIT_MAX_Y_OFFSET_M: f32 = 1.45;

pub struct NpcMeleeResolvedHit {
    pub npc_id: u64,
    pub damage: f32,
    pub impact_x: f32,
    pub impact_y: f32,
    pub impact_z: f32,
}

/// Horizontal arc melee vs the nearest living world NPC (mirrors `combat_stub::resolve_melee_hit`).
pub fn resolve_melee_swing_vs_npcs(
    ctx: &ReducerContext,
    attacker_x: f32,
    attacker_y: f32,
    attacker_z: f32,
    attacker_yaw: f32,
    weapon_def_id: &str,
) -> Option<NpcMeleeResolvedHit> {
    let damage = crate::combat_stub::melee_damage_for_def_id(weapon_def_id);
    if damage <= 0.0 {
        return None;
    }

    let forward_x = -attacker_yaw.sin();
    let forward_z = -attacker_yaw.cos();
    let right_x = -forward_z;
    let right_z = forward_x;

    let mut best: Option<(u64, f32, f32)> = None;

    for npc in ctx.db.world_npc().iter() {
        if npc.state == NPC_STATE_DEAD || npc.health <= 0.0 {
            continue;
        }
        let (body_radius, body_height) = body_dims_for_archetype(npc.archetype.as_str());
        let target_y = npc.y;
        let attacker_min_y = attacker_y + MELEE_HIT_MIN_Y_OFFSET_M;
        let attacker_max_y = attacker_y + MELEE_HIT_MAX_Y_OFFSET_M;
        let target_max_y = target_y + body_height;
        if attacker_max_y < target_y || attacker_min_y > target_max_y {
            continue;
        }

        let dx = npc.x - attacker_x;
        let dz = npc.z - attacker_z;
        let dist = (dx * dx + dz * dz).sqrt();
        if dist > MELEE_REACH_M + body_radius + MELEE_HIT_RADIUS_M {
            continue;
        }
        let forward = dx * forward_x + dz * forward_z;
        if forward < 0.0 || forward > MELEE_REACH_M + body_radius {
            continue;
        }
        let dot = if dist > 1e-5 { forward / dist } else { 1.0 };
        if dot < MELEE_ARC_DOT_MIN {
            continue;
        }
        let lateral = (dx * right_x + dz * right_z).abs();
        if lateral > body_radius + MELEE_HIT_RADIUS_M {
            continue;
        }

        let replace = best.is_none()
            || lateral < best.as_ref().unwrap().1 - 1e-4
            || ((lateral - best.as_ref().unwrap().1).abs() <= 1e-4
                && forward < best.as_ref().unwrap().2);
        if replace {
            best = Some((npc.npc_id, lateral, forward));
        }
    }

    let (npc_id, _, forward) = best?;
    let impact_y = attacker_y + 1.0;
    Some(NpcMeleeResolvedHit {
        npc_id,
        damage,
        impact_x: attacker_x + forward_x * forward * 0.92,
        impact_y,
        impact_z: attacker_z + forward_z * forward * 0.92,
    })
}

#[spacetimedb::reducer]
pub fn npc_tick_step(ctx: &ReducerContext, _arg: WorldNpcSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    let dt = NPC_TICK_INTERVAL_MICROS as f32 / 1_000_000.0;
    let now_us = ctx.timestamp.to_micros_since_unix_epoch();

    let npcs: Vec<WorldNpc> = ctx.db.world_npc().iter().collect();
    for mut npc in npcs {
        if npc.state == NPC_STATE_DEAD {
            continue;
        }

        let (target_x, target_z, target_y, target_identity) =
            ai_target_for_npc(ctx, &npc);
        let planar_dx = target_x - npc.x;
        let planar_dz = target_z - npc.z;
        let dist_sq = planar_dx * planar_dx + planar_dz * planar_dz;
        let dist = dist_sq.sqrt();

        if npc.state == NPC_STATE_IDLE {
            if dist_sq <= BABUSHKA_AGGRO_RANGE_M * BABUSHKA_AGGRO_RANGE_M {
                npc.state = NPC_STATE_AGGRO;
            }
        }

        if npc.state == NPC_STATE_AGGRO {
            if dist_sq > (BABUSHKA_AGGRO_RANGE_M * 2.4).powi(2) {
                npc.state = NPC_STATE_IDLE;
                npc.locomotion = NPC_LOCOMOTION_IDLE;
                npc.vel_x = 0.0;
                npc.vel_z = 0.0;
            } else if dist > BABUSHKA_MELEE_RANGE_M {
                let inv = 1.0 / dist.max(1e-4);
                let vx = planar_dx * inv * BABUSHKA_WALK_SPEED_MPS;
                let vz = planar_dz * inv * BABUSHKA_WALK_SPEED_MPS;
                npc.vel_x = vx;
                npc.vel_z = vz;
                npc.x += vx * dt;
                npc.z += vz * dt;
                npc.y = target_y;
                npc.yaw = planar_dx.atan2(planar_dz);
                let speed_sq = vx * vx + vz * vz;
                npc.locomotion = if speed_sq > 0.04 {
                    NPC_LOCOMOTION_WALK
                } else {
                    NPC_LOCOMOTION_IDLE
                };
            } else {
                npc.vel_x = 0.0;
                npc.vel_z = 0.0;
                npc.locomotion = NPC_LOCOMOTION_IDLE;
                npc.yaw = planar_dx.atan2(planar_dz);
                if now_us - npc.last_melee_micros >= BABUSHKA_MELEE_COOLDOWN_MICROS {
                    if let Some(pid) = target_identity {
                        npc.last_melee_micros = now_us;
                        npc.melee_presentation_seq = npc.melee_presentation_seq.wrapping_add(1);
                        crate::player_vitals::apply_damage(ctx, pid, BABUSHKA_MELEE_DAMAGE);
                    }
                }
            }
        } else {
            npc.locomotion = NPC_LOCOMOTION_IDLE;
            npc.vel_x = 0.0;
            npc.vel_z = 0.0;
        }

        ctx.db.world_npc().npc_id().update(npc);
    }
}

fn ai_target_for_npc(
    ctx: &ReducerContext,
    npc: &WorldNpc,
) -> (f32, f32, f32, Option<Identity>) {
    if npc.session_key.starts_with("combat_sim:") {
        if let Some(owner) =
            crate::combat_sim::session_owner_for_session_key(ctx, &npc.session_key)
        {
            if !crate::player_vitals::is_player_dead(ctx, owner) {
                if let Some(pose) = ctx.db.player_pose().identity().find(&owner) {
                    return (pose.x, pose.y, pose.z, Some(owner));
                }
            }
        }
        return (npc.x, npc.y, npc.z, None);
    }
    let (x, y, z) = nearest_living_player_feet(ctx, npc.x, npc.y, npc.z);
    let id = nearest_living_player_identity(ctx, npc.x, npc.y, npc.z);
    (x, y, z, id)
}

fn nearest_living_player_feet(
    ctx: &ReducerContext,
    nx: f32,
    ny: f32,
    nz: f32,
) -> (f32, f32, f32) {
    let mut best: Option<(f32, f32, f32, f32)> = None;
    for pose in ctx.db.player_pose().iter() {
        if crate::player_vitals::is_player_dead(ctx, pose.identity) {
            continue;
        }
        let dx = pose.x - nx;
        let dy = pose.y - ny;
        let dz = pose.z - nz;
        let d2 = dx * dx + dy * dy + dz * dz;
        if best.map(|b| d2 < b.3).unwrap_or(true) {
            best = Some((pose.x, pose.y, pose.z, d2));
        }
    }
    best.map(|b| (b.0, b.1, b.2)).unwrap_or((nx, ny, nz))
}

fn nearest_living_player_identity(
    ctx: &ReducerContext,
    nx: f32,
    ny: f32,
    nz: f32,
) -> Option<Identity> {
    let mut best: Option<(Identity, f32)> = None;
    for pose in ctx.db.player_pose().iter() {
        if crate::player_vitals::is_player_dead(ctx, pose.identity) {
            continue;
        }
        let dx = pose.x - nx;
        let dy = pose.y - ny;
        let dz = pose.z - nz;
        let d2 = dx * dx + dy * dy + dz * dz;
        if best.map(|b| d2 < b.1).unwrap_or(true) {
            best = Some((pose.identity, d2));
        }
    }
    best.map(|b| b.0)
}

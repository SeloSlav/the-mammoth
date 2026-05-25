//! Authoritative world NPCs (combat sim + future floor-placed spawns).

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::apartments::apartment_unit;
use crate::combat_stub::{
    body_height_from_crouch_bit, body_hit_torso_height_m, eye_y_above_feet, head_hit_box_aabb,
    melee_headshot_from_aim_ray, ray_aabb_intersect_enter, vertical_overlap,
    victim_hit_trace_max_y, HEADSHOT_DAMAGE_MULTIPLIER, MELEE_ARC_DOT_MIN,
    MELEE_HIT_MAX_Y_OFFSET_M, MELEE_HIT_MIN_Y_OFFSET_M, MELEE_HIT_RADIUS_M, MELEE_REACH_M,
    PLAYER_BODY_RADIUS_M, RAY_AABB_T_ENTER_EPS,
};
use crate::movement::player_input;
use crate::movement::BIT_CROUCH;
use crate::pose::player_pose;

pub const NPC_ARCHETYPE_BABUSHKA: &str = "babushka";

pub const NPC_STATE_IDLE: u8 = 0;
pub const NPC_STATE_AGGRO: u8 = 1;
pub const NPC_STATE_DEAD: u8 = 2;

pub const NPC_LOCOMOTION_IDLE: u8 = 0;
pub const NPC_LOCOMOTION_WALK: u8 = 1;
pub const NPC_LOCOMOTION_RUN: u8 = 2;

pub const BABUSHKA_MAX_HEALTH: f32 = 120.0;
/// Keep aligned with `packages/game/src/collision/bodyCapsules.ts`.
pub const BABUSHKA_BODY_RADIUS_M: f32 = 0.28;
/// Keep aligned with `packages/game/src/collision/bodyCapsules.ts`.
pub const BABUSHKA_BODY_HEIGHT_M: f32 = 1.55;
pub const BABUSHKA_AGGRO_RANGE_M: f32 = 6.5;
pub const BABUSHKA_MELEE_RANGE_M: f32 = 1.35;
pub const BABUSHKA_WALK_SPEED_MPS: f32 = 1.45;
/// Fast enough to punish backpedaling/walking, but below melee range per 250ms tick.
pub const BABUSHKA_RUN_SPEED_MPS: f32 = 5.2;
pub const BABUSHKA_MELEE_DAMAGE: f32 = 14.0;
pub const BABUSHKA_MELEE_COOLDOWN_MICROS: i64 = 900_000;

const NPC_TICK_INTERVAL_MICROS: i64 = 250_000;
/// Forgiving head raycast — square head box is smaller than the visible mesh bun.
const NPC_HEAD_TRACE_INFLATE_M: f32 = 0.06;
/// Planar radius within which babushkas steer away from each other (boid separation).
const BABUSHKA_PEER_SEPARATION_RADIUS_M: f32 = 1.55;
const BABUSHKA_PEER_SEPARATION_STRENGTH: f32 = 3.4;
const BABUSHKA_PEER_OVERLAP_RESOLVE_PASSES: usize = 2;
/// Keep aligned with `packages/game/src/collision/bodyCapsules.ts` `CAPSULE_PAIR_SURFACE_GAP_M`.
const CAPSULE_PAIR_SURFACE_GAP_M: f32 = 0.10;
const BABUSHKA_PLAYER_SEPARATION_RADIUS_M: f32 = 1.55;
const BABUSHKA_PLAYER_SEPARATION_STRENGTH: f32 = 3.4;
const BABUSHKA_PLAYER_OVERLAP_RESOLVE_PASSES: usize = 2;

#[derive(Clone)]
struct PlayerBodySnap {
    x: f32,
    y: f32,
    z: f32,
    body_height: f32,
}

#[derive(Clone)]
struct BabushkaPeerSnap {
    npc_id: u64,
    session_key: String,
    archetype: String,
    state: u8,
    health: f32,
    x: f32,
    z: f32,
}

fn babushka_peer_snap(row: &WorldNpc) -> BabushkaPeerSnap {
    BabushkaPeerSnap {
        npc_id: row.npc_id,
        session_key: row.session_key.clone(),
        archetype: row.archetype.clone(),
        state: row.state,
        health: row.health,
        x: row.x,
        z: row.z,
    }
}

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
    /// When set, AI chases this player identity (combat-sim owner).
    #[default(None::<Identity>)]
    pub chase_identity: Option<Identity>,
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
    chase_identity: Option<Identity>,
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
        chase_identity,
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
        row.last_melee_micros = ctx.timestamp.to_micros_since_unix_epoch();
        ctx.db.world_npc().npc_id().update(row);
        return true;
    }
    row.state = NPC_STATE_AGGRO;
    row.last_melee_micros = ctx.timestamp.to_micros_since_unix_epoch();
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
) -> Option<(u64, f32, f32, f32, f32, f32)> {
    let mut best: Option<(u64, f32, f32, f32, f32, f32)> = None;
    for npc in ctx.db.world_npc().iter() {
        if npc.state == NPC_STATE_DEAD || npc.health <= 0.0 {
            continue;
        }
        let (radius, height) = body_dims_for_archetype(npc.archetype.as_str());
        let pr = radius + lateral_inflate;
        let px = npc.x;
        let pz = npc.z;
        let py = npc.y;

        let mut best_t: Option<f32> = None;

        let (hmn_x, hmn_y, hmn_z, hmx_x, hmx_y, hmx_z) = head_hit_box_aabb(px, py, pz, height);
        let inf = NPC_HEAD_TRACE_INFLATE_M;
        if let Some(hit) = ray_aabb_intersect_enter(
            ox,
            oy,
            oz,
            dx,
            dy,
            dz,
            hmn_x - inf,
            hmn_y - inf,
            hmn_z - inf,
            hmx_x + inf,
            hmx_y + inf,
            hmx_z + inf,
        ) {
            if hit.t_hit <= max_t + RAY_AABB_T_ENTER_EPS {
                best_t = Some(hit.t_hit);
            }
        }

        let torso_top = py + body_hit_torso_height_m(height);
        if let Some(hit) = ray_aabb_intersect_enter(
            ox,
            oy,
            oz,
            dx,
            dy,
            dz,
            px - pr,
            py,
            pz - pr,
            px + pr,
            torso_top,
            pz + pr,
        ) {
            if hit.t_hit <= max_t + RAY_AABB_T_ENTER_EPS {
                let replace = best_t.is_none() || hit.t_hit + 1e-4 < best_t.unwrap();
                if replace {
                    best_t = Some(hit.t_hit);
                }
            }
        }

        let full_top = victim_hit_trace_max_y(py, height);
        if let Some(hit) = ray_aabb_intersect_enter(
            ox,
            oy,
            oz,
            dx,
            dy,
            dz,
            px - pr,
            py,
            pz - pr,
            px + pr,
            full_top,
            pz + pr,
        ) {
            if hit.t_hit <= max_t + RAY_AABB_T_ENTER_EPS {
                let replace = best_t.is_none() || hit.t_hit + 1e-4 < best_t.unwrap();
                if replace {
                    best_t = Some(hit.t_hit);
                }
            }
        }

        if let Some(t_hit) = best_t {
            let replace = best.is_none() || t_hit + 1e-4 < best.as_ref().unwrap().1;
            if replace {
                best = Some((npc.npc_id, t_hit, px, py, pz, height));
            }
        }
    }
    best
}

fn body_dims_for_archetype(archetype: &str) -> (f32, f32) {
    match archetype {
        NPC_ARCHETYPE_BABUSHKA => (BABUSHKA_BODY_RADIUS_M, BABUSHKA_BODY_HEIGHT_M),
        _ => (0.25, 1.6),
    }
}

pub struct NpcMeleeResolvedHit {
    pub npc_id: u64,
    pub damage: f32,
    pub impact_x: f32,
    pub impact_y: f32,
    pub impact_z: f32,
    pub headshot: bool,
}

/// Horizontal arc melee vs the nearest living world NPC (mirrors `combat_stub::resolve_melee_hit`).
pub fn resolve_melee_swing_vs_npcs(
    ctx: &ReducerContext,
    attacker_x: f32,
    attacker_y: f32,
    attacker_z: f32,
    attacker_yaw: f32,
    weapon_def_id: &str,
    aim_dir_world: Option<(f32, f32, f32)>,
) -> Option<NpcMeleeResolvedHit> {
    let mut damage = crate::combat_stub::melee_damage_for_def_id(weapon_def_id);
    if damage <= 0.0 {
        return None;
    }

    let forward_x = -attacker_yaw.sin();
    let forward_z = -attacker_yaw.cos();
    let right_x = -forward_z;
    let right_z = forward_x;

    let mut best: Option<(u64, f32, f32, f32, f32)> = None;

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
            best = Some((npc.npc_id, lateral, forward, target_y, body_height));
        }
    }

    let (npc_id, _, forward, target_y, body_height) = best?;
    let mut impact_x = attacker_x + forward_x * forward * 0.92;
    let mut impact_y = attacker_y + 1.0;
    let mut impact_z = attacker_z + forward_z * forward * 0.92;
    let mut headshot = false;

    if let Some((adx, ady, adz)) = aim_dir_world {
        let abits = ctx
            .db
            .player_input()
            .identity()
            .find(&ctx.sender())
            .map(|row| row.bits)
            .unwrap_or(0);
        let eye_y = attacker_y + eye_y_above_feet(abits & BIT_CROUCH != 0);
        if let Some(npc) = ctx.db.world_npc().npc_id().find(&npc_id) {
            let (body_radius, _) = body_dims_for_archetype(npc.archetype.as_str());
            let hs = melee_headshot_from_aim_ray(
                attacker_x,
                eye_y,
                attacker_z,
                (adx, ady, adz),
                npc.x,
                target_y,
                npc.z,
                body_radius,
                body_height,
                MELEE_REACH_M,
                (impact_x, impact_y, impact_z),
            );
            if hs.headshot {
                damage *= HEADSHOT_DAMAGE_MULTIPLIER;
                headshot = true;
            }
            impact_x = hs.impact_x;
            impact_y = hs.impact_y;
            impact_z = hs.impact_z;
        }
    }

    Some(NpcMeleeResolvedHit {
        npc_id,
        damage,
        impact_x,
        impact_y,
        impact_z,
        headshot,
    })
}

/// Fixed dt for the 250 ms schedule tick.
pub fn npc_scheduled_tick_dt_sec() -> f32 {
    NPC_TICK_INTERVAL_MICROS as f32 / 1_000_000.0
}

/// Minimum planar center distance between two babushka body capsules (+ small gap).
pub fn babushka_min_peer_center_distance_m() -> f32 {
    BABUSHKA_BODY_RADIUS_M * 2.0 + CAPSULE_PAIR_SURFACE_GAP_M
}

/// Minimum planar center distance between babushka and player capsules (+ small gap).
pub fn babushka_min_player_center_distance_m() -> f32 {
    BABUSHKA_BODY_RADIUS_M + PLAYER_BODY_RADIUS_M + CAPSULE_PAIR_SURFACE_GAP_M
}

fn living_player_body_snapshot(ctx: &ReducerContext) -> Vec<PlayerBodySnap> {
    let mut out = Vec::new();
    for pose in ctx.db.player_pose().iter() {
        if crate::player_vitals::is_player_dead(ctx, pose.identity) {
            continue;
        }
        let body_height = ctx
            .db
            .player_input()
            .identity()
            .find(&pose.identity)
            .map(|row| body_height_from_crouch_bit(row.bits))
            .unwrap_or(crate::combat_stub::PLAYER_BODY_HEIGHT_STAND_M);
        out.push(PlayerBodySnap {
            x: pose.x,
            y: pose.y,
            z: pose.z,
            body_height,
        });
    }
    out
}

/// Authoritative babushka AI step — shared by the schedule and combat-sim locomotion hook.
pub fn step_all_world_npcs(ctx: &ReducerContext, dt_sec: f32) {
    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let mut npcs: Vec<WorldNpc> = ctx.db.world_npc().iter().collect();
    let peer_snapshot: Vec<BabushkaPeerSnap> = npcs.iter().map(babushka_peer_snap).collect();
    let player_snapshot = living_player_body_snapshot(ctx);
    for npc in npcs.iter_mut() {
        if npc.state == NPC_STATE_DEAD {
            continue;
        }
        step_one_world_npc(
            ctx,
            npc,
            dt_sec,
            now_us,
            &peer_snapshot,
            &player_snapshot,
        );
    }
    babushka_resolve_peer_overlaps(&mut npcs);
    babushka_resolve_player_overlaps(&mut npcs, &player_snapshot);
    for npc in npcs.iter_mut() {
        if npc.state != NPC_STATE_DEAD && npc.session_key.starts_with("combat_sim:") {
            clamp_babushka_to_combat_arena(ctx, npc);
        }
    }
    for npc in npcs {
        let despawned = npc.state == NPC_STATE_DEAD
            && npc.session_key.starts_with("combat_sim:")
            && crate::combat_sim::maybe_despawn_corpse_and_respawn(ctx, &npc, now_us);
        if !despawned {
            ctx.db.world_npc().npc_id().update(npc);
        }
    }
}

#[spacetimedb::reducer]
pub fn npc_tick_step(ctx: &ReducerContext, _arg: WorldNpcSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    step_all_world_npcs(ctx, npc_scheduled_tick_dt_sec());
}

fn babushka_is_living_peer_snap(a: &WorldNpc, b: &BabushkaPeerSnap) -> bool {
    a.npc_id != b.npc_id
        && a.session_key == b.session_key
        && a.archetype == NPC_ARCHETYPE_BABUSHKA
        && b.archetype == NPC_ARCHETYPE_BABUSHKA
        && b.state != NPC_STATE_DEAD
        && b.health > 0.0
}

fn babushka_is_living_peer_pair(a: &WorldNpc, b: &WorldNpc) -> bool {
    a.npc_id != b.npc_id
        && a.session_key == b.session_key
        && a.archetype == NPC_ARCHETYPE_BABUSHKA
        && b.archetype == NPC_ARCHETYPE_BABUSHKA
        && b.state != NPC_STATE_DEAD
        && b.health > 0.0
}

fn babushka_peer_separation_steering(npc: &WorldNpc, peers: &[BabushkaPeerSnap]) -> (f32, f32) {
    if npc.state == NPC_STATE_DEAD || npc.health <= 0.0 {
        return (0.0, 0.0);
    }
    let mut sep_x = 0.0;
    let mut sep_z = 0.0;
    let radius = BABUSHKA_PEER_SEPARATION_RADIUS_M;
    for peer in peers {
        if !babushka_is_living_peer_snap(npc, peer) {
            continue;
        }
        let dx = npc.x - peer.x;
        let dz = npc.z - peer.z;
        let dist_sq = dx * dx + dz * dz;
        if dist_sq < 1e-8 {
            let angle = (npc.npc_id.wrapping_mul(0x9e37_79b9) as f32) * 0.001;
            sep_x += angle.cos();
            sep_z += angle.sin();
            continue;
        }
        let dist = dist_sq.sqrt();
        if dist >= radius {
            continue;
        }
        let push = (radius - dist) / radius;
        sep_x += (dx / dist) * push;
        sep_z += (dz / dist) * push;
    }
    (
        sep_x * BABUSHKA_PEER_SEPARATION_STRENGTH,
        sep_z * BABUSHKA_PEER_SEPARATION_STRENGTH,
    )
}

fn babushka_cap_planar_speed(vx: f32, vz: f32, max_speed: f32) -> (f32, f32) {
    let speed_sq = vx * vx + vz * vz;
    let max_sq = max_speed * max_speed;
    if speed_sq <= max_sq || speed_sq <= 1e-8 {
        return (vx, vz);
    }
    let scale = max_speed / speed_sq.sqrt();
    (vx * scale, vz * scale)
}

fn babushka_apply_planar_motion(
    npc: &mut WorldNpc,
    vx: f32,
    vz: f32,
    dt_sec: f32,
    locomotion_run: bool,
) {
    npc.vel_x = vx;
    npc.vel_z = vz;
    npc.x += vx * dt_sec;
    npc.z += vz * dt_sec;
    let speed_sq = vx * vx + vz * vz;
    npc.locomotion = if speed_sq > 0.04 {
        if locomotion_run {
            NPC_LOCOMOTION_RUN
        } else {
            NPC_LOCOMOTION_WALK
        }
    } else {
        NPC_LOCOMOTION_IDLE
    };
}

fn babushka_resolve_peer_overlaps(npcs: &mut [WorldNpc]) {
    let min_dist = babushka_min_peer_center_distance_m();
    let min_dist_sq = min_dist * min_dist;
    for _ in 0..BABUSHKA_PEER_OVERLAP_RESOLVE_PASSES {
        for i in 0..npcs.len() {
            if npcs[i].state == NPC_STATE_DEAD || npcs[i].health <= 0.0 {
                continue;
            }
            for j in (i + 1)..npcs.len() {
                if !babushka_is_living_peer_pair(&npcs[i], &npcs[j]) {
                    continue;
                }
                let dx = npcs[i].x - npcs[j].x;
                let dz = npcs[i].z - npcs[j].z;
                let dist_sq = dx * dx + dz * dz;
                if dist_sq >= min_dist_sq {
                    continue;
                }
                let (ux, uz, dist) = if dist_sq < 1e-8 {
                    let angle = ((npcs[i].npc_id ^ npcs[j].npc_id).wrapping_mul(0x517c_c1b7)
                        as f32)
                        * 0.001;
                    (angle.cos(), angle.sin(), 1e-4_f32)
                } else {
                    let dist = dist_sq.sqrt();
                    (dx / dist, dz / dist, dist)
                };
                let half = (min_dist - dist) * 0.5;
                npcs[i].x += ux * half;
                npcs[i].z += uz * half;
                npcs[j].x -= ux * half;
                npcs[j].z -= uz * half;
            }
        }
    }
}

fn babushka_player_separation_steering(npc: &WorldNpc, players: &[PlayerBodySnap]) -> (f32, f32) {
    if npc.state == NPC_STATE_DEAD || npc.health <= 0.0 {
        return (0.0, 0.0);
    }
    let mut sep_x = 0.0;
    let mut sep_z = 0.0;
    let radius = BABUSHKA_PLAYER_SEPARATION_RADIUS_M;
    for player in players {
        if !vertical_overlap(npc.y, BABUSHKA_BODY_HEIGHT_M, player.y, player.body_height) {
            continue;
        }
        let dx = npc.x - player.x;
        let dz = npc.z - player.z;
        let dist_sq = dx * dx + dz * dz;
        if dist_sq < 1e-8 {
            let angle = (npc.npc_id.wrapping_mul(0x6c07_9624) as f32) * 0.001;
            sep_x += angle.cos();
            sep_z += angle.sin();
            continue;
        }
        let dist = dist_sq.sqrt();
        if dist >= radius {
            continue;
        }
        let push = (radius - dist) / radius;
        sep_x += (dx / dist) * push;
        sep_z += (dz / dist) * push;
    }
    (
        sep_x * BABUSHKA_PLAYER_SEPARATION_STRENGTH,
        sep_z * BABUSHKA_PLAYER_SEPARATION_STRENGTH,
    )
}

fn babushka_resolve_player_overlaps(npcs: &mut [WorldNpc], players: &[PlayerBodySnap]) {
    if players.is_empty() {
        return;
    }
    let min_dist = babushka_min_player_center_distance_m();
    let min_dist_sq = min_dist * min_dist;
    for _ in 0..BABUSHKA_PLAYER_OVERLAP_RESOLVE_PASSES {
        for npc in npcs.iter_mut() {
            if npc.state == NPC_STATE_DEAD || npc.health <= 0.0 {
                continue;
            }
            for player in players {
                if !vertical_overlap(npc.y, BABUSHKA_BODY_HEIGHT_M, player.y, player.body_height) {
                    continue;
                }
                let dx = npc.x - player.x;
                let dz = npc.z - player.z;
                let dist_sq = dx * dx + dz * dz;
                if dist_sq >= min_dist_sq {
                    continue;
                }
                let (ux, uz, dist) = if dist_sq < 1e-8 {
                    let angle = (npc.npc_id.wrapping_mul(0x85eb_ca6b) as f32) * 0.001;
                    (angle.cos(), angle.sin(), 1e-4_f32)
                } else {
                    let dist = dist_sq.sqrt();
                    (dx / dist, dz / dist, dist)
                };
                let push = min_dist - dist;
                npc.x += ux * push;
                npc.z += uz * push;
            }
        }
    }
}

fn step_one_world_npc(
    ctx: &ReducerContext,
    npc: &mut WorldNpc,
    dt_sec: f32,
    now_us: i64,
    peers: &[BabushkaPeerSnap],
    players: &[PlayerBodySnap],
) {
    let combat_sim = npc.session_key.starts_with("combat_sim:");
    let Some((target_x, target_z, target_y, target_identity)) = ai_target_for_npc(ctx, npc) else {
        npc.locomotion = NPC_LOCOMOTION_IDLE;
        npc.vel_x = 0.0;
        npc.vel_z = 0.0;
        return;
    };

    let planar_dx = target_x - npc.x;
    let planar_dz = target_z - npc.z;
    let dist_sq = planar_dx * planar_dx + planar_dz * planar_dz;
    let dist = dist_sq.sqrt();

    let aggro_range_m = if combat_sim {
        crate::combat_sim::COMBAT_SIM_BABUSHKA_AGGRO_RANGE_M
    } else {
        BABUSHKA_AGGRO_RANGE_M
    };

    if npc.state == NPC_STATE_IDLE {
        if dist_sq <= aggro_range_m * aggro_range_m {
            npc.state = NPC_STATE_AGGRO;
        }
    }

    if npc.state == NPC_STATE_AGGRO {
        // TODO: Add a proper long-distance leash once combat arenas have authored escape bounds.
        // Until then, combat state is sticky so Babushka cannot visibly calm down mid-fight.
        if dist > BABUSHKA_MELEE_RANGE_M {
            let run_speed = BABUSHKA_RUN_SPEED_MPS;
            let inv = 1.0 / dist.max(1e-4);
            let (peer_sep_x, peer_sep_z) = babushka_peer_separation_steering(npc, peers);
            let (player_sep_x, player_sep_z) = babushka_player_separation_steering(npc, players);
            let (vx, vz) = babushka_cap_planar_speed(
                planar_dx * inv * run_speed + peer_sep_x + player_sep_x,
                planar_dz * inv * run_speed + peer_sep_z + player_sep_z,
                run_speed,
            );
            babushka_apply_planar_motion(npc, vx, vz, dt_sec, true);
            if combat_sim {
                npc.y = target_y;
            }
            npc.yaw = planar_dx.atan2(planar_dz);
        } else {
            let (peer_sep_x, peer_sep_z) = babushka_peer_separation_steering(npc, peers);
            let (player_sep_x, player_sep_z) = babushka_player_separation_steering(npc, players);
            let sep_x = peer_sep_x + player_sep_x;
            let sep_z = peer_sep_z + player_sep_z;
            let sep_mag_sq = sep_x * sep_x + sep_z * sep_z;
            if sep_mag_sq > 1e-6 {
                let sep_mag = sep_mag_sq.sqrt();
                let spread_speed = BABUSHKA_WALK_SPEED_MPS;
                let vx = (sep_x / sep_mag) * spread_speed.min(sep_mag);
                let vz = (sep_z / sep_mag) * spread_speed.min(sep_mag);
                babushka_apply_planar_motion(npc, vx, vz, dt_sec, false);
            } else {
                npc.vel_x = 0.0;
                npc.vel_z = 0.0;
                npc.locomotion = NPC_LOCOMOTION_IDLE;
            }
            npc.yaw = planar_dx.atan2(planar_dz);
            if now_us - npc.last_melee_micros >= BABUSHKA_MELEE_COOLDOWN_MICROS
                && babushka_melee_vertical_overlap_with_player(
                    ctx,
                    npc.y,
                    target_identity,
                    target_y,
                )
            {
                npc.last_melee_micros = now_us;
                npc.melee_presentation_seq = npc.melee_presentation_seq.wrapping_add(1);
                crate::player_vitals::apply_damage(ctx, target_identity, BABUSHKA_MELEE_DAMAGE);
            }
        }
    } else {
        let (dir_x, dir_z, wandering) = babushka_idle_wander_heading(npc.npc_id, now_us);
        if wandering {
            let old_x = npc.x;
            let old_z = npc.z;
            let (peer_sep_x, peer_sep_z) = babushka_peer_separation_steering(npc, peers);
            let (player_sep_x, player_sep_z) = babushka_player_separation_steering(npc, players);
            let (vx, vz) = babushka_cap_planar_speed(
                dir_x * BABUSHKA_WALK_SPEED_MPS + peer_sep_x + player_sep_x,
                dir_z * BABUSHKA_WALK_SPEED_MPS + peer_sep_z + player_sep_z,
                BABUSHKA_WALK_SPEED_MPS,
            );
            babushka_apply_planar_motion(npc, vx, vz, dt_sec, false);
            npc.yaw = dir_x.atan2(dir_z);
            let moved_x = npc.x - old_x;
            let moved_z = npc.z - old_z;
            if moved_x * moved_x + moved_z * moved_z < 0.01 * 0.01 {
                npc.locomotion = NPC_LOCOMOTION_IDLE;
                npc.vel_x = 0.0;
                npc.vel_z = 0.0;
            }
        } else {
            npc.locomotion = NPC_LOCOMOTION_IDLE;
            npc.vel_x = 0.0;
            npc.vel_z = 0.0;
        }
    }
}

fn babushka_idle_wander_heading(npc_id: u64, now_us: i64) -> (f32, f32, bool) {
    const WANDER_BUCKET_MICROS: i64 = 4_500_000;
    let bucket = now_us.div_euclid(WANDER_BUCKET_MICROS) as u64;
    let seed = npc_id
        .wrapping_mul(0x517c_c1b7_2722_0e95)
        .wrapping_add(bucket);
    let roll = (seed & 0xff) as u32;
    // Roam sometimes, but spend most non-aggro time idling/air-squatting.
    if roll >= 90 {
        return (0.0, 1.0, false);
    }
    let angle_seed = (seed >> 8) & 0xffff;
    let angle = angle_seed as f32 / 65535.0 * std::f32::consts::TAU;
    (angle.sin(), angle.cos(), true)
}

fn clamp_babushka_to_combat_arena(ctx: &ReducerContext, npc: &mut WorldNpc) {
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
    let (x, z) = crate::combat_sim::clamp_babushka_xz_in_combat_arena(&unit, npc.x, npc.z);
    npc.x = x;
    npc.z = z;
}

/// True when babushka's body capsule overlaps the target player's capsule (same rules as PvP melee).
fn babushka_melee_vertical_overlap_with_player(
    ctx: &ReducerContext,
    npc_y: f32,
    target_identity: Identity,
    target_y: f32,
) -> bool {
    let player_h = ctx
        .db
        .player_input()
        .identity()
        .find(&target_identity)
        .map(|row| body_height_from_crouch_bit(row.bits))
        .unwrap_or(crate::combat_stub::PLAYER_BODY_HEIGHT_STAND_M);
    vertical_overlap(npc_y, BABUSHKA_BODY_HEIGHT_M, target_y, player_h)
}

fn ai_target_for_npc(ctx: &ReducerContext, npc: &WorldNpc) -> Option<(f32, f32, f32, Identity)> {
    if let Some(id) = npc.chase_identity {
        if !crate::player_vitals::is_player_dead(ctx, id) {
            if let Some(pose) = ctx.db.player_pose().identity().find(&id) {
                return Some((pose.x, pose.z, pose.y, id));
            }
        }
        if npc.session_key.starts_with("combat_sim:") {
            return None;
        }
    }
    let id = nearest_living_player_identity(ctx, npc.x, npc.y, npc.z)?;
    let pose = ctx.db.player_pose().identity().find(&id)?;
    Some((pose.x, pose.z, pose.y, id))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat_stub::PLAYER_BODY_HEIGHT_STAND_M;

    #[test]
    fn babushka_firearm_headshot_uses_square_head_box() {
        use crate::combat_stub::{head_hit_box_aabb, is_headshot_impact_world};
        let feet_x = 4.0;
        let feet_y = 60.0;
        let feet_z = -2.0;
        let h = BABUSHKA_BODY_HEIGHT_M;
        let (mn_x, mn_y, mn_z, mx_x, mx_y, mx_z) = head_hit_box_aabb(feet_x, feet_y, feet_z, h);
        let cx = (mn_x + mx_x) * 0.5;
        let cy = (mn_y + mx_y) * 0.5;
        let cz = (mn_z + mx_z) * 0.5;
        assert!(is_headshot_impact_world(
            feet_x, feet_y, feet_z, h, cx, cy, cz
        ));
        assert!(!is_headshot_impact_world(
            feet_x,
            feet_y,
            feet_z,
            h,
            mx_x + 0.05,
            cy,
            cz
        ));
        assert!(!is_headshot_impact_world(
            feet_x,
            feet_y,
            feet_z,
            h,
            cx,
            mn_y - 0.05,
            cz
        ));
    }

    fn test_babushka_row(npc_id: u64, session_key: &str, x: f32, z: f32) -> WorldNpc {
        WorldNpc {
            npc_id,
            archetype: NPC_ARCHETYPE_BABUSHKA.to_string(),
            session_key: session_key.to_string(),
            x,
            y: 0.0,
            z,
            yaw: 0.0,
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
            chase_identity: None,
        }
    }

    #[test]
    fn babushka_peer_overlap_resolve_pushes_stacked_npcs_apart() {
        let session = "combat_sim:test";
        let mut npcs = vec![
            test_babushka_row(1, session, 0.0, 0.0),
            test_babushka_row(2, session, 0.05, 0.0),
        ];
        babushka_resolve_peer_overlaps(&mut npcs);
        let dx = npcs[0].x - npcs[1].x;
        let dz = npcs[0].z - npcs[1].z;
        let dist = (dx * dx + dz * dz).sqrt();
        assert!(
            dist + 1e-4 >= babushka_min_peer_center_distance_m(),
            "resolved dist {dist}"
        );
    }

    #[test]
    fn babushka_peer_separation_steers_away_from_nearby_peer() {
        let session = "combat_sim:test";
        let self_npc = test_babushka_row(1, session, 0.0, 0.0);
        let peer = BabushkaPeerSnap {
            npc_id: 2,
            session_key: session.to_string(),
            archetype: NPC_ARCHETYPE_BABUSHKA.to_string(),
            state: NPC_STATE_IDLE,
            health: BABUSHKA_MAX_HEALTH,
            x: 0.35,
            z: 0.0,
        };
        let peers = [peer];
        let (sep_x, sep_z) = babushka_peer_separation_steering(&self_npc, &peers);
        assert!(sep_x < 0.0, "expected left push, got ({sep_x}, {sep_z})");
        assert!(sep_z.abs() < 0.2);
    }

    #[test]
    fn babushka_player_overlap_resolve_pushes_npc_away_from_player() {
        let mut npc = test_babushka_row(1, "combat_sim:test", 0.0, 0.0);
        let players = [PlayerBodySnap {
            x: 0.05,
            y: 0.0,
            z: 0.0,
            body_height: PLAYER_BODY_HEIGHT_STAND_M,
        }];
        babushka_resolve_player_overlaps(std::slice::from_mut(&mut npc), &players);
        let dx = npc.x - players[0].x;
        let dz = npc.z - players[0].z;
        let dist = (dx * dx + dz * dz).sqrt();
        assert!(
            dist + 1e-4 >= babushka_min_player_center_distance_m(),
            "resolved dist {dist}"
        );
    }

    #[test]
    fn babushka_melee_requires_vertical_capsule_overlap() {
        let npc_y = 60.0;
        let player_y_same_floor = 60.0;
        assert!(vertical_overlap(
            npc_y,
            BABUSHKA_BODY_HEIGHT_M,
            player_y_same_floor,
            PLAYER_BODY_HEIGHT_STAND_M,
        ));

        // One full storey above (~3.16 m) — no overlap even when XZ aligns.
        let player_y_upper_floor = npc_y + 3.2;
        assert!(!vertical_overlap(
            npc_y,
            BABUSHKA_BODY_HEIGHT_M,
            player_y_upper_floor,
            PLAYER_BODY_HEIGHT_STAND_M,
        ));
    }
}

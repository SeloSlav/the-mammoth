//! Authoritative world NPCs (combat sim + future floor-placed spawns).

use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::apartments::apartment_unit;
use crate::combat_stub::{
    body_height_from_crouch_bit, eye_y_above_feet, melee_headshot_from_aim_ray,
    ray_aabb_intersect_enter, vertical_overlap, HEADSHOT_DAMAGE_MULTIPLIER, MELEE_ARC_DOT_MIN,
    MELEE_HIT_MAX_Y_OFFSET_M, MELEE_HIT_MIN_Y_OFFSET_M, MELEE_HIT_RADIUS_M, MELEE_REACH_M,
    RAY_AABB_T_ENTER_EPS,
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
pub const BABUSHKA_BODY_RADIUS_M: f32 = 0.28;
pub const BABUSHKA_BODY_HEIGHT_M: f32 = 1.55;
pub const BABUSHKA_AGGRO_RANGE_M: f32 = 6.5;
pub const BABUSHKA_MELEE_RANGE_M: f32 = 1.35;
pub const BABUSHKA_WALK_SPEED_MPS: f32 = 1.45;
pub const BABUSHKA_RUN_SPEED_MPS: f32 = 3.0;
pub const BABUSHKA_MELEE_DAMAGE: f32 = 14.0;
pub const BABUSHKA_MELEE_COOLDOWN_MICROS: i64 = 900_000;

const NPC_TICK_INTERVAL_MICROS: i64 = 250_000;
const BABUSHKA_DAMAGE_CHASE_MICROS: i64 = 12_000_000;

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
        let eye_y =
            attacker_y + eye_y_above_feet(abits & BIT_CROUCH != 0);
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

/// Authoritative babushka AI step — shared by the schedule and combat-sim locomotion hook.
pub fn step_all_world_npcs(ctx: &ReducerContext, dt_sec: f32) {
    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let npcs: Vec<WorldNpc> = ctx.db.world_npc().iter().collect();
    for npc in npcs {
        if npc.state == NPC_STATE_DEAD {
            if npc.session_key.starts_with("combat_sim:") {
                crate::combat_sim::maybe_despawn_corpse_and_respawn(ctx, &npc, now_us);
            }
            continue;
        }
        let mut npc = npc;
        step_one_world_npc(ctx, &mut npc, dt_sec, now_us);
        ctx.db.world_npc().npc_id().update(npc);
    }
}

#[spacetimedb::reducer]
pub fn npc_tick_step(ctx: &ReducerContext, _arg: WorldNpcSchedule) {
    if ctx.sender() != ctx.identity() {
        return;
    }
    step_all_world_npcs(ctx, npc_scheduled_tick_dt_sec());
}

fn step_one_world_npc(ctx: &ReducerContext, npc: &mut WorldNpc, dt_sec: f32, now_us: i64) {
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
        let damage_chase_active = npc.last_melee_micros > 0
            && now_us - npc.last_melee_micros < BABUSHKA_DAMAGE_CHASE_MICROS;
        let leash_range_m = if damage_chase_active {
            aggro_range_m.max(18.0)
        } else {
            aggro_range_m * 2.4
        };
        if dist_sq > leash_range_m.powi(2) {
            npc.state = NPC_STATE_IDLE;
            npc.locomotion = NPC_LOCOMOTION_IDLE;
            npc.vel_x = 0.0;
            npc.vel_z = 0.0;
        } else if dist > BABUSHKA_MELEE_RANGE_M {
            let run_speed = BABUSHKA_RUN_SPEED_MPS;
            let inv = 1.0 / dist.max(1e-4);
            let vx = planar_dx * inv * run_speed;
            let vz = planar_dz * inv * run_speed;
            npc.vel_x = vx;
            npc.vel_z = vz;
            npc.x += vx * dt_sec;
            npc.z += vz * dt_sec;
            if combat_sim {
                npc.y = target_y;
                clamp_babushka_to_combat_arena(ctx, npc);
            }
            npc.yaw = planar_dx.atan2(planar_dz);
            let speed_sq = vx * vx + vz * vz;
            npc.locomotion = if speed_sq > 0.04 {
                NPC_LOCOMOTION_RUN
            } else {
                NPC_LOCOMOTION_IDLE
            };
        } else {
            npc.vel_x = 0.0;
            npc.vel_z = 0.0;
            npc.locomotion = NPC_LOCOMOTION_IDLE;
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
            let vx = dir_x * BABUSHKA_WALK_SPEED_MPS;
            let vz = dir_z * BABUSHKA_WALK_SPEED_MPS;
            npc.vel_x = vx;
            npc.vel_z = vz;
            npc.x += vx * dt_sec;
            npc.z += vz * dt_sec;
            npc.yaw = dir_x.atan2(dir_z);
            npc.locomotion = NPC_LOCOMOTION_WALK;
            if combat_sim {
                clamp_babushka_to_combat_arena(ctx, npc);
            }
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
    let inset = 0.55;
    npc.x = npc
        .x
        .clamp(unit.bound_min_x + inset, unit.bound_max_x - inset);
    npc.z = npc
        .z
        .clamp(unit.bound_min_z + inset, unit.bound_max_z - inset);
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
    fn babushka_firearm_headshot_uses_shared_head_zone() {
        use crate::combat_stub::is_headshot_impact_world_y;
        let feet = 60.0;
        let h = BABUSHKA_BODY_HEIGHT_M;
        let head_base = feet + h - crate::combat_stub::PLAYER_HEAD_ZONE_HEIGHT_M;
        assert!(is_headshot_impact_world_y(feet, h, head_base + 0.05));
        assert!(is_headshot_impact_world_y(feet, h, feet + h - 0.01));
        assert!(!is_headshot_impact_world_y(feet, h, head_base - 0.05));
        assert!(!is_headshot_impact_world_y(feet, h, feet + h * 0.5));
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

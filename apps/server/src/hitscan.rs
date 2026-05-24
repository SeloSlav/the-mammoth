//! Authoritative LOS hit-scan for firearms: rays vs baked static collision AABBs, apartment-door
//! firearm barriers (widened slabs — see `apartment_door::apartment_door_firearm_barrier_aabb`),
//! and player boxes.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use spacetimedb::{Identity, ReducerContext, Table};

use crate::apartment_door::apartment_door;
use crate::combat_stub::{
    body_height_from_crouch_bit, eye_y_above_feet, is_headshot_impact_world_y,
    ray_aabb_intersect_enter, HEADSHOT_DAMAGE_MULTIPLIER, PLAYER_BODY_RADIUS_M,
};
use crate::generated_collision_solids::{
    COLLISION_SOLID_AABB_SHARDS, COLLISION_SOLID_FOOTPRINT_MAX_X, COLLISION_SOLID_FOOTPRINT_MAX_Z,
    COLLISION_SOLID_FOOTPRINT_MIN_X, COLLISION_SOLID_FOOTPRINT_MIN_Z,
};
use crate::movement::player_input;
use crate::movement::BIT_CROUCH;
use crate::player_vitals;
use crate::pose::player_pose;
use crate::pose::PlayerPose;
pub const RANGE_PISTOL_M: f32 = 48.0;
pub const RANGE_SHOTGUN_M: f32 = 22.0;

const FALL_MIN_FRAC_PISTOL: f32 = 0.38;
const FALL_MIN_FRAC_SHOTGUN: f32 = 0.35;

pub const SHOTGUN_PELLET_COUNT: u32 = 8;
pub const SHOTGUN_SPREAD_RAD: f32 = 0.055;

const RAY_T_EPS: f32 = 4e-4;
const PLANAR_AIM_DOT_MIN: f32 = 0.18;
const RAY_EPS2: f32 = 1e-18;

#[derive(Clone, Debug)]
pub struct NpcDamageEvent {
    pub npc_id: u64,
    pub damage: f32,
    pub ix: f32,
    pub iy: f32,
    pub iz: f32,
}

#[derive(Clone, Debug)]
pub struct PlayerDamageEvent {
    pub identity: Identity,
    pub damage: f32,
    pub ix: f32,
    pub iy: f32,
    pub iz: f32,
}

/// Normalize `(dx,dy,dz)` and reject gross aim cheats vs the authoritative planar yaw plane.
pub fn sanitize_client_aim_dir(
    aim_yaw_rad: f32,
    dx: f32,
    dy: f32,
    dz: f32,
) -> Option<(f32, f32, f32)> {
    let len_sq = dx * dx + dy * dy + dz * dz;
    if !(len_sq > RAY_EPS2) || !len_sq.is_finite() {
        return None;
    }
    let ilen = 1.0 / len_sq.sqrt();
    let nx = dx * ilen;
    let ny = dy * ilen;
    let nz = dz * ilen;

    let xz_sq = nx * nx + nz * nz;
    if xz_sq > 4e-4 {
        let inv = xz_sq.sqrt().recip();
        let hx = nx * inv;
        let hz = nz * inv;
        let fwd_x = -aim_yaw_rad.sin();
        let fwd_z = -aim_yaw_rad.cos();
        let planar_dot = fwd_x * hx + fwd_z * hz;
        if planar_dot < PLANAR_AIM_DOT_MIN {
            return None;
        }
    }

    Some((nx, ny, nz))
}

struct CollQueryLimits {
    gx0: f32,
    gx1: f32,
    gz0: f32,
    gz1: f32,
}

impl CollQueryLimits {
    fn from_ray(ox: f32, oz: f32, dx: f32, dz: f32, max_t: f32) -> Self {
        Self {
            gx0: ox.min(ox + dx * max_t) - 3.5,
            gx1: ox.max(ox + dx * max_t) + 3.5,
            gz0: oz.min(oz + dz * max_t) - 3.5,
            gz1: oz.max(oz + dz * max_t) + 3.5,
        }
    }

    #[inline]
    fn intersects_shard_aabb(&self, mn: [f32; 3], mx: [f32; 3]) -> bool {
        if self.gx1 < mn[0] || self.gx0 > mx[0] || self.gz1 < mn[2] || self.gz0 > mx[2] {
            return false;
        }
        if mx[0] < COLLISION_SOLID_FOOTPRINT_MIN_X - 160.0
            || mn[0] > COLLISION_SOLID_FOOTPRINT_MAX_X + 160.0
            || mx[2] < COLLISION_SOLID_FOOTPRINT_MIN_Z - 160.0
            || mn[2] > COLLISION_SOLID_FOOTPRINT_MAX_Z + 160.0
        {
            return false;
        }
        true
    }
}

fn trace_static_solids(origin: [f32; 3], dir: [f32; 3], max_t: f32) -> Option<f32> {
    let ox = origin[0];
    let oy = origin[1];
    let oz = origin[2];
    let dx = dir[0];
    let dy = dir[1];
    let dz = dir[2];
    let lim = CollQueryLimits::from_ray(ox, oz, dx, dz, max_t);
    let mut best: Option<f32> = None;

    for shard in COLLISION_SOLID_AABB_SHARDS.iter() {
        for (mn, mx) in shard.iter() {
            if mx[1] - mn[1] < 0.04 {
                continue;
            }
            if !lim.intersects_shard_aabb(*mn, *mx) {
                continue;
            }
            if let Some(hit) = ray_aabb_intersect_enter(
                ox, oy, oz, dx, dy, dz, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2],
            ) {
                if hit.t_hit <= max_t + RAY_T_EPS
                    && hit.t_hit < best.unwrap_or(f32::INFINITY) - 1e-5
                {
                    best = Some(hit.t_hit);
                }
            }
        }
    }
    best
}

fn trace_apartment_door_firearms(
    ctx: &ReducerContext,
    origin: [f32; 3],
    dir: [f32; 3],
    max_t: f32,
) -> Option<f32> {
    let ox = origin[0];
    let oy = origin[1];
    let oz = origin[2];
    let dx = dir[0];
    let dy = dir[1];
    let dz = dir[2];
    let lim = CollQueryLimits::from_ray(ox, oz, dx, dz, max_t);
    let mut best: Option<f32> = None;

    for row in ctx.db.apartment_door().iter() {
        let Some((mn, mx)) = crate::apartment_door::apartment_door_firearm_barrier_aabb(&row)
        else {
            continue;
        };
        if !lim.intersects_shard_aabb(mn, mx) {
            continue;
        }
        if let Some(hit) = ray_aabb_intersect_enter(
            ox, oy, oz, dx, dy, dz, mn[0], mn[1], mn[2], mx[0], mx[1], mx[2],
        ) {
            if hit.t_hit <= max_t + RAY_T_EPS && hit.t_hit < best.unwrap_or(f32::INFINITY) - 1e-5 {
                best = Some(hit.t_hit);
            }
        }
    }
    best
}

#[inline]
fn merge_ray_wall_hits(a: Option<f32>, b: Option<f32>) -> Option<f32> {
    match (a, b) {
        (None, None) => None,
        (Some(t), None) | (None, Some(t)) => Some(t),
        (Some(ta), Some(tb)) => Some(ta.min(tb)),
    }
}

fn trace_world_solids_for_firearms(
    ctx: &ReducerContext,
    attacker: Identity,
    origin: [f32; 3],
    dir: [f32; 3],
    max_t: f32,
) -> Option<f32> {
    if crate::combat_sim::shooter_in_combat_sim_open_arena(ctx, attacker) {
        return None;
    }
    merge_ray_wall_hits(
        trace_static_solids(origin, dir, max_t),
        trace_apartment_door_firearms(ctx, origin, dir, max_t),
    )
}

fn trace_best_player_hit(
    ctx: &ReducerContext,
    attacker: Identity,
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    max_t: f32,
    lateral_inflate: f32,
) -> Option<(Identity, f32, f32, f32)> {
    let mut best: Option<(Identity, f32, f32, f32)> = None;
    for pose in ctx.db.player_pose().iter() {
        if pose.identity == attacker || player_vitals::is_player_dead(ctx, pose.identity) {
            continue;
        }

        let bits = ctx
            .db
            .player_input()
            .identity()
            .find(&pose.identity)
            .map(|i| i.bits)
            .unwrap_or(0);
        let bh = body_height_from_crouch_bit(bits);
        let pr = PLAYER_BODY_RADIUS_M + lateral_inflate;
        let px = pose.x;
        let pz = pose.z;
        let py = pose.y;

        let mn_x = px - pr;
        let mx_x = px + pr;
        let mn_z = pz - pr;
        let mx_z = pz + pr;
        let mn_y = py;
        let mx_y = py + bh;
        if let Some(hit) =
            ray_aabb_intersect_enter(ox, oy, oz, dx, dy, dz, mn_x, mn_y, mn_z, mx_x, mx_y, mx_z)
        {
            if hit.t_hit > max_t + RAY_T_EPS {
                continue;
            }
            let replace = best.is_none() || hit.t_hit + 1e-4 < best.as_ref().unwrap().1;
            if replace {
                best = Some((pose.identity, hit.t_hit, py, bh));
            }
        }
    }
    best
}

#[inline]
fn falloff_factor(dist_m: f32, range_m: f32, floor_frac: f32) -> f32 {
    let t = (dist_m / range_m.max(1e-3)).clamp(0.0, 1.0);
    1.0 - t * (1.0 - floor_frac)
}

fn pellet_impact_px(
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    t: f32,
) -> (f32, f32, f32) {
    (ox + dx * t, oy + dy * t, oz + dz * t)
}

fn resolve_pistol_ray(
    ctx: &ReducerContext,
    attacker: Identity,
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    max_range_m: f32,
    floor_frac: f32,
    base_damage: f32,
) -> Vec<PlayerDamageEvent> {
    let origin = [ox, oy, oz];
    let dir = [dx, dy, dz];
    let t_wall = trace_world_solids_for_firearms(ctx, attacker, origin, dir, max_range_m);
    let phit = trace_best_player_hit(ctx, attacker, ox, oy, oz, dx, dy, dz, max_range_m, 0.0);

    let Some((pid, t_hit, feet_y, body_h)) = phit else {
        return Vec::new();
    };
    if let Some(t_w) = t_wall {
        if t_w + 1e-3 < t_hit {
            return Vec::new();
        }
    }
    let dist_m = t_hit;
    let scale = falloff_factor(dist_m, max_range_m, floor_frac);
    let (ix, iy, iz) = pellet_impact_px(ox, oy, oz, dx, dy, dz, dist_m);
    let hs_mult = if is_headshot_impact_world_y(feet_y, body_h, iy) {
        HEADSHOT_DAMAGE_MULTIPLIER
    } else {
        1.0
    };
    let dmg = base_damage * scale * hs_mult;
    Vec::from([PlayerDamageEvent {
        identity: pid,
        damage: dmg,
        ix,
        iy,
        iz,
    }])
}

fn resolve_shotgun_pellets(
    ctx: &ReducerContext,
    attacker: Identity,
    origin: [f32; 3],
    base_dir: [f32; 3],
    max_range_m: f32,
    floor_frac: f32,
    base_damage_total: f32,
) -> Vec<PlayerDamageEvent> {
    let per = base_damage_total / SHOTGUN_PELLET_COUNT as f32;
    let ox = origin[0];
    let oy = origin[1];
    let oz = origin[2];
    let bx = base_dir[0];
    let by = base_dir[1];
    let bz = base_dir[2];

    let mut damage_by_player: HashMap<Identity, f32> = HashMap::new();
    let mut impact_by_player: HashMap<Identity, (f32, f32, f32)> = HashMap::new();

    let (jr, jp) = orthonormal_screen_axes(bx, by, bz);

    for pellet_idx in 0..SHOTGUN_PELLET_COUNT {
        let seed = shotgun_seed(attacker, pellet_idx);
        let jx = bx + jr[0] * seed.spread_rx + jp[0] * seed.spread_ry;
        let jy = by + jr[1] * seed.spread_rx + jp[1] * seed.spread_ry;
        let jz = bz + jr[2] * seed.spread_rx + jp[2] * seed.spread_ry;

        let (jx, jy, jz) = normalize_or_fallback(jx, jy, jz);

        let t_wall =
            trace_world_solids_for_firearms(ctx, attacker, origin, [jx, jy, jz], max_range_m);
        let phit = trace_best_player_hit(ctx, attacker, ox, oy, oz, jx, jy, jz, max_range_m, 0.04);

        let dmg_this = match (phit.as_ref(), t_wall) {
            (Some((pid, pr_t, feet_y, body_h)), Some(t_w)) => {
                if t_w + 1e-3 < *pr_t {
                    None
                } else {
                    let scale = falloff_factor(*pr_t, max_range_m, floor_frac);
                    let ipt = pellet_impact_px(ox, oy, oz, jx, jy, jz, *pr_t);
                    let hs_mult = if is_headshot_impact_world_y(*feet_y, *body_h, ipt.1) {
                        HEADSHOT_DAMAGE_MULTIPLIER
                    } else {
                        1.0
                    };
                    Some((*pid, per * scale * hs_mult, ipt))
                }
            }
            (Some((pid, pr_t, feet_y, body_h)), None) => {
                let scale = falloff_factor(*pr_t, max_range_m, floor_frac);
                let ipt = pellet_impact_px(ox, oy, oz, jx, jy, jz, *pr_t);
                let hs_mult = if is_headshot_impact_world_y(*feet_y, *body_h, ipt.1) {
                    HEADSHOT_DAMAGE_MULTIPLIER
                } else {
                    1.0
                };
                Some((*pid, per * scale * hs_mult, ipt))
            }
            _ => None,
        };

        if let Some((pid, dmg, ipt)) = dmg_this {
            *damage_by_player.entry(pid).or_insert(0.0) += dmg;
            impact_by_player.entry(pid).or_insert(ipt);
        }
    }

    let mut out: Vec<PlayerDamageEvent> = damage_by_player
        .into_iter()
        .map(|(identity, damage)| {
            let (ix, iy, iz) = impact_by_player.remove(&identity).unwrap_or((
                ox + bx * max_range_m * 0.35,
                oy,
                oz + bz * max_range_m * 0.35,
            ));
            PlayerDamageEvent {
                identity,
                damage,
                ix,
                iy,
                iz,
            }
        })
        .collect();

    out.sort_by(|a, b| {
        a.identity
            .partial_cmp(&b.identity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    out
}

struct SpreadSeed {
    spread_rx: f32,
    spread_ry: f32,
}

fn shotgun_seed(attacker: Identity, pellet_idx: u32) -> SpreadSeed {
    let mut base = folding_identity(attacker);
    base ^= (pellet_idx as u64).rotate_left(11);

    let s1 = xorshift64(base ^ 0xA0761D6478BD642Fu64);
    let s2 = xorshift64(s1 ^ 0x705199C370000Fu64);
    let u1 = ((s1 >> 33) & 0xFFFF_FFFF) as f32 / 4294967295.0;
    let u2 = ((s2 >> 33) & 0xFFFF_FFFF) as f32 / 4294967295.0;

    SpreadSeed {
        spread_rx: (u1 * 2.0 - 1.0) * SHOTGUN_SPREAD_RAD,
        spread_ry: (u2 * 2.0 - 1.0) * SHOTGUN_SPREAD_RAD,
    }
}

fn folding_identity(id: Identity) -> u64 {
    let mut h = DefaultHasher::new();
    id.hash(&mut h);
    h.finish()
}

fn xorshift64(mut x: u64) -> u64 {
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x.max(1)
}

/// Returns two orthonormal perpendicular vectors spanning the screen-relative pellet plane (right, up').
fn orthonormal_screen_axes(dx: f32, dy: f32, dz: f32) -> ([f32; 3], [f32; 3]) {
    let ft = normalize_or_fallback(dx, dy, dz);
    let f = [ft.0, ft.1, ft.2];
    let up = [0.0_f32, 1.0, 0.0];
    let mut r = cross3(up, f);
    let r_len = magnitude3(r[0], r[1], r[2]);
    if r_len < 1e-5 {
        let alt = [1.0_f32, 0.0, 0.0];
        r = cross3(alt, f);
    }
    r = normalize3_arr(r);
    let mut p = cross3(f, r);
    p = normalize3_arr(p);
    (r, p)
}

#[inline]
fn cross3(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

#[inline]
fn magnitude3(x: f32, y: f32, z: f32) -> f32 {
    (x * x + y * y + z * z).sqrt()
}

#[inline]
fn normalize3_arr(v: [f32; 3]) -> [f32; 3] {
    let t = normalize_or_fallback(v[0], v[1], v[2]);
    [t.0, t.1, t.2]
}

fn normalize_or_fallback(mut x: f32, mut y: f32, mut z: f32) -> (f32, f32, f32) {
    let len = magnitude3(x, y, z);
    let len_fixed = len.max(1e-16);
    if !(len > 1e-28) || !len.is_finite() {
        (0.0, 1.0, 0.0)
    } else {
        x /= len_fixed;
        y /= len_fixed;
        z /= len_fixed;
        (x, y, z)
    }
}

pub fn firearm_hitscan_weapon(
    ctx: &ReducerContext,
    attacker: Identity,
    shooter_pose: &PlayerPose,
    weapon_def_id: &str,
    aim_dir_x: f32,
    aim_dir_y: f32,
    aim_dir_z: f32,
) -> Vec<PlayerDamageEvent> {
    let yaw = ctx
        .db
        .player_input()
        .identity()
        .find(&attacker)
        .map(|r| r.aim_yaw)
        .unwrap_or(shooter_pose.yaw);

    let Some((dx, dy, dz)) = sanitize_client_aim_dir(yaw, aim_dir_x, aim_dir_y, aim_dir_z) else {
        return Vec::new();
    };

    let bits = ctx
        .db
        .player_input()
        .identity()
        .find(&attacker)
        .map(|r| r.bits)
        .unwrap_or(0);
    let feet_y = shooter_pose.y;
    let oy = feet_y + eye_y_above_feet(bits & BIT_CROUCH != 0);
    let ox = shooter_pose.x;
    let oz = shooter_pose.z;
    let origin = [ox, oy, oz];

    match weapon_def_id {
        "pistol" => resolve_pistol_ray(
            ctx,
            attacker,
            ox,
            oy,
            oz,
            dx,
            dy,
            dz,
            RANGE_PISTOL_M,
            FALL_MIN_FRAC_PISTOL,
            20.0,
        ),
        "shotgun-coach" => resolve_shotgun_pellets(
            ctx,
            attacker,
            origin,
            [dx, dy, dz],
            RANGE_SHOTGUN_M,
            FALL_MIN_FRAC_SHOTGUN,
            11.0,
        ),
        _ => Vec::new(),
    }
}

fn resolve_pistol_ray_npcs(
    ctx: &ReducerContext,
    attacker: Identity,
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    max_range_m: f32,
    floor_frac: f32,
    base_damage: f32,
) -> Vec<NpcDamageEvent> {
    let t_wall =
        trace_world_solids_for_firearms(ctx, attacker, [ox, oy, oz], [dx, dy, dz], max_range_m);
    let nhit = crate::npc::trace_best_npc_hit(ctx, ox, oy, oz, dx, dy, dz, max_range_m, 0.0);
    let Some((nid, t_hit, feet_y, body_h)) = nhit else {
        return Vec::new();
    };
    if let Some(t_w) = t_wall {
        if t_w + 1e-3 < t_hit {
            return Vec::new();
        }
    }
    let scale = falloff_factor(t_hit, max_range_m, floor_frac);
    let (ix, iy, iz) = pellet_impact_px(ox, oy, oz, dx, dy, dz, t_hit);
    let hs_mult = if crate::npc::is_npc_headshot(feet_y, body_h, iy) {
        HEADSHOT_DAMAGE_MULTIPLIER
    } else {
        1.0
    };
    Vec::from([NpcDamageEvent {
        npc_id: nid,
        damage: base_damage * scale * hs_mult,
        ix,
        iy,
        iz,
    }])
}

fn resolve_shotgun_pellets_npcs(
    ctx: &ReducerContext,
    attacker: Identity,
    origin: [f32; 3],
    base_dir: [f32; 3],
    max_range_m: f32,
    floor_frac: f32,
    base_damage_total: f32,
) -> Vec<NpcDamageEvent> {
    let per = base_damage_total / SHOTGUN_PELLET_COUNT as f32;
    let ox = origin[0];
    let oy = origin[1];
    let oz = origin[2];
    let bx = base_dir[0];
    let by = base_dir[1];
    let bz = base_dir[2];

    let mut damage_by_npc: HashMap<u64, f32> = HashMap::new();
    let mut impact_by_npc: HashMap<u64, (f32, f32, f32)> = HashMap::new();

    let (jr, jp) = orthonormal_screen_axes(bx, by, bz);

    for pellet_idx in 0..SHOTGUN_PELLET_COUNT {
        let seed = shotgun_seed(attacker, pellet_idx);
        let jx = bx + jr[0] * seed.spread_rx + jp[0] * seed.spread_ry;
        let jy = by + jr[1] * seed.spread_rx + jp[1] * seed.spread_ry;
        let jz = bz + jr[2] * seed.spread_rx + jp[2] * seed.spread_ry;
        let (jx, jy, jz) = normalize_or_fallback(jx, jy, jz);

        let t_wall =
            trace_world_solids_for_firearms(ctx, attacker, origin, [jx, jy, jz], max_range_m);
        let nhit = crate::npc::trace_best_npc_hit(ctx, ox, oy, oz, jx, jy, jz, max_range_m, 0.04);

        let dmg_this = match (nhit.as_ref(), t_wall) {
            (Some((nid, n_t, feet_y, body_h)), Some(t_w)) => {
                if t_w + 1e-3 < *n_t {
                    None
                } else {
                    let scale = falloff_factor(*n_t, max_range_m, floor_frac);
                    let ipt = pellet_impact_px(ox, oy, oz, jx, jy, jz, *n_t);
                    let hs_mult = if crate::npc::is_npc_headshot(*feet_y, *body_h, ipt.1) {
                        HEADSHOT_DAMAGE_MULTIPLIER
                    } else {
                        1.0
                    };
                    Some((*nid, per * scale * hs_mult, ipt))
                }
            }
            (Some((nid, n_t, feet_y, body_h)), None) => {
                let scale = falloff_factor(*n_t, max_range_m, floor_frac);
                let ipt = pellet_impact_px(ox, oy, oz, jx, jy, jz, *n_t);
                let hs_mult = if crate::npc::is_npc_headshot(*feet_y, *body_h, ipt.1) {
                    HEADSHOT_DAMAGE_MULTIPLIER
                } else {
                    1.0
                };
                Some((*nid, per * scale * hs_mult, ipt))
            }
            _ => None,
        };

        if let Some((nid, dmg, ipt)) = dmg_this {
            *damage_by_npc.entry(nid).or_insert(0.0) += dmg;
            impact_by_npc.insert(nid, ipt);
        }
    }

    damage_by_npc
        .into_iter()
        .map(|(npc_id, damage)| {
            let (ix, iy, iz) = impact_by_npc.remove(&npc_id).unwrap_or((
                ox + bx * max_range_m * 0.35,
                oy,
                oz + bz * max_range_m * 0.35,
            ));
            NpcDamageEvent {
                npc_id,
                damage,
                ix,
                iy,
                iz,
            }
        })
        .collect()
}

pub fn firearm_hitscan_npcs(
    ctx: &ReducerContext,
    shooter_pose: &PlayerPose,
    weapon_def_id: &str,
    aim_dir_x: f32,
    aim_dir_y: f32,
    aim_dir_z: f32,
) -> Vec<NpcDamageEvent> {
    let attacker = shooter_pose.identity;
    let yaw = ctx
        .db
        .player_input()
        .identity()
        .find(&attacker)
        .map(|r| r.aim_yaw)
        .unwrap_or(shooter_pose.yaw);

    let Some((dx, dy, dz)) = sanitize_client_aim_dir(yaw, aim_dir_x, aim_dir_y, aim_dir_z) else {
        return Vec::new();
    };

    let bits = ctx
        .db
        .player_input()
        .identity()
        .find(&attacker)
        .map(|r| r.bits)
        .unwrap_or(0);
    let feet_y = shooter_pose.y;
    let oy = feet_y + eye_y_above_feet(bits & BIT_CROUCH != 0);
    let ox = shooter_pose.x;
    let oz = shooter_pose.z;
    let origin = [ox, oy, oz];

    match weapon_def_id {
        "pistol" => resolve_pistol_ray_npcs(
            ctx,
            shooter_pose.identity,
            ox,
            oy,
            oz,
            dx,
            dy,
            dz,
            RANGE_PISTOL_M,
            FALL_MIN_FRAC_PISTOL,
            20.0,
        ),
        "shotgun-coach" => resolve_shotgun_pellets_npcs(
            ctx,
            attacker,
            origin,
            [dx, dy, dz],
            RANGE_SHOTGUN_M,
            FALL_MIN_FRAC_SHOTGUN,
            11.0,
        ),
        _ => Vec::new(),
    }
}

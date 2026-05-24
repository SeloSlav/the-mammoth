//! Authoritative player-vs-player melee helpers and simple player-body spatial indexing.

use std::collections::HashMap;

use spacetimedb::{Identity, ReducerContext, Table};

use crate::inventory::{find_item_in_hotbar_slot, NUM_PLAYER_HOTBAR_SLOTS};
use crate::items_catalog;
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};
use crate::movement::player_input;
use crate::movement::BIT_CROUCH;
use crate::player_vitals;
use crate::pose::player_pose;

pub const PLAYER_BODY_RADIUS_M: f32 = 0.22;
pub const PLAYER_BODY_HEIGHT_STAND_M: f32 = 1.78;
/// Match `movement::PLAYER_HEIGHT_CROUCH_M` / hitscan victim capsule.
pub const PLAYER_BODY_HEIGHT_CROUCH_M: f32 = 1.2;

/// Authoritative damage multiplier when the hit resolves inside the head volume.
pub const HEADSHOT_DAMAGE_MULTIPLIER: f32 = 2.0;
/// World-space height of the legacy Y-only head band (superseded by [`PLAYER_HEAD_HIT_BOX_M`]).
pub const PLAYER_HEAD_ZONE_HEIGHT_M: f32 = 0.30;
/// Square head hit volume — same extent on X, Y, and Z.
pub const PLAYER_HEAD_HIT_BOX_M: f32 = 0.32;
/// Head box top sits this far above the nominal body crown (before crown inset).
pub const PLAYER_HEAD_HIT_BOX_LIFT_ABOVE_BODY_M: f32 = 0.14;
/// Trim from the lifted crown so the cube sits on the skull, not floating above it.
pub const PLAYER_HEAD_HIT_BOX_CROWN_INSET_M: f32 = 0.04;
/// Vertical gap between torso body volume and head hit box (no overlap).
pub const PLAYER_HEAD_HIT_BODY_GAP_M: f32 = 0.02;
/// Extra ray depth after wide-body entry before head-box entry still counts as headshot
/// (side clips where the body AABB is wider than the head cube).
pub const PLAYER_HEAD_HIT_FIREARM_ENTRY_SLACK_M: f32 = 0.02;

pub const RAY_AABB_T_ENTER_EPS: f32 = 4e-4;

const PLAYER_SPATIAL_CELL_XZ_M: f32 = 1.25;
const PLAYER_SPATIAL_CELL_Y_M: f32 = 2.0;

/// Shared melee reach / arc tuning (also used by NPC melee in `npc.rs`).
pub const MELEE_REACH_M: f32 = 1.7;
pub const MELEE_HIT_RADIUS_M: f32 = 0.34;
pub const MELEE_ARC_DOT_MIN: f32 = 0.2;
pub const MELEE_HIT_MIN_Y_OFFSET_M: f32 = 0.2;
pub const MELEE_HIT_MAX_Y_OFFSET_M: f32 = 1.45;

#[derive(Clone, Copy, Debug)]
pub struct PlayerBodySample {
    pub identity: Identity,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub body_height: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct MeleeResolvedHit {
    pub target: Identity,
    pub damage: f32,
    pub impact_x: f32,
    pub impact_y: f32,
    pub impact_z: f32,
    pub headshot: bool,
}

type CellKey = (i32, i32, i32);

#[derive(Default)]
struct PlayerSpatialHash {
    cells: HashMap<CellKey, Vec<usize>>,
}

impl PlayerSpatialHash {
    fn from_samples(samples: &[PlayerBodySample]) -> Self {
        let mut out = Self::default();
        for (idx, sample) in samples.iter().enumerate() {
            let min = cell_key(
                sample.x - PLAYER_BODY_RADIUS_M,
                sample.y,
                sample.z - PLAYER_BODY_RADIUS_M,
            );
            let max = cell_key(
                sample.x + PLAYER_BODY_RADIUS_M,
                sample.y + sample.body_height,
                sample.z + PLAYER_BODY_RADIUS_M,
            );
            for cx in min.0..=max.0 {
                for cy in min.1..=max.1 {
                    for cz in min.2..=max.2 {
                        out.cells.entry((cx, cy, cz)).or_default().push(idx);
                    }
                }
            }
        }
        out
    }

    fn gather_indices_in_bounds(
        &self,
        min_x: f32,
        min_y: f32,
        min_z: f32,
        max_x: f32,
        max_y: f32,
        max_z: f32,
        out: &mut Vec<usize>,
        seen: &mut [bool],
    ) {
        out.clear();
        let min = cell_key(min_x, min_y, min_z);
        let max = cell_key(max_x, max_y, max_z);
        for cx in min.0..=max.0 {
            for cy in min.1..=max.1 {
                for cz in min.2..=max.2 {
                    let Some(list) = self.cells.get(&(cx, cy, cz)) else {
                        continue;
                    };
                    for &idx in list {
                        if seen[idx] {
                            continue;
                        }
                        seen[idx] = true;
                        out.push(idx);
                    }
                }
            }
        }
        for &idx in out.iter() {
            seen[idx] = false;
        }
    }
}

#[inline]
fn cell_key(x: f32, y: f32, z: f32) -> CellKey {
    (
        (x / PLAYER_SPATIAL_CELL_XZ_M).floor() as i32,
        (y / PLAYER_SPATIAL_CELL_Y_M).floor() as i32,
        (z / PLAYER_SPATIAL_CELL_XZ_M).floor() as i32,
    )
}

#[inline]
pub fn vertical_overlap(a_y: f32, a_h: f32, b_y: f32, b_h: f32) -> bool {
    a_y < b_y + b_h && b_y < a_y + a_h
}

/// Eye height above feet for firearm / melee headshot rays (matches historic `hitscan` tuning).
#[inline]
pub fn eye_y_above_feet(crouch: bool) -> f32 {
    if crouch {
        0.92
    } else {
        1.62
    }
}

#[inline]
pub fn body_height_from_crouch_bit(bits: u8) -> f32 {
    if bits & BIT_CROUCH != 0 {
        PLAYER_BODY_HEIGHT_CROUCH_M
    } else {
        PLAYER_BODY_HEIGHT_STAND_M
    }
}

/// World-space Y of the head hit box top (feet-rooted).
#[inline]
pub fn head_hit_box_top_y(feet_y: f32, body_height_m: f32) -> f32 {
    feet_y + body_height_m + PLAYER_HEAD_HIT_BOX_LIFT_ABOVE_BODY_M
        - PLAYER_HEAD_HIT_BOX_CROWN_INSET_M
}

/// World-space Y of the head hit box center (feet-rooted).
#[inline]
pub fn head_hit_box_center_y(feet_y: f32, body_height_m: f32) -> f32 {
    head_hit_box_top_y(feet_y, body_height_m) - PLAYER_HEAD_HIT_BOX_M * 0.5
}

/// Torso-only body hit height (feet to neck) — excludes head box and gap.
#[inline]
pub fn body_hit_torso_height_m(body_height_m: f32) -> f32 {
    let head_bottom = head_hit_box_center_y(0.0, body_height_m) - PLAYER_HEAD_HIT_BOX_M * 0.5;
    (head_bottom - PLAYER_HEAD_HIT_BODY_GAP_M).max(0.0)
}

/// Ray-trace AABB crown — includes lifted head volume.
#[inline]
pub fn victim_hit_trace_max_y(feet_y: f32, body_height_m: f32) -> f32 {
    head_hit_box_top_y(feet_y, body_height_m)
}

/// Axis-aligned head hit box for a feet-rooted body (square on X/Z/Y).
#[inline]
pub fn head_hit_box_aabb(
    feet_x: f32,
    feet_y: f32,
    feet_z: f32,
    body_height_m: f32,
) -> (f32, f32, f32, f32, f32, f32) {
    let half = PLAYER_HEAD_HIT_BOX_M * 0.5;
    let center_y = head_hit_box_center_y(feet_y, body_height_m);
    (
        feet_x - half,
        center_y - half,
        feet_z - half,
        feet_x + half,
        center_y + half,
        feet_z + half,
    )
}

/// True when world-space impact lies inside the square head hit box.
#[inline]
pub fn is_headshot_impact_world(
    feet_x: f32,
    feet_y: f32,
    feet_z: f32,
    body_height_m: f32,
    impact_x: f32,
    impact_y: f32,
    impact_z: f32,
) -> bool {
    let (mn_x, mn_y, mn_z, mx_x, mx_y, mx_z) =
        head_hit_box_aabb(feet_x, feet_y, feet_z, body_height_m);
    impact_x >= mn_x - 1e-4
        && impact_x <= mx_x + 1e-4
        && impact_y >= mn_y - 1e-4
        && impact_y <= mx_y + 1e-3
        && impact_z >= mn_z - 1e-4
        && impact_z <= mx_z + 1e-4
}

/// True when world-space impact `y` lies in the head zone of a feet-rooted capsule.
#[inline]
pub fn is_headshot_impact_world_y(feet_y: f32, body_height_m: f32, impact_world_y: f32) -> bool {
    let head_base = feet_y + body_height_m - PLAYER_HEAD_ZONE_HEIGHT_M;
    impact_world_y >= head_base - 1e-4 && impact_world_y <= feet_y + body_height_m + 1e-3
}

#[derive(Clone, Copy, Debug)]
pub struct RayAabbHit {
    pub t_hit: f32,
}

#[derive(Clone, Copy, Debug)]
pub struct RayAabbInterval {
    pub t_enter: f32,
    pub t_exit: f32,
}

fn ray_aabb_axis_interval(ox: f32, dir: f32, mn: f32, mx: f32) -> Result<(f32, f32), ()> {
    const AXIS_EPS: f32 = 1e-14;
    if dir.abs() < AXIS_EPS {
        if ox < mn || ox > mx {
            Err(())
        } else {
            Ok((f32::NEG_INFINITY, f32::INFINITY))
        }
    } else {
        let inv = 1.0 / dir;
        let mut t1 = (mn - ox) * inv;
        let mut t2 = (mx - ox) * inv;
        if t1 > t2 {
            std::mem::swap(&mut t1, &mut t2);
        }
        Ok((t1, t2))
    }
}

/// Ray overlap interval with an axis-aligned box (`t_enter` / `t_exit` along unit `(dx,dy,dz)`).
pub fn ray_aabb_intersect_interval(
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    mn_x: f32,
    mn_y: f32,
    mn_z: f32,
    mx_x: f32,
    mx_y: f32,
    mx_z: f32,
) -> Option<RayAabbInterval> {
    let (tx_enter, tx_exit) = ray_aabb_axis_interval(ox, dx, mn_x, mx_x).ok()?;
    let (ty_enter, ty_exit) = ray_aabb_axis_interval(oy, dy, mn_y, mx_y).ok()?;
    let (tz_enter, tz_exit) = ray_aabb_axis_interval(oz, dz, mn_z, mx_z).ok()?;

    let t_enter = tx_enter.max(ty_enter).max(tz_enter);
    let t_exit = tx_exit.min(ty_exit).min(tz_exit);

    if t_enter > t_exit || t_exit < -1e-3 {
        return None;
    }
    Some(RayAabbInterval { t_enter, t_exit })
}

/// First positive ray entry into an axis-aligned box (`t_hit` along `(dx,dy,dz)`), if any.
pub fn ray_aabb_intersect_enter(
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    mn_x: f32,
    mn_y: f32,
    mn_z: f32,
    mx_x: f32,
    mx_y: f32,
    mx_z: f32,
) -> Option<RayAabbHit> {
    let interval = ray_aabb_intersect_interval(
        ox, oy, oz, dx, dy, dz, mn_x, mn_y, mn_z, mx_x, mx_y, mx_z,
    )?;
    let t_hit = if interval.t_enter >= RAY_AABB_T_ENTER_EPS {
        interval.t_enter
    } else if interval.t_exit >= RAY_AABB_T_ENTER_EPS {
        RAY_AABB_T_ENTER_EPS
    } else {
        return None;
    };

    Some(RayAabbHit { t_hit })
}

/// Slack along the aim ray between wide-body entry and narrow head-box entry.
#[inline]
pub fn head_hit_firearm_entry_slack_m(body_lateral_radius_m: f32) -> f32 {
    (body_lateral_radius_m - PLAYER_HEAD_HIT_BOX_M * 0.5).max(0.02)
        + PLAYER_HEAD_HIT_BODY_GAP_M
        + PLAYER_HEAD_HIT_FIREARM_ENTRY_SLACK_M
}

/// Firearm headshot: aim ray reaches the head box on its path to the body-surface hit.
///
/// Uses ray–AABB overlap, not the body-entry impact point. The wide body trace volume is
/// often first hit on a side face outside the narrow head cube even when aimed at the head.
#[inline]
pub fn is_headshot_firearm_ray(
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    feet_x: f32,
    feet_y: f32,
    feet_z: f32,
    body_height_m: f32,
    body_lateral_radius_m: f32,
    body_hit_t: f32,
) -> bool {
    let (mn_x, mn_y, mn_z, mx_x, mx_y, mx_z) =
        head_hit_box_aabb(feet_x, feet_y, feet_z, body_height_m);
    let Some(interval) = ray_aabb_intersect_interval(
        ox, oy, oz, dx, dy, dz, mn_x, mn_y, mn_z, mx_x, mx_y, mx_z,
    ) else {
        return false;
    };
    if interval.t_exit < RAY_AABB_T_ENTER_EPS {
        return false;
    }
    let slack = head_hit_firearm_entry_slack_m(body_lateral_radius_m);
    interval.t_enter <= body_hit_t + slack
}

/// Selected hotbar `def_id` when a slot is active, ignoring catalog weapon-vs-consumable rules.
pub fn active_hotbar_item_def_id(ctx: &ReducerContext, attacker: Identity) -> Option<String> {
    let row = ctx.db.player_active_hotbar().identity().find(&attacker)?;
    if row.slot_index == ACTIVE_HOTBAR_SLOT_CLEARED || row.slot_index >= NUM_PLAYER_HOTBAR_SLOTS {
        return None;
    }
    let item = find_item_in_hotbar_slot(ctx, attacker, row.slot_index)?;
    Some(item.def_id)
}

pub fn active_hotbar_weapon_def_id(ctx: &ReducerContext, attacker: Identity) -> Option<String> {
    let def = active_hotbar_item_def_id(ctx, attacker)?;
    if items_catalog::melee_damage(&def).unwrap_or(0.0) > 0.0 {
        Some(def)
    } else {
        None
    }
}

#[derive(Clone, Copy, Debug)]
pub struct MeleeHeadshotRayResult {
    pub headshot: bool,
    pub impact_x: f32,
    pub impact_y: f32,
    pub impact_z: f32,
}

/// Classify melee headshots via eye ray vs victim head AABB (shared by PvP and NPC melee).
pub fn melee_headshot_from_aim_ray(
    attacker_x: f32,
    attacker_eye_y: f32,
    attacker_z: f32,
    aim_dir: (f32, f32, f32),
    victim_x: f32,
    victim_feet_y: f32,
    victim_z: f32,
    _body_radius: f32,
    body_height: f32,
    reach_m: f32,
    fallback_impact: (f32, f32, f32),
) -> MeleeHeadshotRayResult {
    let (mut impact_x, mut impact_y, mut impact_z) = fallback_impact;
    let mut headshot = false;
    let (adx, ady, adz) = aim_dir;
    let (mn_x, mn_y, mn_z, mx_x, mx_y, mx_z) =
        head_hit_box_aabb(victim_x, victim_feet_y, victim_z, body_height);
    if let Some(hit) = ray_aabb_intersect_enter(
        attacker_x,
        attacker_eye_y,
        attacker_z,
        adx,
        ady,
        adz,
        mn_x,
        mn_y,
        mn_z,
        mx_x,
        mx_y,
        mx_z,
    ) {
        if hit.t_hit > RAY_AABB_T_ENTER_EPS && hit.t_hit <= reach_m {
            headshot = true;
            impact_x = attacker_x + adx * hit.t_hit;
            impact_y = attacker_eye_y + ady * hit.t_hit;
            impact_z = attacker_z + adz * hit.t_hit;
        }
    }
    MeleeHeadshotRayResult {
        headshot,
        impact_x,
        impact_y,
        impact_z,
    }
}

pub fn melee_damage_for_def_id(def_id: &str) -> f32 {
    items_catalog::melee_damage(def_id).unwrap_or(0.0)
}

/// Melee hit candidate resolution: horizontal arc picks the victim; optional `aim_dir_world` is a
/// **normalized** camera-forward vector (same validation as firearms) used only to classify
/// headshots via a short eye ray against the victim's head AABB.
pub fn resolve_melee_hit(
    ctx: &ReducerContext,
    attacker: Identity,
    attacker_x: f32,
    attacker_y: f32,
    attacker_z: f32,
    attacker_yaw: f32,
    weapon_def_id: &str,
    aim_dir_world: Option<(f32, f32, f32)>,
    reach_m: Option<f32>,
    damage_override: Option<f32>,
) -> Option<MeleeResolvedHit> {
    let mut damage = damage_override.unwrap_or_else(|| melee_damage_for_def_id(weapon_def_id));
    if damage <= 0.0 {
        return None;
    }
    let reach = reach_m.unwrap_or(MELEE_REACH_M);
    let mut candidates = Vec::<PlayerBodySample>::new();
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
        let body_height = body_height_from_crouch_bit(bits);
        candidates.push(PlayerBodySample {
            identity: pose.identity,
            x: pose.x,
            y: pose.y,
            z: pose.z,
            body_height,
        });
    }
    if candidates.is_empty() {
        return None;
    }
    let grid = PlayerSpatialHash::from_samples(&candidates);
    let mut nearby = Vec::<usize>::with_capacity(16);
    let mut seen = vec![false; candidates.len()];
    grid.gather_indices_in_bounds(
        attacker_x - reach,
        attacker_y - 0.25,
        attacker_z - reach,
        attacker_x + reach,
        attacker_y + PLAYER_BODY_HEIGHT_STAND_M,
        attacker_z + reach,
        &mut nearby,
        &mut seen,
    );

    let forward_x = -attacker_yaw.sin();
    let forward_z = -attacker_yaw.cos();
    let right_x = -forward_z;
    let right_z = forward_x;
    let mut best_idx: Option<usize> = None;
    let mut best_lateral = f32::INFINITY;
    let mut best_forward = f32::INFINITY;

    for idx in nearby {
        let target = candidates[idx];
        if !vertical_overlap(
            attacker_y + MELEE_HIT_MIN_Y_OFFSET_M,
            MELEE_HIT_MAX_Y_OFFSET_M - MELEE_HIT_MIN_Y_OFFSET_M,
            target.y,
            target.body_height,
        ) {
            continue;
        }
        let dx = target.x - attacker_x;
        let dz = target.z - attacker_z;
        let dist = (dx * dx + dz * dz).sqrt();
        if dist > reach + PLAYER_BODY_RADIUS_M + MELEE_HIT_RADIUS_M {
            continue;
        }
        let forward = dx * forward_x + dz * forward_z;
        if forward < 0.0 || forward > reach + PLAYER_BODY_RADIUS_M {
            continue;
        }
        let dot = if dist > 1e-5 { forward / dist } else { 1.0 };
        if dot < MELEE_ARC_DOT_MIN {
            continue;
        }
        let lateral = (dx * right_x + dz * right_z).abs();
        if lateral > PLAYER_BODY_RADIUS_M + MELEE_HIT_RADIUS_M {
            continue;
        }
        let replace = best_idx.is_none()
            || lateral < best_lateral - 1e-4
            || ((lateral - best_lateral).abs() <= 1e-4 && forward < best_forward);
        if replace {
            best_idx = Some(idx);
            best_lateral = lateral;
            best_forward = forward;
        }
    }

    let target = candidates[best_idx?];

    let mut impact_x = target.x;
    let mut impact_y = target.y + target.body_height.min(1.58) * 0.62;
    let mut impact_z = target.z;
    let mut headshot = false;

    if let Some((adx, ady, adz)) = aim_dir_world {
        let abits = ctx
            .db
            .player_input()
            .identity()
            .find(&attacker)
            .map(|i| i.bits)
            .unwrap_or(0);
        let eye_y = attacker_y + eye_y_above_feet(abits & BIT_CROUCH != 0);
        let hs = melee_headshot_from_aim_ray(
            attacker_x,
            eye_y,
            attacker_z,
            (adx, ady, adz),
            target.x,
            target.y,
            target.z,
            PLAYER_BODY_RADIUS_M,
            target.body_height,
            reach,
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

    Some(MeleeResolvedHit {
        target: target.identity,
        damage,
        impact_x,
        impact_y,
        impact_z,
        headshot,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(n: u8) -> Identity {
        Identity::from_byte_array([n; 32])
    }

    #[test]
    fn catalog_driven_melee_damage_matches_weapon_defs() {
        assert_eq!(melee_damage_for_def_id("knife"), 12.0);
        assert_eq!(melee_damage_for_def_id("crowbar"), 22.0);
        assert_eq!(melee_damage_for_def_id("screwdriver"), 8.0);
        assert_eq!(melee_damage_for_def_id("water-bottle"), 0.0);
    }

    #[test]
    fn headshot_zone_detects_square_head_box() {
        let feet_x = 2.0;
        let feet_y = 10.0;
        let feet_z = -1.0;
        let h = PLAYER_BODY_HEIGHT_STAND_M;
        let (mn_x, mn_y, _mn_z, mx_x, mx_y, _mx_z) = head_hit_box_aabb(feet_x, feet_y, feet_z, h);
        let cx = (mn_x + mx_x) * 0.5;
        let cy = (mn_y + mx_y) * 0.5;
        let torso_h = body_hit_torso_height_m(h);
        assert!(torso_h + PLAYER_HEAD_HIT_BODY_GAP_M <= mn_y - feet_y + 1e-4);
        assert!(is_headshot_impact_world(feet_x, feet_y, feet_z, h, cx, cy, feet_z));
        assert!(!is_headshot_impact_world(
            feet_x,
            feet_y,
            feet_z,
            h,
            mx_x + 0.05,
            cy,
            feet_z
        ));
        assert!(!is_headshot_impact_world(
            feet_x,
            feet_y,
            feet_z,
            h,
            cx,
            mn_y - 0.05,
            feet_z
        ));
    }

    #[test]
    fn headshot_ray_hits_head_box() {
        let px = 0.0;
        let pz = 1.0;
        let feet_y = 0.0;
        let bh = PLAYER_BODY_HEIGHT_STAND_M;
        let (mn_x, mn_y, mn_z, mx_x, mx_y, mx_z) = head_hit_box_aabb(px, feet_y, pz, bh);
        let hit = ray_aabb_intersect_enter(
            0.0,
            1.62,
            0.0,
            0.0,
            0.0,
            1.0,
            mn_x,
            mn_y,
            mn_z,
            mx_x,
            mx_y,
            mx_z,
        );
        assert!(hit.is_some());
        let t = hit.unwrap().t_hit;
        assert!(t > 0.0 && t < 2.0);
    }

    #[test]
    fn firearm_headshot_uses_ray_not_body_entry_point() {
        let feet_x = 0.0;
        let feet_y = 0.0;
        let feet_z = 0.0;
        let h = PLAYER_BODY_HEIGHT_STAND_M;
        let head_cy = head_hit_box_center_y(feet_y, h);
        let body_r = PLAYER_BODY_RADIUS_M;

        // Frontal head shot — entry impact lies inside the head box.
        let (ix, iy, iz) = (
            feet_x,
            head_cy,
            feet_z + PLAYER_BODY_RADIUS_M,
        );
        assert!(is_headshot_impact_world(feet_x, feet_y, feet_z, h, ix, iy, iz));
        assert!(is_headshot_firearm_ray(
            feet_x,
            head_cy + 0.05,
            feet_z - 4.0,
            0.0,
            0.0,
            1.0,
            feet_x,
            feet_y,
            feet_z,
            h,
            body_r,
            4.0 - PLAYER_BODY_RADIUS_M,
        ));

        // Side clip at head height — body entry is on the wide side face, outside head X.
        let ox = feet_x + 3.0;
        let oy = head_cy;
        let oz = feet_z;
        let dx = feet_x - ox;
        let dy = 0.0;
        let dz = 0.0;
        let len = (dx * dx + dy * dy + dz * dz).sqrt();
        let (dx, dy, dz) = (dx / len, dy / len, dz / len);
        let body_hit_t = len - body_r;
        let side_ix = feet_x + body_r;
        assert!(!is_headshot_impact_world(
            feet_x, feet_y, feet_z, h, side_ix, oy, oz
        ));
        assert!(is_headshot_firearm_ray(
            ox, oy, oz, dx, dy, dz, feet_x, feet_y, feet_z, h, body_r, body_hit_t,
        ));

        // Chest shot — ray should not reach the head box before body entry.
        let chest_y = feet_y + h * 0.45;
        assert!(!is_headshot_firearm_ray(
            feet_x,
            chest_y + 0.05,
            feet_z - 4.0,
            0.0,
            0.0,
            1.0,
            feet_x,
            feet_y,
            feet_z,
            h,
            body_r,
            4.0 - body_r,
        ));
    }
}

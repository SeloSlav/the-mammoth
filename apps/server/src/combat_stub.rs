//! Authoritative player-vs-player melee helpers and simple player-body spatial indexing.

use std::collections::HashMap;

use spacetimedb::{Identity, ReducerContext, Table};

use crate::inventory::{find_item_in_hotbar_slot, NUM_PLAYER_HOTBAR_SLOTS};
use crate::items_catalog;
use crate::loadout::{player_active_hotbar, ACTIVE_HOTBAR_SLOT_CLEARED};
use crate::player_vitals;
use crate::pose::player_pose;

pub const PLAYER_BODY_RADIUS_M: f32 = 0.22;
pub const PLAYER_BODY_HEIGHT_STAND_M: f32 = 1.78;

const PLAYER_SPATIAL_CELL_XZ_M: f32 = 1.25;
const PLAYER_SPATIAL_CELL_Y_M: f32 = 2.0;
const PLAYER_COLLISION_PASSES: usize = 4;
const PLAYER_COLLISION_EPS_M: f32 = 0.001;

const MELEE_REACH_M: f32 = 1.7;
const MELEE_HIT_RADIUS_M: f32 = 0.34;
const MELEE_ARC_DOT_MIN: f32 = 0.2;
const MELEE_HIT_MIN_Y_OFFSET_M: f32 = 0.2;
const MELEE_HIT_MAX_Y_OFFSET_M: f32 = 1.45;

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
fn vertical_overlap(a_y: f32, a_h: f32, b_y: f32, b_h: f32) -> bool {
    a_y < b_y + b_h && b_y < a_y + a_h
}

/// Selected hotbar item `def_id` when the combat rail points at a melee weapon with authored
/// catalog damage; otherwise `None`.
pub fn active_hotbar_weapon_def_id(ctx: &ReducerContext, attacker: Identity) -> Option<String> {
    let row = ctx.db.player_active_hotbar().identity().find(&attacker)?;
    if row.slot_index == ACTIVE_HOTBAR_SLOT_CLEARED || row.slot_index >= NUM_PLAYER_HOTBAR_SLOTS {
        return None;
    }
    let item = find_item_in_hotbar_slot(ctx, attacker, row.slot_index)?;
    if items_catalog::melee_damage(&item.def_id).unwrap_or(0.0) > 0.0 {
        Some(item.def_id)
    } else {
        None
    }
}

pub fn melee_damage_for_def_id(def_id: &str) -> f32 {
    items_catalog::melee_damage(def_id).unwrap_or(0.0)
}

pub fn resolve_player_player_collisions(samples: &mut [PlayerBodySample]) {
    if samples.len() < 2 {
        return;
    }
    let mut nearby = Vec::<usize>::with_capacity(32);
    let mut seen = vec![false; samples.len()];
    for _ in 0..PLAYER_COLLISION_PASSES {
        let grid = PlayerSpatialHash::from_samples(samples);
        for i in 0..samples.len() {
            let body = samples[i];
            grid.gather_indices_in_bounds(
                body.x - PLAYER_BODY_RADIUS_M * 2.0,
                body.y,
                body.z - PLAYER_BODY_RADIUS_M * 2.0,
                body.x + PLAYER_BODY_RADIUS_M * 2.0,
                body.y + body.body_height,
                body.z + PLAYER_BODY_RADIUS_M * 2.0,
                &mut nearby,
                &mut seen,
            );
            for &j in &nearby {
                if j <= i {
                    continue;
                }
                let other = samples[j];
                if !vertical_overlap(body.y, body.body_height, other.y, other.body_height) {
                    continue;
                }
                let dx = samples[j].x - samples[i].x;
                let dz = samples[j].z - samples[i].z;
                let dist_sq = dx * dx + dz * dz;
                let min_dist = PLAYER_BODY_RADIUS_M * 2.0;
                if dist_sq >= min_dist * min_dist {
                    continue;
                }
                let dist = dist_sq.sqrt();
                let (nx, nz) = if dist > 1e-5 {
                    (dx / dist, dz / dist)
                } else {
                    (1.0, 0.0)
                };
                let push = (min_dist - dist + PLAYER_COLLISION_EPS_M) * 0.5;
                samples[i].x -= nx * push;
                samples[i].z -= nz * push;
                samples[j].x += nx * push;
                samples[j].z += nz * push;
            }
        }
    }
}

pub fn resolve_melee_hit(
    ctx: &ReducerContext,
    attacker: Identity,
    attacker_x: f32,
    attacker_y: f32,
    attacker_z: f32,
    attacker_yaw: f32,
    weapon_def_id: &str,
) -> Option<MeleeResolvedHit> {
    let damage = melee_damage_for_def_id(weapon_def_id);
    if damage <= 0.0 {
        return None;
    }
    let mut candidates = Vec::<PlayerBodySample>::new();
    for pose in ctx.db.player_pose().iter() {
        if pose.identity == attacker || player_vitals::is_player_dead(ctx, pose.identity) {
            continue;
        }
        candidates.push(PlayerBodySample {
            identity: pose.identity,
            x: pose.x,
            y: pose.y,
            z: pose.z,
            body_height: PLAYER_BODY_HEIGHT_STAND_M,
        });
    }
    if candidates.is_empty() {
        return None;
    }
    let grid = PlayerSpatialHash::from_samples(&candidates);
    let mut nearby = Vec::<usize>::with_capacity(16);
    let mut seen = vec![false; candidates.len()];
    grid.gather_indices_in_bounds(
        attacker_x - MELEE_REACH_M,
        attacker_y - 0.25,
        attacker_z - MELEE_REACH_M,
        attacker_x + MELEE_REACH_M,
        attacker_y + PLAYER_BODY_HEIGHT_STAND_M,
        attacker_z + MELEE_REACH_M,
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
        if dist > MELEE_REACH_M + PLAYER_BODY_RADIUS_M + MELEE_HIT_RADIUS_M {
            continue;
        }
        let forward = dx * forward_x + dz * forward_z;
        if forward < 0.0 || forward > MELEE_REACH_M + PLAYER_BODY_RADIUS_M {
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
    Some(MeleeResolvedHit {
        target: target.identity,
        damage,
        impact_x: target.x,
        impact_y: target.y + target.body_height.min(1.58) * 0.62,
        impact_z: target.z,
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
        assert_eq!(melee_damage_for_def_id("water_bottle"), 0.0);
    }

    #[test]
    fn collision_resolution_separates_overlapping_players() {
        let mut samples = vec![
            PlayerBodySample {
                identity: id(1),
                x: 0.0,
                y: 0.0,
                z: 0.0,
                body_height: PLAYER_BODY_HEIGHT_STAND_M,
            },
            PlayerBodySample {
                identity: id(2),
                x: 0.15,
                y: 0.0,
                z: 0.0,
                body_height: PLAYER_BODY_HEIGHT_STAND_M,
            },
        ];
        resolve_player_player_collisions(&mut samples);
        let dx = samples[1].x - samples[0].x;
        let dz = samples[1].z - samples[0].z;
        assert!((dx * dx + dz * dz).sqrt() >= PLAYER_BODY_RADIUS_M * 2.0 - 1e-3);
    }

    #[test]
    fn collision_resolution_ignores_players_on_other_floors() {
        let mut samples = vec![
            PlayerBodySample {
                identity: id(1),
                x: 0.0,
                y: 0.0,
                z: 0.0,
                body_height: PLAYER_BODY_HEIGHT_STAND_M,
            },
            PlayerBodySample {
                identity: id(2),
                x: 0.0,
                y: 4.0,
                z: 0.0,
                body_height: PLAYER_BODY_HEIGHT_STAND_M,
            },
        ];
        resolve_player_player_collisions(&mut samples);
        assert_eq!(samples[0].x, 0.0);
        assert_eq!(samples[1].x, 0.0);
    }
}

//! Data-driven babushka encounters on megablock storeys (`megablock:floor:{levelIndex}`).
//! Constants stay in sync with `packages/schemas/src/megablockFloorNpcEncounter.ts`.

use spacetimedb::{ReducerContext, Table};

use crate::apartments::{apartment_unit, ApartmentUnit, UNIT_STATE_UNCLAIMED};
use crate::megablock_floor_spawn::megablock_babushka_spawn_pose;
use crate::elevator_layout;
use crate::npc::{self, world_npc, WorldNpc};
use crate::combat_sim::BABUSHKA_CORPSE_TOTAL_MICROS;
use crate::player_mission::{FIRST_EXTRACTION_FLOOR_DOC_ID, FIRST_EXTRACTION_LEVEL_INDEX};

pub const MEGABLOCK_FLOOR_SESSION_PREFIX: &str = "megablock:floor:";

/// Vertical tolerance for “same storey” — below half `STOREY_SPACING_M` so adjacent slabs never overlap.
pub const MEGABLOCK_STOREY_VERTICAL_TOLERANCE_M: f32 = 1.75;

const FIRST_EXTRACTION_FLOOR_NPC_SPAWN_SALT: u64 = 0x0016_F1_00_01;
const FIRST_EXTRACTION_FLOOR_BABUSHKA_COUNT: u32 = 6;

struct MegablockFloorEncounterDef {
    floor_doc_id: &'static str,
    level_index: u32,
    babushka_count: u32,
    spawn_salt: u64,
}

const MEGABLOCK_FLOOR_ENCOUNTERS: &[MegablockFloorEncounterDef] = &[MegablockFloorEncounterDef {
    floor_doc_id: FIRST_EXTRACTION_FLOOR_DOC_ID,
    level_index: FIRST_EXTRACTION_LEVEL_INDEX,
    babushka_count: FIRST_EXTRACTION_FLOOR_BABUSHKA_COUNT,
    spawn_salt: FIRST_EXTRACTION_FLOOR_NPC_SPAWN_SALT,
}];

pub fn megablock_floor_session_key(level_index: u32) -> String {
    format!("{MEGABLOCK_FLOOR_SESSION_PREFIX}{level_index}")
}

pub fn parse_megablock_floor_session_key(session_key: &str) -> Option<u32> {
    let raw = session_key.strip_prefix(MEGABLOCK_FLOOR_SESSION_PREFIX)?;
    raw.parse::<u32>().ok().filter(|&level| level > 0)
}

#[inline]
pub fn feet_on_megablock_storey_level(feet_y: f32, level_index: u32) -> bool {
    let expected =
        elevator_layout::support_feet_y_for_level(level_index, elevator_layout::BUILDING_ORIGIN_Y);
    (feet_y - expected).abs() <= MEGABLOCK_STOREY_VERTICAL_TOLERANCE_M
}

pub fn unit_keys_on_floor(
    ctx: &ReducerContext,
    floor_doc_id: &str,
    level_index: u32,
) -> Vec<String> {
    let mut keys: Vec<String> = ctx
        .db
        .apartment_unit()
        .iter()
        .filter(|u| u.floor_doc_id == floor_doc_id && u.level == level_index)
        .map(|u| u.unit_key.clone())
        .collect();
    keys.sort();
    keys
}

fn residential_units_on_floor(
    ctx: &ReducerContext,
    floor_doc_id: &str,
    level_index: u32,
) -> Vec<ApartmentUnit> {
    let mut units: Vec<ApartmentUnit> = ctx
        .db
        .apartment_unit()
        .iter()
        .filter(|u| {
            u.floor_doc_id == floor_doc_id
                && u.level == level_index
                && u.state == UNIT_STATE_UNCLAIMED
                && (u.unit_id.starts_with("unit_e_") || u.unit_id.starts_with("unit_w_"))
        })
        .collect();
    units.sort_by(|a, b| a.unit_key.cmp(&b.unit_key));
    units
}

pub fn floor_play_footprint_xz(
    ctx: &ReducerContext,
    floor_doc_id: &str,
    level_index: u32,
) -> Option<(f32, f32, f32, f32)> {
    let units = residential_units_on_floor(ctx, floor_doc_id, level_index);
    if units.is_empty() {
        return None;
    }
    let mut min_x = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_z = f32::NEG_INFINITY;
    for unit in &units {
        min_x = min_x.min(unit.bound_min_x);
        max_x = max_x.max(unit.bound_max_x);
        min_z = min_z.min(unit.bound_min_z);
        max_z = max_z.max(unit.bound_max_z);
    }
    let pad = 0.35;
    Some((min_x - pad, max_x + pad, min_z - pad, max_z + pad))
}

pub fn clamp_babushka_to_floor_footprint(
    ctx: &ReducerContext,
    floor_doc_id: &str,
    level_index: u32,
    x: f32,
    z: f32,
) -> (f32, f32) {
    let Some((min_x, max_x, min_z, max_z)) =
        floor_play_footprint_xz(ctx, floor_doc_id, level_index)
    else {
        return (x, z);
    };
    let inset = 0.55;
    let min_x = min_x + inset;
    let max_x = max_x - inset;
    let min_z = min_z + inset;
    let max_z = max_z - inset;
    if max_x <= min_x || max_z <= min_z {
        return (x, z);
    }
    (x.clamp(min_x, max_x), z.clamp(min_z, max_z))
}

fn feet_y_for_floor_xz(
    ctx: &ReducerContext,
    floor_doc_id: &str,
    level_index: u32,
    x: f32,
    z: f32,
) -> f32 {
    if let Some(unit) = ctx.db.apartment_unit().iter().find(|u| {
        u.floor_doc_id == floor_doc_id
            && u.level == level_index
            && x >= u.bound_min_x
            && x <= u.bound_max_x
            && z >= u.bound_min_z
            && z <= u.bound_max_z
    }) {
        return unit.foot_y;
    }
    elevator_layout::support_feet_y_for_level(level_index, elevator_layout::BUILDING_ORIGIN_Y)
}

pub fn snap_babushka_megablock_floor_feet_y(ctx: &ReducerContext, npc: &mut WorldNpc) {
    let Some(level_index) = parse_megablock_floor_session_key(npc.session_key.as_str()) else {
        return;
    };
    let floor_doc_id = encounter_floor_doc_for_level(level_index);
    npc.y = feet_y_for_floor_xz(ctx, floor_doc_id, level_index, npc.x, npc.z);
}

pub fn clamp_babushka_to_megablock_floor(ctx: &ReducerContext, npc: &mut WorldNpc) {
    let Some(level_index) = parse_megablock_floor_session_key(npc.session_key.as_str()) else {
        return;
    };
    let floor_doc_id = encounter_floor_doc_for_level(level_index);
    let (x, z) = clamp_babushka_to_floor_footprint(ctx, floor_doc_id, level_index, npc.x, npc.z);
    npc.x = x;
    npc.z = z;
}

pub fn encounter_floor_doc_for_level(level_index: u32) -> &'static str {
    for def in MEGABLOCK_FLOOR_ENCOUNTERS {
        if def.level_index == level_index {
            return def.floor_doc_id;
        }
    }
    FIRST_EXTRACTION_FLOOR_DOC_ID
}

#[inline]
fn living_babushka_count(npcs: &[WorldNpc]) -> usize {
    npcs.iter()
        .filter(|n| {
            n.archetype == npc::NPC_ARCHETYPE_BABUSHKA
                && n.state != npc::NPC_STATE_DEAD
                && n.health > 0.0
        })
        .count()
}

fn ensure_floor_encounter(ctx: &ReducerContext, def: &MegablockFloorEncounterDef) {
    let session_key = megablock_floor_session_key(def.level_index);
    let session_npcs: Vec<WorldNpc> = ctx
        .db
        .world_npc()
        .iter()
        .filter(|n| n.session_key == session_key)
        .collect();
    let living = living_babushka_count(session_npcs.as_slice());
    let target = def.babushka_count as usize;
    if living >= target {
        return;
    }
    // Dead corpses still occupy the session until corpse linger + respawn tick.
    if session_npcs.len() >= target {
        return;
    }

    let units = residential_units_on_floor(ctx, def.floor_doc_id, def.level_index);
    if units.is_empty() {
        log::warn!(
            "megablock floor encounter: no vacant residential units on {} level {}",
            def.floor_doc_id,
            def.level_index
        );
        return;
    }

    let deficit = target.saturating_sub(session_npcs.len());
    for offset in 0..deficit {
        let slot_index = session_npcs.len() as u32 + offset as u32;
        let (x, y, z, yaw) = megablock_babushka_spawn_pose(
            def.level_index,
            &units,
            slot_index,
            def.spawn_salt,
        );
        let _npc_id = npc::spawn_babushka(ctx, session_key.clone(), x, y, z, yaw, None);
    }
    if deficit > 0 {
        log::info!(
            "megablock floor encounter: topped up {} babushkas on level {} ({} living)",
            deficit,
            def.level_index,
            living
        );
    }
}

fn encounter_def_for_level(level_index: u32) -> Option<&'static MegablockFloorEncounterDef> {
    MEGABLOCK_FLOOR_ENCOUNTERS
        .iter()
        .find(|def| def.level_index == level_index)
}

/// After corpse linger, delete the dead row and spawn a fresh babushka on the same floor session.
/// Returns `true` when the corpse row was deleted (caller must not update that `npc_id`).
pub fn maybe_despawn_megablock_floor_corpse_and_respawn(
    ctx: &ReducerContext,
    npc: &WorldNpc,
    now_us: i64,
) -> bool {
    if npc.state != npc::NPC_STATE_DEAD {
        return false;
    }
    let Some(level_index) = parse_megablock_floor_session_key(npc.session_key.as_str()) else {
        return false;
    };
    let Some(def) = encounter_def_for_level(level_index) else {
        return false;
    };
    if now_us - npc.last_melee_micros < BABUSHKA_CORPSE_TOTAL_MICROS {
        return false;
    }

    let units = residential_units_on_floor(ctx, def.floor_doc_id, def.level_index);
    if units.is_empty() {
        return false;
    }

    let session_key = npc.session_key.clone();
    let slot_index = (npc.npc_id % def.babushka_count as u64) as u32;
    let salt = now_us as u64 ^ npc.npc_id.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    let (x, y, z, yaw) = megablock_babushka_spawn_pose(
        def.level_index,
        &units,
        slot_index,
        def.spawn_salt ^ salt,
    );
    let npc_id = npc.npc_id;
    ctx.db.world_npc().npc_id().delete(&npc_id);
    let _ = npc::spawn_babushka(ctx, session_key, x, y, z, yaw, None);
    true
}

/// Keep megablock floor babushka populations topped up (always-on, not mission-gated).
pub fn sync_all_megablock_floor_encounters(ctx: &ReducerContext) {
    for def in MEGABLOCK_FLOOR_ENCOUNTERS {
        ensure_floor_encounter(ctx, def);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn megablock_floor_session_key_round_trip() {
        let key = megablock_floor_session_key(17);
        assert_eq!(parse_megablock_floor_session_key(key.as_str()), Some(17));
    }

    #[test]
    fn storey_tolerance_separates_adjacent_slabs() {
        let y16 = elevator_layout::support_feet_y_for_level(17, elevator_layout::BUILDING_ORIGIN_Y);
        let y17 = elevator_layout::support_feet_y_for_level(18, elevator_layout::BUILDING_ORIGIN_Y);
        assert!(feet_on_megablock_storey_level(y16, 17));
        assert!(!feet_on_megablock_storey_level(y17, 17));
    }

    #[test]
    fn living_babushka_count_ignores_corpses() {
        use crate::npc::{
            NPC_ARCHETYPE_BABUSHKA, NPC_LOCOMOTION_IDLE, NPC_STATE_DEAD, NPC_STATE_IDLE,
        };

        let living = WorldNpc {
            npc_id: 1,
            archetype: NPC_ARCHETYPE_BABUSHKA.to_string(),
            session_key: "megablock:floor:17".to_string(),
            x: 0.0,
            y: 0.0,
            z: 0.0,
            yaw: 0.0,
            vel_x: 0.0,
            vel_z: 0.0,
            grounded: 1,
            health: 100.0,
            max_health: 100.0,
            state: NPC_STATE_IDLE,
            locomotion: NPC_LOCOMOTION_IDLE,
            melee_presentation_seq: 0,
            hit_presentation_seq: 0,
            last_melee_micros: 0,
            chase_identity: None,
        };
        let corpse = WorldNpc {
            npc_id: 2,
            state: NPC_STATE_DEAD,
            health: 0.0,
            archetype: living.archetype.clone(),
            session_key: living.session_key.clone(),
            x: living.x,
            y: living.y,
            z: living.z,
            yaw: living.yaw,
            vel_x: 0.0,
            vel_z: 0.0,
            grounded: 1,
            max_health: living.max_health,
            locomotion: NPC_LOCOMOTION_IDLE,
            melee_presentation_seq: 0,
            hit_presentation_seq: 0,
            last_melee_micros: 0,
            chase_identity: None,
        };
        assert_eq!(living_babushka_count(&[living, corpse]), 1);
    }
}

//! Mamutica hoistway layout — must match `content/building/floors/*.json` + `shaftPlanKey` in `@the-mammoth/world`.

use serde::Deserialize;
use std::sync::OnceLock;

/// Match `DEFAULT_BUILDING_FLOOR_SPACING_M` / `STOREY_SPACING_M`.
pub const STOREY_SPACING_M: f32 = 60.0 / 19.0;
pub const BUILDING_ORIGIN_Y: f32 = 0.0;
pub const SHAFT_LOCAL_Y: f32 = 1.6589473684210527;
pub const SHAFT_SX: f32 = 2.38;
pub const SHAFT_SY: f32 = 3.1578947368421053;
pub const SHAFT_SZ: f32 = 4.0;
pub const WALL_T: f32 = 0.11;
pub const CAR_INNER_MARGIN: f32 = 0.07;
pub const SKIN: f32 = 0.034;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum DoorFace {
    E = 0,
    W = 1,
    N = 2,
    S = 3,
}

#[derive(Clone, Copy, Debug)]
pub struct ElevShaftSpec {
    pub shaft_key: &'static str,
    pub plate_x: f32,
    pub plate_z: f32,
    pub door: DoorFace,
}

/// West-bank cars along the spine (`floor_mamutica_typical` / ground hub).
pub const MAMUTH_ELEVATOR_SPECS: &[ElevShaftSpec] = &[
    ElevShaftSpec {
        shaft_key: "-3.17,-92",
        plate_x: -3.175,
        plate_z: -92.0,
        door: DoorFace::E,
    },
    ElevShaftSpec {
        shaft_key: "-3.17,-46",
        plate_x: -3.175,
        plate_z: -46.0,
        door: DoorFace::E,
    },
    ElevShaftSpec {
        shaft_key: "-3.17,0",
        plate_x: -3.175,
        plate_z: 0.0,
        door: DoorFace::E,
    },
    ElevShaftSpec {
        shaft_key: "-3.17,46",
        plate_x: -3.175,
        plate_z: 46.0,
        door: DoorFace::E,
    },
    ElevShaftSpec {
        shaft_key: "-3.17,92",
        plate_x: -3.175,
        plate_z: 92.0,
        door: DoorFace::E,
    },
];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildingDocForLayout {
    floor_refs: Vec<FloorRefForLayout>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FloorRefForLayout {
    level_index: u32,
}

pub fn max_level() -> u32 {
    static MAX_LEVEL: OnceLock<u32> = OnceLock::new();
    *MAX_LEVEL.get_or_init(|| {
        let building: BuildingDocForLayout = serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../content/building/mammoth.json"
        )))
        .expect("building JSON must parse for elevator layout");
        building
            .floor_refs
            .iter()
            .map(|r| r.level_index)
            .max()
            .unwrap_or(1)
            .max(1)
    })
}

#[inline]
pub fn shaft_floor_local_top_y(sy: f32) -> f32 {
    let hy = sy * 0.5;
    -hy + WALL_T
}

/// Feet Y when standing on hoistway pit / cab floor at `level` (1 = ground), matching client helper.
#[inline]
pub fn support_feet_y_for_level(level: u32, building_oy: f32) -> f32 {
    let li = level.max(1) as f32;
    let plate_world_y = building_oy + (li - 1.0) * STOREY_SPACING_M;
    plate_world_y + SHAFT_LOCAL_Y + shaft_floor_local_top_y(SHAFT_SY) + SKIN
}

#[inline]
pub fn inner_half_xz() -> (f32, f32) {
    let hx = SHAFT_SX * 0.5 - WALL_T - CAR_INNER_MARGIN;
    let hz = SHAFT_SZ * 0.5 - WALL_T - CAR_INNER_MARGIN;
    (hx.max(0.12), hz.max(0.12))
}

#[inline]
pub fn inner_height() -> f32 {
    (SHAFT_SY - 2.0 * WALL_T - 0.14).max(1.8)
}

/// ECMAScript `Math.round` (ties toward +∞), applied per axis like `shaftPlanKey` in `@the-mammoth/world`.
#[inline]
#[allow(dead_code)]
pub fn round_js(n: f32) -> f32 {
    let floor = n.floor();
    let ceil = n.ceil();
    let frac = n - floor;
    if frac < 0.5 {
        floor
    } else if frac > 0.5 {
        ceil
    } else {
        ceil
    }
}

#[allow(dead_code)]
pub fn plan_key(px: f32, pz: f32) -> String {
    let rx = round_js(px * 100.0) / 100.0;
    let rz = round_js(pz * 100.0) / 100.0;
    format!("{rx},{rz}")
}

#[cfg(test)]
mod tests {
    use super::max_level;

    #[test]
    fn max_level_tracks_authored_building_floor_refs() {
        assert_eq!(max_level(), 20);
    }
}

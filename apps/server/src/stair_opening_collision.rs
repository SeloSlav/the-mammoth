use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

use crate::generated_apartment_doors::{ApartmentDoorTemplate, APARTMENT_DOOR_TEMPLATE_SETS};

const DEFAULT_BUILDING_FLOOR_SPACING_M: f32 = 60.0 / 19.0;
const STOREY_SPACING_M: f32 = 60.0 / 19.0;
const CORE_PY: f32 = STOREY_SPACING_M * 0.5 + 0.08;
const WT: f32 = 0.11;
const SHAFT_DOUBLE_DOOR_W: f32 = 1.86;
const SHAFT_DOUBLE_DOOR_H: f32 = 2.2;
const SHAFT_DOOR_SILL: f32 = 0.05;
const SHAFT_GROUND_DOOR_BAND_M: f32 = STOREY_SPACING_M - 0.38;
const LOBBY_DOUBLE_DOOR_W: f32 = 1.84;
const LOBBY_DOUBLE_DOOR_H: f32 = 2.16;
const LOBBY_DOOR_SILL: f32 = 0.04;
const LOBBY_DOUBLE_DOOR_BAY_SPACING: f32 = LOBBY_DOUBLE_DOOR_W + 0.56;
const STAIR_CORRIDOR_TOUCH_M: f32 = 0.55;

#[derive(Clone, Copy)]
struct Aabb {
    min: [f32; 3],
    max: [f32; 3],
}

#[derive(Default)]
struct StairOpeningOverlay {
    suppress_masks: Vec<Aabb>,
    replacement_blockers: Vec<Aabb>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Face {
    E,
    W,
    N,
    S,
}

#[derive(Clone, Copy)]
struct Context {
    toward_plate: [f32; 2],
    shaft_plate: [f32; 2],
}

#[derive(Clone, Copy)]
struct ResolvedDoor {
    face: Face,
    tangent: f32,
    width: f32,
    y0: f32,
    y1: f32,
}

#[derive(Clone, Copy)]
struct CorridorFootprint {
    px: f32,
    pz: f32,
}

#[derive(Clone, Copy)]
struct PlatePunch {
    stair_face: Face,
    tangent_local: f32,
    door_half_w: f32,
    y0_local: f32,
    y1_local: f32,
    spx: f32,
    spz: f32,
    spy: f32,
    shx: f32,
    shz: f32,
}

#[derive(Clone, Copy)]
struct CorridorContact {
    corridor_wall: Face,
    y0r: f32,
    y1r: f32,
    z0r: f32,
    z1r: f32,
    x0r: f32,
    x1r: f32,
    hole_along_z: bool,
}

#[derive(Clone, Copy)]
struct HoleYZ {
    z0: f32,
    z1: f32,
    y0: f32,
    y1: f32,
}

#[derive(Clone, Copy)]
struct HoleXY {
    x0: f32,
    x1: f32,
    y0: f32,
    y1: f32,
}

#[derive(Clone)]
struct StairShaftSpec {
    px: f32,
    pz: f32,
    sx: f32,
    sy_plate: f32,
    sz: f32,
    bottom_y: f32,
    storey_count: usize,
    storey_spacing: f32,
    entry_contexts: Vec<Option<Context>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildingDoc {
    world_origin: Option<[f32; 3]>,
    floor_refs: Vec<FloorRef>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FloorRef {
    level_index: u32,
    floor_doc_id: String,
}

#[derive(Deserialize, Clone)]
struct FloorDoc {
    objects: Vec<PlacedObject>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PlacedObject {
    prefab_id: String,
    position: [f32; 3],
    scale: Option<[f32; 3]>,
    rotation: Option<[f32; 4]>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StairWellDef {
    entry_opening: Option<OpeningDef>,
    ground_entry_opening: Option<OpeningDef>,
    secondary_entry_opening: Option<OpeningDef>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OpeningDef {
    face: Option<String>,
    tangent_offset_along_wall_m: Option<f32>,
    width_m: Option<f32>,
    height_m: Option<f32>,
    center_y_m: Option<f32>,
}

fn parse_face(value: Option<String>) -> Option<Face> {
    match value.as_deref() {
        Some("e") => Some(Face::E),
        Some("w") => Some(Face::W),
        Some("n") => Some(Face::N),
        Some("s") => Some(Face::S),
        _ => None,
    }
}

fn overlaps(min_a: [f32; 3], max_a: [f32; 3], min_b: [f32; 3], max_b: [f32; 3]) -> bool {
    !(max_a[0] <= min_b[0]
        || min_a[0] >= max_b[0]
        || max_a[1] <= min_b[1]
        || min_a[1] >= max_b[1]
        || max_a[2] <= min_b[2]
        || min_a[2] >= max_b[2])
}

fn vertical_overlap_body(feet_y: f32, body_h: f32, mn: &[f32; 3], mx: &[f32; 3]) -> bool {
    let y0 = feet_y;
    let y1 = feet_y + body_h;
    y1 > mn[1] + 1e-4 && y0 < mx[1] - 1e-4
}

fn round_plan_key(px: f32, pz: f32) -> String {
    let rx = (px * 100.0).round() / 100.0;
    let rz = (pz * 100.0).round() / 100.0;
    format!("{rx:.2},{rz:.2}")
}

fn is_stair_prefab(prefab_id: &str) -> bool {
    let p = prefab_id.to_ascii_lowercase();
    p.contains("stair_well") || p.contains("stairwell")
}

fn is_corridor_like(prefab_id: &str) -> bool {
    let p = prefab_id.to_ascii_lowercase();
    p.contains("corridor") || p.contains("lobby") || p.contains("hall")
}

fn classify_prefab(prefab_id: &str) -> &'static str {
    let p = prefab_id.to_ascii_lowercase();
    if p.contains("corridor") || p.contains("lobby") || p.contains("hall") {
        "corridor"
    } else if p.contains("apartment") || p.contains("unit") {
        "unit"
    } else if p.contains("stair") || p.contains("elev") || p.contains("core") {
        "core"
    } else {
        "misc"
    }
}

fn corridor_footprints(doc: &FloorDoc) -> Vec<CorridorFootprint> {
    let mut out = Vec::new();
    for obj in &doc.objects {
        if !is_corridor_like(&obj.prefab_id) {
            continue;
        }
        out.push(CorridorFootprint {
            px: obj.position[0],
            pz: obj.position[2],
        });
    }
    out
}

fn pick_face_toward_point(px: f32, pz: f32, tx: f32, tz: f32) -> Face {
    let dx = tx - px;
    let dz = tz - pz;
    if dx.abs() >= dz.abs() {
        if dx >= 0.0 {
            Face::E
        } else {
            Face::W
        }
    } else if dz >= 0.0 {
        Face::N
    } else {
        Face::S
    }
}

fn shaft_door_toward_point(
    shaft_px: f32,
    shaft_pz: f32,
    doc: &FloorDoc,
    plate_cx: f32,
    plate_cz: f32,
) -> [f32; 2] {
    let corridors = corridor_footprints(doc);
    if corridors.is_empty() {
        return [plate_cx, plate_cz];
    }
    let mut best = corridors[0];
    let mut best_d2 = f32::INFINITY;
    for corridor in corridors {
        let dx = corridor.px - shaft_px;
        let dz = corridor.pz - shaft_pz;
        let d2 = dx * dx + dz * dz;
        if d2 < best_d2 {
            best_d2 = d2;
            best = corridor;
        }
    }
    [best.px, best.pz]
}

fn clamp_tangent(face: Face, tang: f32, door_half_w: f32, sx: f32, sz: f32) -> f32 {
    let vlen_z = (sz - 2.0 * WT).max(0.05);
    let vlen_x = (sx - 2.0 * WT).max(0.05);
    let m = 0.02;
    if matches!(face, Face::E | Face::W) {
        let lo = -vlen_z * 0.5 + door_half_w + m;
        let hi = vlen_z * 0.5 - door_half_w - m;
        tang.clamp(lo, hi)
    } else {
        let lo = -vlen_x * 0.5 + door_half_w + m;
        let hi = vlen_x * 0.5 - door_half_w - m;
        tang.clamp(lo, hi)
    }
}

fn face_from_context(context: Option<Context>) -> Face {
    match context {
        Some(ctx) => pick_face_toward_point(
            ctx.shaft_plate[0],
            ctx.shaft_plate[1],
            ctx.toward_plate[0],
            ctx.toward_plate[1],
        ),
        None => Face::E,
    }
}

fn opening_for_scope<'a>(def: &'a StairWellDef, scope: &str) -> Option<&'a OpeningDef> {
    if scope == "ground" {
        def.ground_entry_opening
            .as_ref()
            .or(def.entry_opening.as_ref())
    } else {
        def.entry_opening.as_ref()
    }
}

fn resolve_primary_door(
    opening: Option<&OpeningDef>,
    context: Option<Context>,
    sx: f32,
    sy: f32,
    sz: f32,
) -> Option<ResolvedDoor> {
    let authored = opening?;
    let hy = sy * 0.5;
    let inner_wall_h = (sy - 2.0 * WT).max(0.08);
    let y_wall_bottom = -hy + WT;
    let band_height = SHAFT_GROUND_DOOR_BAND_M.min(inner_wall_h).max(0.55);
    let max_door_h = band_height - SHAFT_DOOR_SILL - 0.06;
    let width = authored.width_m.unwrap_or(SHAFT_DOUBLE_DOOR_W).max(0.65);
    let height = authored
        .height_m
        .unwrap_or(SHAFT_DOUBLE_DOOR_H)
        .clamp(0.65, max_door_h.max(0.65));
    let face = parse_face(authored.face.clone()).unwrap_or_else(|| face_from_context(context));
    let tangent = clamp_tangent(
        face,
        authored.tangent_offset_along_wall_m.unwrap_or(0.0),
        width * 0.5,
        sx,
        sz,
    );
    let center_min = y_wall_bottom + SHAFT_DOOR_SILL + height * 0.5;
    let center_max = y_wall_bottom + band_height - 0.04 - height * 0.5;
    let authored_center = authored
        .center_y_m
        .unwrap_or(y_wall_bottom + SHAFT_DOOR_SILL + height * 0.5)
        .clamp(center_min.min(center_max), center_min.max(center_max));
    let mut y0 = authored_center - height * 0.5;
    let mut y1 = authored_center + height * 0.5;
    if y0 > y_wall_bottom {
        y1 -= y0 - y_wall_bottom;
        y0 = y_wall_bottom;
    }
    Some(ResolvedDoor {
        face,
        tangent,
        width,
        y0,
        y1,
    })
}

fn resolve_secondary_door(
    def: &StairWellDef,
    primary: Option<ResolvedDoor>,
    sx: f32,
    sy: f32,
    sz: f32,
) -> Option<ResolvedDoor> {
    let authored = def.secondary_entry_opening.as_ref()?;
    let base = primary?;
    let hy = sy * 0.5;
    let inner_wall_h = (sy - 2.0 * WT).max(0.08);
    let y_wall_bottom = -hy + WT;
    let width = authored.width_m.unwrap_or(base.width).max(0.65);
    let face = parse_face(authored.face.clone()).unwrap_or(Face::S);
    let tangent = clamp_tangent(
        face,
        authored.tangent_offset_along_wall_m.unwrap_or(0.0),
        width * 0.5,
        sx,
        sz,
    );
    let (y0, y1) = normalize_stair_door_vertical_span(
        y_wall_bottom,
        y_wall_bottom + inner_wall_h,
        y_wall_bottom,
        y_wall_bottom + inner_wall_h,
    );
    Some(ResolvedDoor {
        face,
        tangent,
        width,
        y0,
        y1,
    })
}

fn normalize_stair_door_vertical_span(
    y_min: f32,
    y_max: f32,
    raw_y0: f32,
    raw_y1: f32,
) -> (f32, f32) {
    let mut y0 = raw_y0.min(raw_y1).max(y_min);
    let mut y1 = raw_y0.max(raw_y1).min(y_max);
    if y1 < y0 + 0.52 {
        let mid = (y0 + y1) * 0.5;
        y0 = (mid - 0.28).max(y_min);
        y1 = (mid + 0.28).min(y_max);
    }
    if y0 > y_min {
        let shift_down = y0 - y_min;
        y0 = y_min;
        y1 = (y1 - shift_down).min(y_max).max(y0 + 0.52);
    }
    (y0, y1)
}

fn push_box(out: &mut Vec<Aabb>, min: [f32; 3], max: [f32; 3]) {
    if max[0] <= min[0] + 1e-4 || max[1] <= min[1] + 1e-4 || max[2] <= min[2] + 1e-4 {
        return;
    }
    out.push(Aabb { min, max });
}

fn push_wall_constant_x_with_holes(
    out: &mut Vec<Aabb>,
    x_center: f32,
    thickness: f32,
    z_min: f32,
    z_max: f32,
    y_lo: f32,
    y_hi: f32,
    holes: &[HoleYZ],
) {
    if holes.is_empty() {
        push_box(
            out,
            [x_center - thickness * 0.5, y_lo, z_min],
            [x_center + thickness * 0.5, y_hi, z_max],
        );
        return;
    }
    let mut y_levels = vec![y_lo, y_hi];
    for h in holes {
        y_levels.push(h.y0.min(h.y1).max(y_lo));
        y_levels.push(h.y0.max(h.y1).min(y_hi));
    }
    y_levels.sort_by(|a, b| a.partial_cmp(b).unwrap());
    y_levels.dedup_by(|a, b| (*a - *b).abs() < 1e-4);
    for yi in 0..(y_levels.len().saturating_sub(1)) {
        let y0 = y_levels[yi];
        let y1 = y_levels[yi + 1];
        if y1 <= y0 + 1e-4 {
            continue;
        }
        let mut intervals: Vec<(f32, f32)> = holes
            .iter()
            .filter(|h| h.y0.min(h.y1) < y1 - 1e-4 && h.y0.max(h.y1) > y0 + 1e-4)
            .map(|h| (h.z0.min(h.z1).max(z_min), h.z0.max(h.z1).min(z_max)))
            .filter(|(a, b)| *b > *a + 1e-4)
            .collect();
        if intervals.is_empty() {
            push_box(
                out,
                [x_center - thickness * 0.5, y0, z_min],
                [x_center + thickness * 0.5, y1, z_max],
            );
            continue;
        }
        intervals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let mut cursor = z_min;
        let mut cur = intervals[0];
        for next in intervals.into_iter().skip(1) {
            if next.0 <= cur.1 + 0.02 {
                cur.1 = cur.1.max(next.1);
            } else {
                if cur.0 > cursor + 1e-4 {
                    push_box(
                        out,
                        [x_center - thickness * 0.5, y0, cursor],
                        [x_center + thickness * 0.5, y1, cur.0],
                    );
                }
                cursor = cur.1;
                cur = next;
            }
        }
        if cur.0 > cursor + 1e-4 {
            push_box(
                out,
                [x_center - thickness * 0.5, y0, cursor],
                [x_center + thickness * 0.5, y1, cur.0],
            );
        }
        cursor = cursor.max(cur.1);
        if z_max > cursor + 1e-4 {
            push_box(
                out,
                [x_center - thickness * 0.5, y0, cursor],
                [x_center + thickness * 0.5, y1, z_max],
            );
        }
    }
}

fn push_wall_constant_z_with_holes(
    out: &mut Vec<Aabb>,
    z_center: f32,
    thickness: f32,
    x_min: f32,
    x_max: f32,
    y_lo: f32,
    y_hi: f32,
    holes: &[HoleXY],
) {
    if holes.is_empty() {
        push_box(
            out,
            [x_min, y_lo, z_center - thickness * 0.5],
            [x_max, y_hi, z_center + thickness * 0.5],
        );
        return;
    }
    let mut y_levels = vec![y_lo, y_hi];
    for h in holes {
        y_levels.push(h.y0.min(h.y1).max(y_lo));
        y_levels.push(h.y0.max(h.y1).min(y_hi));
    }
    y_levels.sort_by(|a, b| a.partial_cmp(b).unwrap());
    y_levels.dedup_by(|a, b| (*a - *b).abs() < 1e-4);
    for yi in 0..(y_levels.len().saturating_sub(1)) {
        let y0 = y_levels[yi];
        let y1 = y_levels[yi + 1];
        if y1 <= y0 + 1e-4 {
            continue;
        }
        let mut intervals: Vec<(f32, f32)> = holes
            .iter()
            .filter(|h| h.y0.min(h.y1) < y1 - 1e-4 && h.y0.max(h.y1) > y0 + 1e-4)
            .map(|h| (h.x0.min(h.x1).max(x_min), h.x0.max(h.x1).min(x_max)))
            .filter(|(a, b)| *b > *a + 1e-4)
            .collect();
        if intervals.is_empty() {
            push_box(
                out,
                [x_min, y0, z_center - thickness * 0.5],
                [x_max, y1, z_center + thickness * 0.5],
            );
            continue;
        }
        intervals.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
        let mut cursor = x_min;
        let mut cur = intervals[0];
        for next in intervals.into_iter().skip(1) {
            if next.0 <= cur.1 + 0.02 {
                cur.1 = cur.1.max(next.1);
            } else {
                if cur.0 > cursor + 1e-4 {
                    push_box(
                        out,
                        [cursor, y0, z_center - thickness * 0.5],
                        [cur.0, y1, z_center + thickness * 0.5],
                    );
                }
                cursor = cur.1;
                cur = next;
            }
        }
        if cur.0 > cursor + 1e-4 {
            push_box(
                out,
                [cursor, y0, z_center - thickness * 0.5],
                [cur.0, y1, z_center + thickness * 0.5],
            );
        }
        cursor = cursor.max(cur.1);
        if x_max > cursor + 1e-4 {
            push_box(
                out,
                [cursor, y0, z_center - thickness * 0.5],
                [x_max, y1, z_center + thickness * 0.5],
            );
        }
    }
}

fn build_shaft_wall_mask(
    world_x: f32,
    world_y: f32,
    world_z: f32,
    sx: f32,
    sy: f32,
    sz: f32,
    face: Face,
) -> Aabb {
    let hx = sx * 0.5;
    let hy = sy * 0.5;
    let hz = sz * 0.5;
    let inner_wall_h = (sy - 2.0 * WT).max(0.08);
    let y0 = world_y + (-hy + WT);
    let y1 = y0 + inner_wall_h;
    let vlen_x = (sx - 2.0 * WT).max(0.05);
    let vlen_z = (sz - 2.0 * WT).max(0.05);
    match face {
        Face::E => Aabb {
            min: [world_x + hx - WT, y0, world_z - vlen_z * 0.5],
            max: [world_x + hx, y1, world_z + vlen_z * 0.5],
        },
        Face::W => Aabb {
            min: [world_x - hx, y0, world_z - vlen_z * 0.5],
            max: [world_x - hx + WT, y1, world_z + vlen_z * 0.5],
        },
        Face::N => Aabb {
            min: [world_x - vlen_x * 0.5, y0, world_z + hz - WT],
            max: [world_x + vlen_x * 0.5, y1, world_z + hz],
        },
        Face::S => Aabb {
            min: [world_x - vlen_x * 0.5, y0, world_z - hz],
            max: [world_x + vlen_x * 0.5, y1, world_z - hz + WT],
        },
    }
}

fn build_corridor_wall_mask(
    world_x: f32,
    world_y: f32,
    world_z: f32,
    sx: f32,
    sy: f32,
    sz: f32,
    face: Face,
) -> Aabb {
    let hx = sx * 0.5;
    let hz = sz * 0.5;
    let vh = (sy - 2.0 * WT).max(0.05);
    let y0 = world_y - vh * 0.5;
    let y1 = world_y + vh * 0.5;
    let vlen_x = (sx - 2.0 * WT).max(0.05);
    let vlen_z = (sz - 2.0 * WT).max(0.05);
    match face {
        Face::E => Aabb {
            min: [world_x + hx - WT, y0, world_z - vlen_z * 0.5],
            max: [world_x + hx, y1, world_z + vlen_z * 0.5],
        },
        Face::W => Aabb {
            min: [world_x - hx, y0, world_z - vlen_z * 0.5],
            max: [world_x - hx + WT, y1, world_z + vlen_z * 0.5],
        },
        Face::N => Aabb {
            min: [world_x - vlen_x * 0.5, y0, world_z + hz - WT],
            max: [world_x + vlen_x * 0.5, y1, world_z + hz],
        },
        Face::S => Aabb {
            min: [world_x - vlen_x * 0.5, y0, world_z - hz],
            max: [world_x + vlen_x * 0.5, y1, world_z - hz + WT],
        },
    }
}

fn push_shaft_wall_replacements(
    out: &mut Vec<Aabb>,
    world_x: f32,
    world_y: f32,
    world_z: f32,
    sx: f32,
    sy: f32,
    sz: f32,
    doors: &[ResolvedDoor],
    face: Face,
) {
    let hx = sx * 0.5;
    let hy = sy * 0.5;
    let hz = sz * 0.5;
    let inner_wall_h = (sy - 2.0 * WT).max(0.08);
    let y_lo = world_y + (-hy + WT);
    let y_hi = y_lo + inner_wall_h;
    let x_min = world_x - (sx - 2.0 * WT).max(0.05) * 0.5;
    let x_max = world_x + (sx - 2.0 * WT).max(0.05) * 0.5;
    let z_min = world_z - (sz - 2.0 * WT).max(0.05) * 0.5;
    let z_max = world_z + (sz - 2.0 * WT).max(0.05) * 0.5;
    let mut yz_holes = Vec::<HoleYZ>::new();
    let mut xy_holes = Vec::<HoleXY>::new();
    for door in doors.iter().filter(|door| door.face == face) {
        let (door_y0, door_y1) = normalize_stair_door_vertical_span(
            y_lo,
            y_hi - 0.04,
            world_y + door.y0,
            world_y + door.y1,
        );
        if matches!(face, Face::E | Face::W) {
            yz_holes.push(HoleYZ {
                z0: world_z + (door.tangent - door.width * 0.5).max(z_min - world_z),
                z1: world_z + (door.tangent + door.width * 0.5).min(z_max - world_z),
                y0: door_y0,
                y1: door_y1,
            });
        } else {
            xy_holes.push(HoleXY {
                x0: world_x + (door.tangent - door.width * 0.5).max(x_min - world_x),
                x1: world_x + (door.tangent + door.width * 0.5).min(x_max - world_x),
                y0: door_y0,
                y1: door_y1,
            });
        }
    }
    match face {
        Face::E => push_wall_constant_x_with_holes(
            out,
            world_x + hx - WT * 0.5,
            WT,
            z_min,
            z_max,
            y_lo,
            y_hi,
            &yz_holes,
        ),
        Face::W => push_wall_constant_x_with_holes(
            out,
            world_x - hx + WT * 0.5,
            WT,
            z_min,
            z_max,
            y_lo,
            y_hi,
            &yz_holes,
        ),
        Face::N => push_wall_constant_z_with_holes(
            out,
            world_z + hz - WT * 0.5,
            WT,
            x_min,
            x_max,
            y_lo,
            y_hi,
            &xy_holes,
        ),
        Face::S => push_wall_constant_z_with_holes(
            out,
            world_z - hz + WT * 0.5,
            WT,
            x_min,
            x_max,
            y_lo,
            y_hi,
            &xy_holes,
        ),
    }
}

fn corridor_wall_receiving_stair_door(face: Face) -> Face {
    match face {
        Face::E => Face::W,
        Face::W => Face::E,
        Face::N => Face::S,
        Face::S => Face::N,
    }
}

fn apartment_door_templates_for_floor(floor_doc_id: &str) -> &'static [ApartmentDoorTemplate] {
    APARTMENT_DOOR_TEMPLATE_SETS
        .iter()
        .find(|set| set.floor_doc_id == floor_doc_id)
        .map(|set| set.templates)
        .unwrap_or(&[])
}

fn push_apartment_door_holes_for_corridor_wall(
    yz_holes: &mut Vec<HoleYZ>,
    xy_holes: &mut Vec<HoleXY>,
    world_x: f32,
    world_y: f32,
    world_z: f32,
    x_min: f32,
    x_max: f32,
    z_min: f32,
    z_max: f32,
    face: Face,
    floor_base_y: f32,
    templates: &[ApartmentDoorTemplate],
) {
    for door in templates {
        let matches_face = match (face, door.face) {
            (Face::E, 3) => true, // east corridor wall receives west-facing apartment doors
            (Face::W, 2) => true, // west corridor wall receives east-facing apartment doors
            _ => false,
        };
        if !matches_face {
            continue;
        }
        let y0 = floor_base_y + door.feet_y_offset;
        let y1 = y0 + door.panel_h_m;
        if y1 <= world_y - 4.0 || y0 >= world_y + 4.0 {
            continue;
        }
        let z0 = door.hinge_z - door.panel_w_m;
        let z1 = door.hinge_z;
        if matches!(face, Face::E | Face::W) {
            let local_z0 = z0 - world_z;
            let local_z1 = z1 - world_z;
            let hole_z0 = local_z0.max(z_min);
            let hole_z1 = local_z1.min(z_max);
            if hole_z1 <= hole_z0 + 0.1 {
                continue;
            }
            yz_holes.push(HoleYZ {
                z0: world_z + hole_z0,
                z1: world_z + hole_z1,
                y0,
                y1,
            });
        } else {
            let x0 = door.hinge_x - door.panel_w_m;
            let x1 = door.hinge_x;
            let local_x0 = x0 - world_x;
            let local_x1 = x1 - world_x;
            let hole_x0 = local_x0.max(x_min);
            let hole_x1 = local_x1.min(x_max);
            if hole_x1 <= hole_x0 + 0.1 {
                continue;
            }
            xy_holes.push(HoleXY {
                x0: world_x + hole_x0,
                x1: world_x + hole_x1,
                y0,
                y1,
            });
        }
    }
}

fn stair_door_span(face: Face, tangent: f32, door_half_w: f32, sx: f32, sz: f32) -> (f32, f32) {
    let vlen_x = (sx - 2.0 * WT).max(0.05);
    let vlen_z = (sz - 2.0 * WT).max(0.05);
    if matches!(face, Face::E | Face::W) {
        (
            (tangent - door_half_w).max(-vlen_z * 0.5),
            (tangent + door_half_w).min(vlen_z * 0.5),
        )
    } else {
        (
            (tangent - door_half_w).max(-vlen_x * 0.5),
            (tangent + door_half_w).min(vlen_x * 0.5),
        )
    }
}

fn resolve_corridor_contacts(
    corridor: &PlacedObject,
    sx: f32,
    sy: f32,
    sz: f32,
    punches: &[PlatePunch],
) -> Vec<CorridorContact> {
    let cpx = corridor.position[0];
    let cpz = corridor.position[2];
    let cpy = corridor.position[1];
    let chx = sx * 0.5;
    let chz = sz * 0.5;
    let vh = (sy - 2.0 * WT).max(0.05);
    let y_lo = -vh * 0.5;
    let y_hi = vh * 0.5;
    let vlen_z = (sz - 2.0 * WT).max(0.05);
    let vlen_x = (sx - 2.0 * WT).max(0.05);
    let z_min = -vlen_z * 0.5;
    let z_max = vlen_z * 0.5;
    let x_min = -vlen_x * 0.5;
    let x_max = vlen_x * 0.5;
    let mut contacts = Vec::new();
    for p in punches {
        let corridor_wall = corridor_wall_receiving_stair_door(p.stair_face);
        let sx_shaft = 2.0 * p.shx;
        let sz_shaft = 2.0 * p.shz;
        let (span0, span1) = stair_door_span(
            p.stair_face,
            p.tangent_local,
            p.door_half_w,
            sx_shaft,
            sz_shaft,
        );
        let (z0p, z1p, x0p, x1p) = if matches!(p.stair_face, Face::E | Face::W) {
            (
                p.spz + span0,
                p.spz + span1,
                p.spx + p.tangent_local - p.door_half_w,
                p.spx + p.tangent_local + p.door_half_w,
            )
        } else {
            (
                p.spz + p.tangent_local - p.door_half_w,
                p.spz + p.tangent_local + p.door_half_w,
                p.spx + span0,
                p.spx + span1,
            )
        };
        let adjacent = match p.stair_face {
            Face::E => {
                (cpx - chx - (p.spx + p.shx)).abs() < STAIR_CORRIDOR_TOUCH_M && cpx > p.spx - 0.02
            }
            Face::W => {
                (cpx + chx - (p.spx - p.shx)).abs() < STAIR_CORRIDOR_TOUCH_M && cpx < p.spx + 0.02
            }
            Face::N => {
                (cpz - chz - (p.spz + p.shz)).abs() < STAIR_CORRIDOR_TOUCH_M && cpz > p.spz - 0.02
            }
            Face::S => {
                (cpz + chz - (p.spz - p.shz)).abs() < STAIR_CORRIDOR_TOUCH_M && cpz < p.spz + 0.02
            }
        };
        if !adjacent {
            continue;
        }
        let overlap = if matches!(p.stair_face, Face::E | Face::W) {
            (cpz + chz).min(z1p) - (cpz - chz).max(z0p)
        } else {
            (cpx + chx).min(x1p) - (cpx - chx).max(x0p)
        };
        if overlap < 0.14 {
            continue;
        }
        let ya = p.y0_local.min(p.y1_local);
        let yb = p.y0_local.max(p.y1_local);
        let y0w = p.spy + ya - cpy;
        let y1w = p.spy + yb - cpy;
        let (y0r, y1r) = normalize_stair_door_vertical_span(y_lo, y_hi - 0.008, y0w, y1w);
        if matches!(corridor_wall, Face::E | Face::W) {
            let z0r = (z0p.min(z1p) - cpz).max(z_min);
            let z1r = (z0p.max(z1p) - cpz).min(z_max);
            if z1r < z0r + 0.1 || y1r < y0r + 0.45 {
                continue;
            }
            contacts.push(CorridorContact {
                corridor_wall,
                y0r,
                y1r,
                z0r,
                z1r,
                x0r: 0.0,
                x1r: 0.0,
                hole_along_z: true,
            });
        } else {
            let x0r = (x0p.min(x1p) - cpx).max(x_min);
            let x1r = (x0p.max(x1p) - cpx).min(x_max);
            if x1r < x0r + 0.1 || y1r < y0r + 0.45 {
                continue;
            }
            contacts.push(CorridorContact {
                corridor_wall,
                y0r,
                y1r,
                z0r: 0.0,
                z1r: 0.0,
                x0r,
                x1r,
                hole_along_z: false,
            });
        }
    }
    contacts
}

fn lobby_door_centers_along(usable_span: f32) -> Vec<f32> {
    if usable_span < LOBBY_DOUBLE_DOOR_W + 0.28 {
        return vec![0.0];
    }
    let n = ((usable_span / LOBBY_DOUBLE_DOOR_BAY_SPACING).floor() as i32).clamp(1, 4) as usize;
    let mut out = Vec::new();
    for i in 0..n {
        let t = (i + 1) as f32 / (n + 1) as f32;
        out.push((t - 0.5) * usable_span * 0.94);
    }
    out
}

fn push_corridor_wall_replacements(
    out: &mut Vec<Aabb>,
    world_x: f32,
    world_y: f32,
    world_z: f32,
    sx: f32,
    sy: f32,
    sz: f32,
    level_index: u32,
    floor_base_y: f32,
    face: Face,
    contacts: &[CorridorContact],
    apartment_door_templates: &[ApartmentDoorTemplate],
) {
    let hx = sx * 0.5;
    let hz = sz * 0.5;
    let vh = (sy - 2.0 * WT).max(0.05);
    let vlen_x = (sx - 2.0 * WT).max(0.05);
    let vlen_z = (sz - 2.0 * WT).max(0.05);
    let y_lo = world_y - vh * 0.5;
    let y_hi = world_y + vh * 0.5;
    let x_min = world_x - vlen_x * 0.5;
    let x_max = world_x + vlen_x * 0.5;
    let z_min = world_z - vlen_z * 0.5;
    let z_max = world_z + vlen_z * 0.5;
    let mut yz_holes = Vec::<HoleYZ>::new();
    let mut xy_holes = Vec::<HoleXY>::new();
    if level_index == 1 {
        let y0 = y_lo + LOBBY_DOOR_SILL;
        let y1 = (y_hi - 0.05).min(y0 + LOBBY_DOUBLE_DOOR_H);
        if matches!(face, Face::E | Face::W) {
            for zc in lobby_door_centers_along(vlen_z - 0.14) {
                yz_holes.push(HoleYZ {
                    z0: world_z + zc - LOBBY_DOUBLE_DOOR_W * 0.5,
                    z1: world_z + zc + LOBBY_DOUBLE_DOOR_W * 0.5,
                    y0,
                    y1,
                });
            }
        } else {
            for xc in lobby_door_centers_along(vlen_x - 0.14) {
                xy_holes.push(HoleXY {
                    x0: world_x + xc - LOBBY_DOUBLE_DOOR_W * 0.5,
                    x1: world_x + xc + LOBBY_DOUBLE_DOOR_W * 0.5,
                    y0,
                    y1,
                });
            }
        }
    }
    for contact in contacts
        .iter()
        .filter(|contact| contact.corridor_wall == face)
    {
        if contact.hole_along_z {
            yz_holes.push(HoleYZ {
                z0: world_z + contact.z0r,
                z1: world_z + contact.z1r,
                y0: world_y + contact.y0r,
                y1: world_y + contact.y1r,
            });
        } else {
            xy_holes.push(HoleXY {
                x0: world_x + contact.x0r,
                x1: world_x + contact.x1r,
                y0: world_y + contact.y0r,
                y1: world_y + contact.y1r,
            });
        }
    }
    push_apartment_door_holes_for_corridor_wall(
        &mut yz_holes,
        &mut xy_holes,
        world_x,
        world_y,
        world_z,
        x_min,
        x_max,
        z_min,
        z_max,
        face,
        floor_base_y,
        apartment_door_templates,
    );
    match face {
        Face::E => push_wall_constant_x_with_holes(
            out,
            world_x + hx - WT * 0.5,
            WT,
            z_min,
            z_max,
            y_lo,
            y_hi,
            &yz_holes,
        ),
        Face::W => push_wall_constant_x_with_holes(
            out,
            world_x - hx + WT * 0.5,
            WT,
            z_min,
            z_max,
            y_lo,
            y_hi,
            &yz_holes,
        ),
        Face::N => push_wall_constant_z_with_holes(
            out,
            world_z + hz - WT * 0.5,
            WT,
            x_min,
            x_max,
            y_lo,
            y_hi,
            &xy_holes,
        ),
        Face::S => push_wall_constant_z_with_holes(
            out,
            world_z - hz + WT * 0.5,
            WT,
            x_min,
            x_max,
            y_lo,
            y_hi,
            &xy_holes,
        ),
    }
}

fn floor_doc_by_id(id: &str) -> FloorDoc {
    let raw = match id {
        "floor_01_east" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../content/building/floors/floor_01_east.json"
        )),
        "floor_mamutica_ground" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../content/building/floors/floor_mamutica_ground.json"
        )),
        "floor_mamutica_typical" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../content/building/floors/floor_mamutica_typical.json"
        )),
        other => panic!("unsupported floor doc for stair opening collision overlay: {other}"),
    };
    serde_json::from_str(raw).expect("floor doc JSON must parse")
}

fn build_stair_shaft_specs(_building: &BuildingDoc, sorted: &[FloorRef]) -> Vec<StairShaftSpec> {
    let mut map: HashMap<String, StairShaftSpec> = HashMap::new();
    for (ref_index, floor_ref) in sorted.iter().enumerate() {
        let doc = floor_doc_by_id(&floor_ref.floor_doc_id);
        let mut plate_cx = 0.0;
        let mut plate_cz = 0.0;
        for obj in &doc.objects {
            plate_cx += obj.position[0];
            plate_cz += obj.position[2];
        }
        if !doc.objects.is_empty() {
            plate_cx /= doc.objects.len() as f32;
            plate_cz /= doc.objects.len() as f32;
        }
        for obj in &doc.objects {
            if !is_stair_prefab(&obj.prefab_id) {
                continue;
            }
            let scale = obj.scale.unwrap_or([1.0, 1.0, 1.0]);
            let key = round_plan_key(obj.position[0], obj.position[2]);
            let entry = map.entry(key).or_insert_with(|| StairShaftSpec {
                px: obj.position[0],
                pz: obj.position[2],
                sx: scale[0],
                sy_plate: scale[1],
                sz: scale[2],
                bottom_y: (sorted.first().map(|r| r.level_index).unwrap_or(1) as f32 - 1.0)
                    * DEFAULT_BUILDING_FLOOR_SPACING_M
                    + CORE_PY
                    - STOREY_SPACING_M * 0.5,
                storey_count: sorted.len(),
                storey_spacing: DEFAULT_BUILDING_FLOOR_SPACING_M,
                entry_contexts: vec![None; sorted.len()],
            });
            entry.sx = entry.sx.max(scale[0]);
            entry.sy_plate = entry.sy_plate.max(scale[1]);
            entry.sz = entry.sz.max(scale[2]);
            entry.entry_contexts[ref_index] = Some(Context {
                toward_plate: shaft_door_toward_point(
                    obj.position[0],
                    obj.position[2],
                    &doc,
                    plate_cx,
                    plate_cz,
                ),
                shaft_plate: [obj.position[0], obj.position[2]],
            });
        }
    }
    if let Some(min_level) = sorted.iter().map(|r| r.level_index).min() {
        for spec in map.values_mut() {
            spec.bottom_y = (min_level as f32 - 1.0) * DEFAULT_BUILDING_FLOOR_SPACING_M + CORE_PY
                - STOREY_SPACING_M * 0.5;
        }
    }
    map.into_values().collect()
}

fn build_overlay() -> StairOpeningOverlay {
    let building: BuildingDoc = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/building/mammoth.json"
    )))
    .expect("building JSON must parse");
    let stairwell: StairWellDef = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../content/elevator/stairwell.json"
    )))
    .expect("stairwell JSON must parse");
    let mut overlay = StairOpeningOverlay::default();
    let world_origin = building.world_origin.unwrap_or([0.0, 0.0, 0.0]);
    let mut sorted = building.floor_refs.clone();
    sorted.sort_by_key(|r| r.level_index);
    let shaft_specs = build_stair_shaft_specs(&building, &sorted);

    for spec in &shaft_specs {
        for i in 0..spec.storey_count {
            let scope = if i == 0 { "ground" } else { "typical" };
            let primary = resolve_primary_door(
                opening_for_scope(&stairwell, scope),
                spec.entry_contexts[i],
                spec.sx,
                spec.sy_plate,
                spec.sz,
            );
            let secondary =
                resolve_secondary_door(&stairwell, primary, spec.sx, spec.sy_plate, spec.sz);
            let mut faces = Vec::<Face>::new();
            let mut doors = Vec::<ResolvedDoor>::new();
            if let Some(primary) = primary {
                faces.push(primary.face);
                doors.push(primary);
            }
            if let Some(secondary) = secondary {
                faces.push(secondary.face);
                doors.push(secondary);
            }
            if doors.is_empty() {
                continue;
            }
            let world_x = world_origin[0] + spec.px;
            let world_y = world_origin[1]
                + spec.bottom_y
                + STOREY_SPACING_M * 0.5
                + i as f32 * spec.storey_spacing;
            let world_z = world_origin[2] + spec.pz;
            for face in faces {
                overlay.suppress_masks.push(build_shaft_wall_mask(
                    world_x,
                    world_y,
                    world_z,
                    spec.sx,
                    spec.sy_plate,
                    spec.sz,
                    face,
                ));
                push_shaft_wall_replacements(
                    &mut overlay.replacement_blockers,
                    world_x,
                    world_y,
                    world_z,
                    spec.sx,
                    spec.sy_plate,
                    spec.sz,
                    &doors,
                    face,
                );
            }
        }
    }

    for floor_ref in &sorted {
        let doc = floor_doc_by_id(&floor_ref.floor_doc_id);
        let apartment_door_templates = apartment_door_templates_for_floor(&floor_ref.floor_doc_id);
        let mut plate_cx = 0.0;
        let mut plate_cz = 0.0;
        for obj in &doc.objects {
            plate_cx += obj.position[0];
            plate_cz += obj.position[2];
        }
        if !doc.objects.is_empty() {
            plate_cx /= doc.objects.len() as f32;
            plate_cz /= doc.objects.len() as f32;
        }
        let scope = if floor_ref.level_index == 1 {
            "ground"
        } else {
            "typical"
        };
        let mut punches = Vec::<PlatePunch>::new();
        for obj in &doc.objects {
            if !is_stair_prefab(&obj.prefab_id) {
                continue;
            }
            let scale = obj.scale.unwrap_or([1.0, 1.0, 1.0]);
            let context = Context {
                toward_plate: shaft_door_toward_point(
                    obj.position[0],
                    obj.position[2],
                    &doc,
                    plate_cx,
                    plate_cz,
                ),
                shaft_plate: [obj.position[0], obj.position[2]],
            };
            if let Some(primary) = resolve_primary_door(
                opening_for_scope(&stairwell, scope),
                Some(context),
                scale[0],
                scale[1],
                scale[2],
            ) {
                punches.push(PlatePunch {
                    stair_face: primary.face,
                    tangent_local: primary.tangent,
                    door_half_w: primary.width * 0.5,
                    y0_local: primary.y0,
                    y1_local: primary.y1,
                    spx: obj.position[0],
                    spz: obj.position[2],
                    spy: obj.position[1],
                    shx: scale[0] * 0.5,
                    shz: scale[2] * 0.5,
                });
                if let Some(secondary) =
                    resolve_secondary_door(&stairwell, Some(primary), scale[0], scale[1], scale[2])
                {
                    punches.push(PlatePunch {
                        stair_face: secondary.face,
                        tangent_local: secondary.tangent,
                        door_half_w: secondary.width * 0.5,
                        y0_local: secondary.y0,
                        y1_local: secondary.y1,
                        spx: obj.position[0],
                        spz: obj.position[2],
                        spy: obj.position[1],
                        shx: scale[0] * 0.5,
                        shz: scale[2] * 0.5,
                    });
                }
            }
        }

        for obj in &doc.objects {
            if classify_prefab(&obj.prefab_id) != "corridor" || obj.rotation.is_some() {
                continue;
            }
            let scale = obj.scale.unwrap_or([1.0, 1.0, 1.0]);
            let contacts = resolve_corridor_contacts(obj, scale[0], scale[1], scale[2], &punches);
            if contacts.is_empty() {
                continue;
            }
            let world_x = world_origin[0] + obj.position[0];
            let floor_base_y = world_origin[1]
                + (floor_ref.level_index as f32 - 1.0) * DEFAULT_BUILDING_FLOOR_SPACING_M;
            let world_y = world_origin[1]
                + (floor_ref.level_index as f32 - 1.0) * DEFAULT_BUILDING_FLOOR_SPACING_M
                + obj.position[1];
            let world_z = world_origin[2] + obj.position[2];
            let mut faces = Vec::<Face>::new();
            for contact in &contacts {
                if !faces.contains(&contact.corridor_wall) {
                    faces.push(contact.corridor_wall);
                }
            }
            for face in faces {
                overlay.suppress_masks.push(build_corridor_wall_mask(
                    world_x, world_y, world_z, scale[0], scale[1], scale[2], face,
                ));
                push_corridor_wall_replacements(
                    &mut overlay.replacement_blockers,
                    world_x,
                    world_y,
                    world_z,
                    scale[0],
                    scale[1],
                    scale[2],
                    floor_ref.level_index,
                    floor_base_y,
                    face,
                    &contacts,
                    apartment_door_templates,
                );
            }
        }
    }

    overlay
}

fn overlay() -> &'static StairOpeningOverlay {
    static OVERLAY: OnceLock<StairOpeningOverlay> = OnceLock::new();
    OVERLAY.get_or_init(build_overlay)
}

pub fn suppress_static_blocker(mn: [f32; 3], mx: [f32; 3]) -> bool {
    overlay()
        .suppress_masks
        .iter()
        .any(|mask| overlaps(mn, mx, mask.min, mask.max))
}

pub fn append_runtime_replacement_blockers(
    x0: f32,
    x1: f32,
    z0: f32,
    z1: f32,
    feet_y: f32,
    body_h: f32,
    out: &mut Vec<([f32; 3], [f32; 3])>,
) {
    for aabb in &overlay().replacement_blockers {
        if x1 < aabb.min[0] || x0 > aabb.max[0] || z1 < aabb.min[2] || z0 > aabb.max[2] {
            continue;
        }
        if !vertical_overlap_body(feet_y, body_h, &aabb.min, &aabb.max) {
            continue;
        }
        out.push((aabb.min, aabb.max));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blocks(aabbs: &[Aabb], x: f32, y: f32, z: f32) -> bool {
        aabbs.iter().any(|aabb| {
            x >= aabb.min[0]
                && x <= aabb.max[0]
                && y >= aabb.min[1]
                && y <= aabb.max[1]
                && z >= aabb.min[2]
                && z <= aabb.max[2]
        })
    }

    #[test]
    fn off_origin_west_stair_opening_stays_clear_through_full_body_height() {
        let mut out = Vec::new();
        push_shaft_wall_replacements(
            &mut out,
            6.16,
            4.816842105263158,
            46.0,
            8.35,
            STOREY_SPACING_M,
            13.95,
            &[ResolvedDoor {
                face: Face::W,
                tangent: -5.177351451279119,
                width: 2.469149911172827,
                y0: -1.3989473684210527,
                y1: 1.2689473684210528,
            }],
            Face::W,
        );

        let wall_x = 6.16 - 8.35 * 0.5 + WT * 0.5;
        assert!(
            !blocks(
                &out,
                wall_x,
                4.816842105263158 - 0.06,
                46.0 - 5.177351451279119
            ),
            "west stair doorway center should be open at off-origin shaft positions",
        );
        assert!(
            blocks(&out, wall_x, 4.816842105263158 - 0.06, 46.0 + 4.2),
            "solid wall away from the doorway must remain blocked",
        );
    }

    #[test]
    fn off_origin_corridor_south_contact_cuts_opening_in_rebuilt_wall() {
        let mut out = Vec::new();
        push_corridor_wall_replacements(
            &mut out,
            20.0,
            4.816842105263158,
            50.0,
            4.4,
            3.05,
            3.8,
            7,
            18.94736842105263,
            Face::N,
            &[CorridorContact {
                corridor_wall: Face::N,
                y0r: -1.33,
                y1r: 1.33,
                z0r: 0.0,
                z1r: 0.0,
                x0r: -1.2,
                x1r: 1.2,
                hole_along_z: false,
            }],
            &[],
        );

        let wall_z = 50.0 + 3.8 * 0.5 - WT * 0.5;
        assert!(
            !blocks(&out, 20.0, 4.816842105263158, wall_z),
            "south stair entry contact should cut an opening in off-origin corridor walls",
        );
        assert!(
            blocks(&out, 20.0 + 1.8, 4.816842105263158, wall_z),
            "corridor wall outside the opening should stay blocked",
        );
    }

    #[test]
    fn off_origin_west_stair_contact_resolves_corridor_opening_span() {
        let corridor = PlacedObject {
            prefab_id: "corridor_main".to_string(),
            position: [15.8, 4.816842105263158, 50.0],
            scale: Some([4.4, 3.05, 3.8]),
            rotation: None,
        };
        let contacts = resolve_corridor_contacts(
            &corridor,
            4.4,
            3.05,
            3.8,
            &[PlatePunch {
                stair_face: Face::W,
                tangent_local: 0.0,
                door_half_w: 1.2,
                y0_local: -1.33,
                y1_local: 1.33,
                spx: 20.0,
                spz: 50.0,
                spy: 4.816842105263158,
                shx: 2.0,
                shz: 2.0,
            }],
        );

        assert_eq!(
            contacts.len(),
            1,
            "west stair contact should produce one corridor wall opening"
        );
        let contact = contacts[0];
        assert!(matches!(contact.corridor_wall, Face::E));
        assert!(
            contact.hole_along_z,
            "west stair doorway should cut along corridor Z span"
        );
        assert!(
            contact.z0r < -0.5 && contact.z1r > 0.5,
            "opening span should stay centered on the doorway"
        );
        assert!(
            contact.y0r <= -1.33 + 1e-4,
            "opening should reach the corridor floor band without a sill lip"
        );
        assert!(
            contact.y1r >= 1.32,
            "opening should preserve nearly full authored door height"
        );
    }

    #[test]
    fn raised_stair_thresholds_get_pulled_flush_in_shaft_rebuilds() {
        let mut out = Vec::new();
        let world_x = 6.16_f32;
        let world_y = 4.816842_f32;
        let world_z = 46.0_f32;
        let sx = 8.35_f32;
        let sy = STOREY_SPACING_M;
        let sz = 13.95_f32;
        push_shaft_wall_replacements(
            &mut out,
            world_x,
            world_y,
            world_z,
            sx,
            sy,
            sz,
            &[ResolvedDoor {
                face: Face::W,
                tangent: -5.1773515,
                width: 2.46915,
                y0: -1.2269473,
                y1: 1.4409474,
            }],
            Face::W,
        );

        let wall_x = world_x - sx * 0.5 + WT * 0.5;
        let floor_band_y = world_y - sy * 0.5 + WT + 0.06;
        assert!(
            !blocks(&out, wall_x, floor_band_y, world_z - 5.1773515),
            "shaft rebuild should clear the doorway all the way down to the stair floor band",
        );
    }

    #[test]
    fn raised_stair_thresholds_get_pulled_flush_in_corridor_contacts() {
        let corridor = PlacedObject {
            prefab_id: "corridor_main".to_string(),
            position: [15.8, 4.816842105263158, 50.0],
            scale: Some([4.4, 3.05, 3.8]),
            rotation: None,
        };
        let contacts = resolve_corridor_contacts(
            &corridor,
            4.4,
            3.05,
            3.8,
            &[PlatePunch {
                stair_face: Face::W,
                tangent_local: 0.0,
                door_half_w: 1.2,
                y0_local: -1.16,
                y1_local: 1.5,
                spx: 20.0,
                spz: 50.0,
                spy: 4.816842105263158,
                shx: 2.0,
                shz: 2.0,
            }],
        );

        assert_eq!(
            contacts.len(),
            1,
            "raised stair punch should still produce one corridor opening"
        );
        let contact = contacts[0];
        assert!(
            contact.y0r <= -1.415 + 1e-4,
            "corridor opening should be flush to the local floor band"
        );
        assert!(
            contact.y1r >= 1.24,
            "corridor opening should retain enough headroom after flush normalization"
        );
    }

    #[test]
    fn corridor_east_wall_rebuild_preserves_west_facing_apartment_door_opening() {
        let mut out = Vec::new();
        let world_x = -0.125_f32;
        let world_y = 4.816842_f32;
        let world_z = -28.1775_f32;
        let scale_x = 4.4_f32;
        let scale_y = 3.05_f32;
        let scale_z = 43.64_f32;
        let floor_base_y = DEFAULT_BUILDING_FLOOR_SPACING_M;
        push_corridor_wall_replacements(
            &mut out,
            world_x,
            world_y,
            world_z,
            scale_x,
            scale_y,
            scale_z,
            2,
            floor_base_y,
            Face::E,
            &[],
            &[ApartmentDoorTemplate {
                template_id: "unit_e_008|w",
                unit_id: "unit_e_008",
                face: 3,
                hinge_x: 1.925,
                hinge_z: -15.17,
                feet_y_offset: 0.23,
                panel_w_m: 1.26,
                panel_h_m: 2.06,
            }],
        );
        let wall_x = world_x + scale_x * 0.5 - WT * 0.5;
        assert!(
            !blocks(&out, wall_x, floor_base_y + 0.35, -15.8),
            "rebuilt east corridor wall should preserve apartment door opening",
        );
        assert!(
            blocks(&out, wall_x, floor_base_y + 0.35, -18.5),
            "rebuilt east corridor wall away from apartment door should stay blocked",
        );
    }
}

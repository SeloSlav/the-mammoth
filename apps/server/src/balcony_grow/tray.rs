use spacetimedb::{Identity, ReducerContext, ScheduleAt, Table, TimeDuration};

use crate::apartments::{self, apartment_unit, apartment_unit_decor, ApartmentUnitDecor};
use crate::inventory::{find_item_in_stash_slot, remove_stash_item_quantity};
use crate::inventory_models::APARTMENT_STASH_KIND_GROW_TRAY;
use crate::items_catalog::BalconyGrowSpec;
use crate::pose::player_pose;

use super::tables::*;

#[derive(Clone)]
pub(super) struct ResolvedGrowTrayPlacement {
    pub(super) tray_id: String,
    pub(super) pos_x: f32,
    pub(super) pos_z: f32,
}

fn authored_grow_tray_layout_fraction(tray_id: &str) -> Option<(f32, f32)> {
    let (fx, fz) = match tray_id {
        "8e48c06b-c005-4425-9fdc-a527e67168ee" => (0.843_385_3, -0.026_789_22),
        "825bca36-e9b8-4fa7-9883-2d57ba0ebe04" => (0.927_365_1, -0.026_789_22),
        "5a8db793-b6e6-4266-bd96-8d53a1452e91" => (0.843_385_3, 0.095_401_47),
        "74e853d2-62cb-42b3-b740-c8ea51c6179f" => (0.927_365_1, 0.095_401_47),
        "8cf090f7-acfa-460d-8360-f8c48a233557" => (0.843_385_3, 0.217_592_17),
        "74725d62-5270-4d8f-a1fe-4e08f9215e0d" => (0.927_365_1, 0.217_592_17),
        "f7b5698a-e331-48bf-b5f2-aab0002b037d" => (0.927_365_1, 0.339_782_86),
        "8b770390-544f-4a40-aaa3-ec34d9ed66a7" => (0.843_385_3, 0.339_782_86),
        _ => return None,
    };
    Some((fx, fz))
}

fn content_grow_tray_covered_by_decor(decor_rows: &[ApartmentUnitDecor], x: f32, z: f32) -> bool {
    const DEDUPE_XZ_M: f32 = 0.4;
    let dedupe_sq = DEDUPE_XZ_M * DEDUPE_XZ_M;
    decor_rows.iter().any(|d| {
        let dx = d.pos_x - x;
        let dz = d.pos_z - z;
        dx * dx + dz * dz <= dedupe_sq
    })
}

pub(super) fn resolve_tray_placements(
    ctx: &ReducerContext,
    unit_key: &str,
) -> Vec<ResolvedGrowTrayPlacement> {
    let mut decor_rows: Vec<_> = ctx
        .db
        .apartment_unit_decor()
        .iter()
        .filter(|d| d.unit_key == unit_key && d.model_rel_path.contains(GROW_TRAY_MODEL_SUFFIX))
        .collect();
    decor_rows.sort_by(|a, b| a.decor_id.cmp(&b.decor_id));
    let mut out: Vec<ResolvedGrowTrayPlacement> = decor_rows
        .iter()
        .map(|d| ResolvedGrowTrayPlacement {
            tray_id: grow_tray_id_for_decor_id(d.decor_id),
            pos_x: d.pos_x,
            pos_z: d.pos_z,
        })
        .collect();

    let Some(unit) = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
    else {
        return out;
    };
    for tray_id in BALCONY_GROW_TRAY_BUILTIN_IDS {
        let (fx, fz) = authored_grow_tray_layout_fraction(tray_id).unwrap_or((0.0, 0.0));
        let (pos_x, pos_z) = apartments::authored_placed_item_world_xz(&unit, fx, fz);
        if content_grow_tray_covered_by_decor(&decor_rows, pos_x, pos_z) {
            continue;
        }
        out.push(ResolvedGrowTrayPlacement {
            tray_id: tray_id.to_string(),
            pos_x,
            pos_z,
        });
    }
    out
}

fn feet_inside_unit_grow_tray_slack(
    unit: &apartments::ApartmentUnit,
    x: f32,
    y: f32,
    z: f32,
) -> bool {
    let s = GROW_TRAY_UNIT_HULL_SLACK_XZ;
    x >= unit.bound_min_x - s
        && x <= unit.bound_max_x + s
        && z >= unit.bound_min_z - s
        && z <= unit.bound_max_z + s
        && y >= unit.bound_min_y - 0.05
        && y <= unit.bound_max_y + 2.45
}

fn feet_vertical_ok(unit_floor_y: f32, y: f32) -> bool {
    y >= unit_floor_y - INTERACT_FEET_Y_BELOW_SLACK_M
        && y <= unit_floor_y + INTERACT_FEET_Y_ABOVE_SLACK_M
}

pub(super) fn pose_near_tray(
    unit: &apartments::ApartmentUnit,
    pose_x: f32,
    pose_y: f32,
    pose_z: f32,
    tray_x: f32,
    tray_z: f32,
) -> bool {
    if !feet_inside_unit_grow_tray_slack(unit, pose_x, pose_y, pose_z) {
        return false;
    }
    let dx = pose_x - tray_x;
    let dz = pose_z - tray_z;
    if dx * dx + dz * dz > TRAY_INTERACT_RADIUS_SQ {
        return false;
    }
    feet_vertical_ok(unit.foot_y, pose_y)
}

pub(super) fn tray_row(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
) -> Option<BalconyGrowTray> {
    ctx.db
        .balcony_grow_tray()
        .row_key()
        .find(&tray_row_key(unit_key, tray_id))
}

pub(super) fn player_near_tray(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
) -> Result<(), String> {
    let sender = ctx.sender();
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())
        .ok_or_else(|| "unknown unit".to_string())?;
    let owner = unit.owner.ok_or_else(|| "unit not claimed".to_string())?;
    if owner != sender {
        return Err("not your apartment".to_string());
    }
    let placement = resolve_tray_placements(ctx, unit_key)
        .into_iter()
        .find(|p| p.tray_id == tray_id)
        .ok_or_else(|| "unknown tray".to_string())?;
    let pose = ctx
        .db
        .player_pose()
        .identity()
        .find(&sender)
        .ok_or_else(|| "missing pose".to_string())?;
    if !pose_near_tray(
        &unit,
        pose.x,
        pose.y,
        pose.z,
        placement.pos_x,
        placement.pos_z,
    ) {
        return Err("move closer to the grow tray".to_string());
    }
    Ok(())
}

pub(super) fn fertilizer_present(ctx: &ReducerContext, unit_key: &str, tray_id: &str) -> bool {
    let stash_key = grow_tray_stash_key(unit_key, tray_id);
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string());
    let Some(owner) = unit.and_then(|u| u.owner) else {
        return false;
    };
    find_item_in_stash_slot(
        ctx,
        owner,
        stash_key.as_str(),
        BALCONY_GROW_FERTILIZER_STASH_SLOT,
    )
    .map(|i| i.def_id == BALCONY_GROW_FERTILIZER_DEF_ID)
    .unwrap_or(false)
}

pub(super) fn try_consume_tray_substrate(
    ctx: &ReducerContext,
    owner: Identity,
    unit_key: &str,
    tray_id: &str,
) -> bool {
    let stash_key = grow_tray_stash_key(unit_key, tray_id);
    let Some(item) = find_item_in_stash_slot(
        ctx,
        owner,
        stash_key.as_str(),
        BALCONY_GROW_FERTILIZER_STASH_SLOT,
    ) else {
        return false;
    };
    if item.def_id != BALCONY_GROW_FERTILIZER_DEF_ID {
        return false;
    }
    remove_stash_item_quantity(
        ctx,
        owner,
        stash_key.as_str(),
        BALCONY_GROW_FERTILIZER_STASH_SLOT,
        1,
    )
    .is_ok()
}

pub(super) fn lights_on_for_unit(ctx: &ReducerContext, unit_key: &str) -> bool {
    ctx.db
        .balcony_grow_light()
        .unit_key()
        .find(&unit_key.to_string())
        .map(|r| r.lights_on != 0)
        .unwrap_or(true)
}

pub(crate) fn grow_speed_modifier(
    lights_on: bool,
    fertilizer_present: bool,
    water_liters: f32,
) -> f32 {
    let mut m = 1.0_f32;
    if lights_on {
        m += BALCONY_GROW_LIGHT_BONUS;
    }
    if fertilizer_present {
        m += BALCONY_GROW_FERTILIZER_BONUS;
    }
    let capped = water_liters.min(BALCONY_GROW_TRAY_MAX_WATER_L);
    let water_steps = (capped / 0.5).floor() as i32;
    m += water_steps as f32 * BALCONY_GROW_WATER_BONUS_PER_HALF_L;
    m
}

pub(super) fn random_grow_days(ctx: &ReducerContext, spec: &BalconyGrowSpec) -> u8 {
    let min = spec.grow_days_min;
    let max = spec.grow_days_max.max(min);
    if min == max {
        return min;
    }
    let span = (max - min) as u64 + 1;
    let roll = (ctx.timestamp.to_micros_since_unix_epoch() as u64) % span;
    min + roll as u8
}

pub(super) fn compute_target_days(
    ctx: &ReducerContext,
    unit_key: &str,
    tray_id: &str,
    spec: &BalconyGrowSpec,
) -> u8 {
    let days = random_grow_days(ctx, spec);
    let tray = tray_row(ctx, unit_key, tray_id);
    let water = tray.map(|t| t.water_liters).unwrap_or(0.0);
    let modifier = grow_speed_modifier(lights_on_for_unit(ctx, unit_key), false, water).max(0.01);
    ((days as f32 / modifier).ceil() as u8).max(1)
}

pub(crate) fn start_balcony_grow_schedule(ctx: &ReducerContext) {
    let table = ctx.db.balcony_grow_tick_schedule();
    if table.iter().next().is_some() {
        return;
    }
    let _ = table.insert(BalconyGrowTickSchedule {
        scheduled_id: 0,
        scheduled_at: ScheduleAt::Interval(TimeDuration::from_micros(tick_interval_micros())),
    });
}

pub(crate) fn ensure_balcony_grow_for_owner(ctx: &ReducerContext, owner: Identity) {
    let Some(unit_key) = apartments::claimed_unit_key_for_owner(ctx, owner) else {
        return;
    };
    ensure_balcony_grow_for_unit(ctx, unit_key.as_str());
}

pub(crate) fn ensure_balcony_grow_for_unit(ctx: &ReducerContext, unit_key: &str) {
    ensure_grow_light_row(ctx, unit_key);
    let tray_placements = resolve_tray_placements(ctx, unit_key);
    let tray_table = ctx.db.balcony_grow_tray();
    for placement in tray_placements {
        let row_key = tray_row_key(unit_key, placement.tray_id.as_str());
        if let Some(mut row) = tray_table.row_key().find(&row_key) {
            if (row.pos_x - placement.pos_x).abs() > 0.02
                || (row.pos_z - placement.pos_z).abs() > 0.02
            {
                row.pos_x = placement.pos_x;
                row.pos_z = placement.pos_z;
                tray_table.row_key().update(row);
            }
            continue;
        }
        let _ = tray_table.insert(BalconyGrowTray {
            row_key,
            unit_key: unit_key.to_string(),
            tray_id: placement.tray_id,
            pos_x: placement.pos_x,
            pos_z: placement.pos_z,
            water_liters: 0.0,
            dry_ticks: 0,
        });
    }
}

fn ensure_grow_light_row(ctx: &ReducerContext, unit_key: &str) {
    let table = ctx.db.balcony_grow_light();
    if table.unit_key().find(&unit_key.to_string()).is_some() {
        return;
    }
    let _ = table.insert(BalconyGrowLight {
        unit_key: unit_key.to_string(),
        lights_on: 1,
    });
}

pub(crate) fn grow_tray_stash_near_sender(
    ctx: &ReducerContext,
    stash_key: &str,
) -> Option<(Identity, String)> {
    let sep = stash_key.rfind('#')?;
    let unit_key = stash_key.get(..sep)?;
    let tail = stash_key.get(sep + 1..)?;
    let tray_id = tail.strip_prefix("grow_tray:")?;
    ensure_balcony_grow_for_unit(ctx, unit_key);
    if tray_row(ctx, unit_key, tray_id).is_none() {
        return None;
    }
    player_near_tray(ctx, unit_key, tray_id).ok()?;
    let unit = ctx
        .db
        .apartment_unit()
        .unit_key()
        .find(&unit_key.to_string())?;
    let owner = unit.owner?;
    Some((owner, unit_key.to_string()))
}

pub(crate) fn grow_tray_stash_kind() -> &'static str {
    APARTMENT_STASH_KIND_GROW_TRAY
}

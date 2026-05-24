//! Ranged fire — ammo consumption + authoritative LOS hit-scan (walls + firearm widened swing doors via static solids + dynamic rows).

use spacetimedb::{Identity, ReducerContext, Table};

use crate::auth;
use crate::hitscan;
use crate::inventory::{self, inventory_item};
use crate::inventory_models::ItemLocation;
use crate::movement::player_input;
use crate::player_vitals;
use crate::pose::{bump_firearm_presentation_seq, player_pose};
use crate::world_sound;

const RANGED_COOLDOWN_MICROS: i64 = 160_000;

#[spacetimedb::table(public, accessor = player_firearm_cooldown)]
pub struct PlayerFirearmCooldown {
    #[primary_key]
    pub identity: Identity,
    pub last_shot_micros: i64,
}

pub fn ensure_player_firearm_cooldown_row(ctx: &ReducerContext, id: Identity) {
    if ctx
        .db
        .player_firearm_cooldown()
        .identity()
        .find(&id)
        .is_none()
    {
        let _ = ctx
            .db
            .player_firearm_cooldown()
            .insert(PlayerFirearmCooldown {
                identity: id,
                last_shot_micros: 0,
            });
    }
}

fn ammo_def_for_weapon(weapon: &str) -> Option<&'static str> {
    match weapon {
        "pistol" => Some("ammo-9mm"),
        "shotgun-coach" => Some("ammo-shotgun-shell"),
        _ => None,
    }
}

fn ranged_damage(weapon: &str) -> f32 {
    match weapon {
        "pistol" => 20.0,
        "shotgun-coach" => 11.0,
        _ => 0.0,
    }
}

fn is_ranged_weapon(def_id: &str) -> bool {
    ammo_def_for_weapon(def_id).is_some() && ranged_damage(def_id) > 0.0
}

fn consume_first_owned_stack_one(ctx: &ReducerContext, owner: Identity, def: &str) -> bool {
    for row in ctx.db.inventory_item().iter() {
        let ok = match &row.location {
            ItemLocation::Inventory(d) => d.owner_id == owner,
            ItemLocation::Hotbar(d) => d.owner_id == owner,
            _ => false,
        };
        if ok && row.def_id == def && row.quantity >= 1 {
            let _ = inventory::remove_player_item_quantity(ctx, row.instance_id, 1);
            return true;
        }
    }
    false
}

/// Client-sent camera-forward direction `(aim_dir_xyz)` in world units. Server normalizes +
/// clamps wild vectors before consuming ammo — **must** precede projectile math.
#[spacetimedb::reducer]
pub fn submit_firearm_shot(ctx: &ReducerContext, aim_dir_x: f32, aim_dir_y: f32, aim_dir_z: f32) {
    if let Err(e) = auth::ensure_gameplay_unlocked(ctx) {
        log::debug!("submit_firearm_shot blocked: {e}");
        return;
    }
    let id = ctx.sender();
    if player_vitals::is_player_dead(ctx, id) {
        return;
    }
    let Some(pose) = ctx.db.player_pose().identity().find(&id) else {
        return;
    };
    let Some(weapon_def_id) = crate::combat_stub::active_hotbar_item_def_id(ctx, id) else {
        return;
    };
    if !is_ranged_weapon(&weapon_def_id) {
        return;
    }

    let yaw = ctx
        .db
        .player_input()
        .identity()
        .find(&id)
        .map(|r| r.aim_yaw)
        .unwrap_or(pose.yaw);

    if hitscan::sanitize_client_aim_dir(yaw, aim_dir_x, aim_dir_y, aim_dir_z).is_none() {
        return;
    }

    let ammo_def = ammo_def_for_weapon(&weapon_def_id).expect("validated");
    ensure_player_firearm_cooldown_row(ctx, id);
    let now_us = ctx.timestamp.to_micros_since_unix_epoch();
    let Some(mut cd) = ctx.db.player_firearm_cooldown().identity().find(&id) else {
        return;
    };
    if now_us - cd.last_shot_micros < RANGED_COOLDOWN_MICROS {
        return;
    }
    if !consume_first_owned_stack_one(ctx, id, ammo_def) {
        return;
    }

    cd.last_shot_micros = now_us;
    ctx.db.player_firearm_cooldown().identity().update(cd);

    bump_firearm_presentation_seq(ctx, id);

    let gun_sound_variation = if weapon_def_id == "shotgun-coach" {
        world_sound::FIREARM_VARIATION_SHOTGUN
    } else {
        world_sound::FIREARM_VARIATION_PISTOL
    };
    world_sound::emit_gunfire_at(ctx, pose.x, pose.y + 1.02, pose.z, id, gun_sound_variation);

    let hits = hitscan::firearm_hitscan_weapon(
        ctx,
        id,
        &pose,
        weapon_def_id.as_str(),
        aim_dir_x,
        aim_dir_y,
        aim_dir_z,
    );

    for h in hits {
        player_vitals::apply_damage(ctx, h.identity, h.damage);
        world_sound::emit_melee_flesh_hit_at(
            ctx,
            h.ix,
            h.iy,
            h.iz,
            id,
            world_sound::flesh_impact_variation_for_hit(h.headshot, true, ""),
        );
    }

    let npc_hits = hitscan::firearm_hitscan_npcs(
        ctx,
        &pose,
        weapon_def_id.as_str(),
        aim_dir_x,
        aim_dir_y,
        aim_dir_z,
    );
    for h in npc_hits {
        crate::npc::apply_npc_damage(ctx, h.npc_id, h.damage);
        world_sound::emit_melee_flesh_hit_at(
            ctx,
            h.ix,
            h.iy,
            h.iz,
            id,
            world_sound::flesh_impact_variation_for_hit(h.headshot, true, ""),
        );
    }
}

//! Ranged fire — consumes ammo stacks, hits use `resolve_melee_hit` cone with custom reach/damage.

use spacetimedb::{Identity, ReducerContext, Table};

use crate::auth;
use crate::apartments;
use crate::combat_stub;
use crate::dropped_item;
use crate::inventory::{self, inventory_item};
use crate::inventory_models::ItemLocation;
use crate::player_vitals;
use crate::pose::player_pose;
use crate::world_sound;

pub(crate) const RANGED_HIT_REACH_M: f32 = 45.0;

const RANGED_COOLDOWN_MICROS: i64 = 160_000;

#[spacetimedb::table(public, accessor = player_firearm_cooldown)]
pub struct PlayerFirearmCooldown {
    #[primary_key]
    pub identity: Identity,
    pub last_shot_micros: i64,
}

pub fn ensure_player_firearm_cooldown_row(ctx: &ReducerContext, id: Identity) {
    if ctx.db.player_firearm_cooldown().identity().find(&id).is_none() {
        let _ = ctx.db.player_firearm_cooldown().insert(PlayerFirearmCooldown {
            identity: id,
            last_shot_micros: 0,
        });
    }
}

fn ammo_def_for_weapon(weapon: &str) -> Option<&'static str> {
    match weapon {
        "rusty_pistol" | "pistol" => Some("ammo_9mm"),
        "rifle" => Some("ammo_9mm"),
        "shotgun_coach" => Some("ammo_shotgun_shell"),
        _ => None,
    }
}

fn ranged_damage(weapon: &str) -> f32 {
    match weapon {
        "rusty_pistol" | "pistol" => 20.0,
        "rifle" => 36.0,
        "shotgun_coach" => 11.0,
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

#[spacetimedb::reducer]
pub fn submit_firearm_shot(ctx: &ReducerContext) {
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
    let Some(weapon_def_id) = combat_stub::active_hotbar_item_def_id(ctx, id) else {
        return;
    };
    if !is_ranged_weapon(&weapon_def_id) {
        return;
    }
    let dmg = ranged_damage(&weapon_def_id);
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

    world_sound::emit_gunfire_at(ctx, pose.x, pose.y + 1.02, pose.z, id);

    if let Some(hit) = combat_stub::resolve_melee_hit(
        ctx,
        id,
        pose.x,
        pose.y,
        pose.z,
        pose.yaw,
        &weapon_def_id,
        Some(RANGED_HIT_REACH_M),
        Some(dmg),
    ) {
        let killed = player_vitals::apply_damage(ctx, hit.target, hit.damage);
        world_sound::emit_melee_flesh_hit_at(ctx, hit.impact_x, hit.impact_y, hit.impact_z, id);
        if killed {
            dropped_item::scatter_carrier_inventory_at_death(ctx, hit.target);
            apartments::on_player_killed_cancel_claim(ctx, hit.target);
        }
    }
}

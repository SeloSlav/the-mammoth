import { getMammothItemDef, mammothItemDefSupportsHotbarInstantConsume } from "../inventory/mammothItemCatalog";

/** True when `def_id` is a catalog consumable with authored `consumeOnUse` vitals (server `consume_hotbar_item`). */
export function itemDefIdSupportsHotbarInstantConsume(defId: string): boolean {
  return mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef(defId));
}

/**
 * Which consume SFX to play — mirrors `apps/server/src/world_sound.rs` `hotbar_consume_sound_kind`
 * (drink when hydration delta strictly dominates hunger).
 */
export function hotbarInstantConsumeSoundProfile(defId: string): "eat" | "drink" {
  const def = getMammothItemDef(defId);
  const c = def?.consumeOnUse;
  if (!c) return "eat";
  const dh = c.hungerDelta ?? 0;
  const dy = c.hydrationDelta ?? 0;
  return dy > dh ? "drink" : "eat";
}

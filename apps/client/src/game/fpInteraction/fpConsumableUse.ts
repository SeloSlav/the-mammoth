import { getMammothItemDef, mammothItemDefSupportsHotbarInstantConsume } from "../../inventory/mammothItemCatalog";

/** True when `def_id` is a catalog consumable with authored `consumeOnUse` vitals (server `consume_hotbar_item`). */
export function itemDefIdSupportsHotbarInstantConsume(defId: string): boolean {
  return mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef(defId));
}

/** Which consume SFX to play — authored per item in the shared catalog. */
export function hotbarInstantConsumeSoundProfile(defId: string): "eat" | "drink" | "smoke" {
  const def = getMammothItemDef(defId);
  return def?.hotbarConsumeSound ?? "eat";
}

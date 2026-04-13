import { getMammothItemDef, mammothItemDefSupportsHotbarInstantConsume } from "../inventory/mammothItemCatalog";

/** True when `def_id` is a catalog consumable with authored `consumeOnUse` vitals (server `consume_hotbar_item`). */
export function itemDefIdSupportsHotbarInstantConsume(defId: string): boolean {
  return mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef(defId));
}

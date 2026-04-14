/**
 * Pure types for the JSON item catalog — no JSON imports so dependents (e.g. drag/drop types)
 * resolve reliably in the TS program even when `mammothItemCatalog.ts` pulls content shards.
 */

export type ItemCategory = "weapon" | "tool" | "material" | "placeable" | "consumable";

/** One recipe line: same `itemId` string as inventory `def_id`. */
export type MammothConstructionIngredient = {
  itemId: string;
  quantity: number;
};

export type MammothConstruction = {
  buildTimeSecs: number;
  materials: MammothConstructionIngredient[];
};

/** Matches catalog `consumeOnUse` — hotbar instant use (see server `instant_hotbar_consume_vital_deltas`). */
export type MammothConsumeOnUse = {
  healthDelta?: number;
  hungerDelta?: number;
  hydrationDelta?: number;
};

/** Authored SFX for hotbar instant consume. */
export type MammothHotbarConsumeSound = "eat" | "drink";

export type MammothItemDef = {
  id: string;
  displayName: string;
  description: string;
  category: ItemCategory;
  maxStack: number;
  construction: MammothConstruction | null;
  /** Present when this def supports hotbar instant consume (V key). */
  consumeOnUse: MammothConsumeOnUse | null;
  /** Authored consume one-shot for this item. */
  hotbarConsumeSound: MammothHotbarConsumeSound | null;
  iconUrl: string;
};

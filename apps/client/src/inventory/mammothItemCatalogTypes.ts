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

export type MammothItemDef = {
  id: string;
  displayName: string;
  description: string;
  category: ItemCategory;
  maxStack: number;
  construction: MammothConstruction | null;
  iconUrl: string;
};

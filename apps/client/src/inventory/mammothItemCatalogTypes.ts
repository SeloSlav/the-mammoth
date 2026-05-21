/**
 * Pure types for the JSON item catalog — no JSON imports so dependents (e.g. drag/drop types)
 * resolve reliably in the TS program even when `mammothItemCatalog.ts` pulls content shards.
 */

export type ItemCategory =
  | "weapon"
  | "tool"
  | "resource"
  | "ammo"
  | "utility"
  | "placeable"
  | "consumable";

/** One recipe line: same `itemId` string as inventory `def_id`. */
export type MammothConstructionIngredient = {
  itemId: string;
  quantity: number;
};

export type MammothConstruction = {
  buildTimeSecs: number;
  materials: MammothConstructionIngredient[];
  /** Catalog `id`s — tool or weapon rows the player carries; not consumed when crafting. */
  requiredTools: string[];
  /** When set, one craft grants this many of the output stack (e.g. ammo batches). */
  outputQuantity?: number;
};

/** Matches catalog `consumeOnUse` — hotbar instant use (see server `instant_hotbar_consume_vital_deltas`). */
export type MammothConsumeOnUse = {
  healthDelta?: number;
  hungerDelta?: number;
  hydrationDelta?: number;
};

export type MammothMeleeCombat = {
  damage: number;
};

/** Authored SFX for hotbar instant consume. */
export type MammothHotbarConsumeSound = "eat" | "drink" | "smoke";

/** Reusable bottle / canteen — partial sips; see server `water_container`. */
export type MammothWaterContainer = {
  capacityLiters: number;
  sipLiters: number;
  hydrationPerLiter: number;
};

/** Balcony grow-op plant metadata on seed/cutting resource rows. */
export type MammothBalconyGrow = {
  harvestDefId: string;
  growDaysMin: number;
  growDaysMax: number;
  stageTint: string;
  stageScale: number;
};

export type MammothItemDef = {
  id: string;
  displayName: string;
  description: string;
  category: ItemCategory;
  maxStack: number;
  meleeCombat: MammothMeleeCombat | null;
  construction: MammothConstruction | null;
  /** Present when this def supports hotbar instant consume (V key). */
  consumeOnUse: MammothConsumeOnUse | null;
  /** Authored consume one-shot for this item. */
  hotbarConsumeSound: MammothHotbarConsumeSound | null;
  /** Present for reusable water bottles (tool category). */
  waterContainer: MammothWaterContainer | null;
  /** Present on plantable balcony seeds/cuttings/spores. */
  balconyGrow: MammothBalconyGrow | null;
  balconyGrowFertilizer: boolean;
  iconUrl: string;
};

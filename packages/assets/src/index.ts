/** Prefab and material registry keys (authoring). Full tables live under /content. */
export const placeholderPrefabs = [
  "stair_core_a",
  "apartment_unit_small_a",
  "corridor_segment_a",
  "lobby_entry_a",
  "kiosk_a",
] as const;

export type { ModelAssetKey, ModelRef } from "./modelRef.js";
export type { IModelLoadRegistry, ModelInstantiationResult } from "./modelLoadRegistry.js";
export { NoopModelLoadRegistry } from "./modelLoadRegistry.js";
export {
  MAMMOTH_CATALOG_GLB_FALLBACK_URI,
  MAMMOTH_CATALOG_GLB_PRIMARY_URI,
  MAMMOTH_CATALOG_GLB_SEARCH_ROOTS,
  MAMMOTH_STATIC_MODEL_BASE,
  mammothCatalogGlbCandidates,
  balconyGrowStageGlb,
  balconyGrowCatalogPreviewGlb,
  isBalconyGrowCatalogPreviewDef,
} from "./catalogGlb.js";
export {
  getMammothDroppedWorldTargetMaxDimM,
  MAMMOTH_DROPPED_WORLD_DEFAULT_TARGET_MAX_DIM_M,
  MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M,
} from "./droppedWorldVisual.js";

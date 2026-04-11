/** Prefab and material registry keys (authoring). Full tables live under /content. */
export const placeholderPrefabs = [
  "stair_core_a",
  "apartment_unit_small_a",
  "corridor_segment_a",
  "lobby_entry_a",
  "kiosk_a",
] as const;

export type { ModelAssetKey, ModelRef } from "./modelRef.js";
export type {
  IModelLoadRegistry,
  LoadedModelHandle,
  ModelInstantiationResult,
} from "./modelLoadRegistry.js";
export { NoopModelLoadRegistry } from "./modelLoadRegistry.js";

/**
 * Stable asset key for registries (no URL construction here — loaders resolve paths).
 * TODO: align with `/static/models/...` Vite public dir conventions.
 */
export type ModelAssetKey =
  | "player/fp_arms_placeholder"
  | "player/tp_body_placeholder"
  | "weapons/crowbar"
  | "weapons/knife"
  | "weapons/pistol"
  | "weapons/rifle";

/** Future: LOD variants, material overrides. */
export type ModelRef =
  | { kind: "none" }
  | { kind: "primitive_fallback" }
  | { kind: "gltf"; key: ModelAssetKey; uri: string };

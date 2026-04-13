/**
 * Stable asset key for registries (no URL construction here — loaders resolve paths).
 *
 * **On disk (client):** `apps/client/public/static/models/...` → served as `/static/models/...`.
 * - Weapons: `.../weapons/<id>.glb`
 * - FP hands: `.../fp/hands/<file>.glb`
 */
export type ModelAssetKey =
  | "player/fp_arms_placeholder"
  | "player/fp_hand_right"
  | "player/tp_body_placeholder"
  | "weapons/crowbar"
  | "weapons/knife"
  | "weapons/srbosjek"
  | "weapons/baseball_bat";

/** Future: LOD variants, material overrides. */
export type ModelRef =
  | { kind: "none" }
  | { kind: "gltf"; key: ModelAssetKey; uri: string };

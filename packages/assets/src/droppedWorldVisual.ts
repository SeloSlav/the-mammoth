/**
 * Ground-plane Y (m) for lobby world-loot anchors: client places the bottom of the fitted mesh here.
 * Keep equal to `WORLD_LOOT_Y_GROUND_FLOOR_M` in `apps/server/src/dropped_item.rs` (lobby walk slab top ≈0.20).
 */
export const MAMMOTH_WORLD_LOOT_GROUND_PLANE_Y_M = 0.2 as const;

/**
 * World pickup mesh sizing (meters). Dropped-item GLBs are uniformly scaled so their
 * axis-aligned bounding-box **longest edge** matches these values, then shifted so the
 * bottom of the AABB sits on the placement plane.
 *
 * **Reference scale** (see `apps/client/src/game/fpPhysics/fpPlayerCollision.ts`):
 * standing player capsule height ≈ **1.78 m**; typical interior door clear height in this
 * stack is ≈ **1.8–2.0 m**. Pickups should read as handheld / floor props relative to that.
 *
 * Add an entry for every `def_id` that can appear in `dropped_item` / world loot.
 */

/** Longest edge of the world-axis-aligned bounds after fit (meters). */
const BY_DEF_ID: Readonly<Record<string, number>> = {
  // Melee — longest edge (overall tool length)
  knife: 0.32,
  crowbar: 0.68,
  srbosjek: 0.52,
  "baseball-bat": 0.86,

  // Ranged
  pistol: 0.2,
  "shotgun-coach": 0.62,

  // Ammunition / small bundles (pile visual, not a rifle round at 1:1 life size)
  "ammo-9mm": 0.1,
  "ammo-shotgun-shell": 0.14,

  // Materials / craft
  "scrap-metal": 0.38,
  "chemical-stock": 0.12,
  cigarettes: 0.18,

  // Keys / hardware
  "door-lock": 0.085,

  // Consumables
  apple: 0.15,
  "water-bottle": 0.34,
  rakija: 0.31,
  "field-rations": 0.2,
  "iodine-tablets": 0.06,
  "bandage-roll": 0.13,
  "caffeine-gum": 0.08,

  // Tools
  "pipe-wrench": 0.32,
  "claw-hammer": 0.38,
  screwdriver: 0.22,
  multimeter: 0.19,
  "prybar-light": 0.38,

  // Placeables (until dedicated world mesh; keep under human height)
  campfire: 0.45,
  "brick-oven": 0.65,
  "reloading-press": 0.55,
  "gunsmith-workbench": 0.85,
};

/** When `def_id` is missing from the table (new item or typo). */
export const MAMMOTH_DROPPED_WORLD_DEFAULT_TARGET_MAX_DIM_M = 0.32;

/**
 * Target longest AABB edge (meters) for world visualization of this catalog id.
 */
export function getMammothDroppedWorldTargetMaxDimM(defId: string): number {
  const v = BY_DEF_ID[defId];
  return typeof v === "number" && v > 0 ? v : MAMMOTH_DROPPED_WORLD_DEFAULT_TARGET_MAX_DIM_M;
}

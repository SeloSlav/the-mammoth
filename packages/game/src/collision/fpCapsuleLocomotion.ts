/** Capsule locomotion tuning — shared by client FP resolver and server NPC authority. */

export const COLLISION_EPS = 0.0015;
export const STEP_IGNORE_BELOW_FEET_M = 0.2;
export const FP_CHARACTER_MAX_HORIZONTAL_SUBSTEP_M = 0.18;
export const SLIDE_PASSES = 4;
export const DEPENETRATE_PASSES = 8;

/** Match `packages/engine` `FP_WALK_STEP_UP_MARGIN`. */
export const FP_WALK_STEP_UP_MARGIN_M = 0.82;

/**
 * Minimum blocker bottom above feet before head-clearance clamp applies (client vertical resolver).
 * Sync server `HEAD_CLEARANCE_MIN_CEILING_BOTTOM_ABOVE_FEET_M`.
 */
export const HEAD_CLEARANCE_MIN_CEILING_BOTTOM_ABOVE_FEET_M = 0.5;

/** Extra pad around capsule move segment when querying dynamic blockers (m). */
export const LOCOMOTION_BLOCKER_QUERY_PAD_M = 0.35;

/** Ignore megablock static slabs thinner than this (m) — matches server shard filter. */
export const LOCOMOTION_STATIC_MIN_BLOCKER_HEIGHT_M = 0.04;

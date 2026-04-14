/**
 * Canonical elevator **exterior swing + cab-outside + hoistway front** collision tuning.
 *
 * Server literals live in `apps/server/src/elevator/collision_tuning.rs`. Parity is enforced by
 * `elevatorCollisionTuning.parity.test.ts` (Vitest in this package).
 */

export const EXTERIOR_DOOR_W_M = 1.86;
export const EXTERIOR_DOOR_H_M = 2.05;
export const EXTERIOR_DOOR_COLLISION_OPEN_THRESH = 0.88;
export const EXTERIOR_DOOR_ANIM_SPEED = 1.0;
/** Closed swing: static slab only while essentially shut (matches server `EXT_DOOR_SOLID_SLAB_MAX_SWING`). */
export const EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING = 0.025;

export const EXTERIOR_INTERACT_L0 = -0.28;
export const EXTERIOR_INTERACT_L1 = 0.82;
export const EXTERIOR_INTERACT_LZ_PAD = 0.08;
export const EXTERIOR_STRIP_Y0 = 0.05;
export const EXTERIOR_STRIP_Y1 = 2.25;

export const EXTERIOR_COLLISION_L0 = -0.55;
export const EXTERIOR_COLLISION_L1 = 0.92;
export const EXTERIOR_COLLISION_LZ_PAD = 0.18;
export const EXTERIOR_INTERACT_WORLD_RADIUS_M = 1.6;
export const EXTERIOR_INTERACT_WORLD_Y_HALF_M = 1.42;

export const CLOSED_CAB_OUTSIDE_SLAB_IN = 0.28;
export const CLOSED_CAB_OUTSIDE_SLAB_OUT = 1.05;
export const CLOSED_CAB_OUTSIDE_WIDTH_PAD = 0.32;

export const LANDING_FRONT_WALL_SLAB_IN = 0.2;
export const LANDING_FRONT_WALL_SLAB_OUT = 0.34;
export const LANDING_FRONT_WALL_PUSH_OUT = 0.08;

/** Match server `LANDING_FRONT_PASSAGE_HALF_W` (= `EXT_DOOR_W * 0.5 + 0.04`). */
export const LANDING_FRONT_PASSAGE_HALF_W_M = EXTERIOR_DOOR_W_M * 0.5 + 0.04;

/** Dock tolerance for “passage open” gating (server + client collision). */
export const LANDING_PASSAGE_DOCK_Y_TOL_M = 0.5;

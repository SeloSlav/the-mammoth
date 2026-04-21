/**
 * Canonical elevator **exterior swing + cab-outside + hoistway front** collision tuning.
 *
 * Server literals live in `apps/server/src/elevator/collision_tuning.rs`. Parity is enforced by
 * `elevatorCollisionTuning.parity.test.ts` (Vitest in this package).
 */

/** Clear opening width for landing swing + cab sliding doors + hoistway wall cut (m). */
export const EXTERIOR_DOOR_W_M = 1.86;
/** Landing leaf height — closer to hoistway door cut (~2.2 m cap) than cab `DOOR_H` (2.05). */
export const EXTERIOR_DOOR_H_M = 2.22;
/**
 * Hinge line sits slightly inboard of the tangent half-width so the closed leaf covers the wall
 * hole without a wide gap on the jamb side (was 0.06; too much inset).
 */
export const EXTERIOR_DOOR_JAMB_INSET_M = 0.005;
/** `doorY` above landing feet anchor: centers leaf so bottom clears slab by a few cm (not cab `FLOOR_T`). */
export const EXTERIOR_DOOR_CENTER_FEET_CLEAR_M = 0.015;
/**
 * Added to nominal half-panel + feet clear when placing the swing group.
 * Negative shifts the hinge down so added {@link EXTERIOR_DOOR_H_M} reads as more reach toward the corridor floor vs the lintel.
 */
export const EXTERIOR_DOOR_SWING_CENTER_Y_BIAS_M = -0.04;

/** World-space Y offset of landing swing origin above feet anchor (matches clients + editor preview). */
export function exteriorLandingDoorSwingOriginY(panelHM: number): number {
  return panelHM * 0.5 + EXTERIOR_DOOR_CENTER_FEET_CLEAR_M + EXTERIOR_DOOR_SWING_CENTER_Y_BIAS_M;
}
export const EXTERIOR_DOOR_COLLISION_OPEN_THRESH = 0.88;
export const EXTERIOR_DOOR_ANIM_SPEED = 4.5;
/** Closed swing: static slab only while essentially shut (matches server `EXT_DOOR_SOLID_SLAB_MAX_SWING`). */
export const EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING = 0.025;
/**
 * Parked-open leaf collider only arms once the panel is effectively at rest against the jamb.
 * While the door is still swinging, the leaf stays non-solid to avoid random player push-out.
 */
export const EXTERIOR_DOOR_PARKED_COLLISION_MIN_SWING = 0.995;
export const EXTERIOR_DOOR_SWING_MAX_RAD = 1.55;
export const EXTERIOR_DOOR_HINGE_OUTSET = 0.048;
export const EXTERIOR_DOOR_PANEL_HALF_THICK = 0.10;

export const EXTERIOR_INTERACT_L0 = -0.28;
export const EXTERIOR_INTERACT_L1 = 0.82;
export const EXTERIOR_INTERACT_LZ_PAD = 0.08;
export const EXTERIOR_STRIP_Y0 = 0.05;
export const EXTERIOR_STRIP_Y1 = 2.25;

export const EXTERIOR_COLLISION_L0 = -0.55;
export const EXTERIOR_COLLISION_L1 = 0.92;
export const EXTERIOR_COLLISION_LZ_PAD = 0.18;
export const EXTERIOR_INTERACT_WORLD_RADIUS_M = 2.05;
export const EXTERIOR_INTERACT_WORLD_Y_HALF_M = 1.55;

export const CLOSED_CAB_OUTSIDE_SLAB_IN = 0.28;
export const CLOSED_CAB_OUTSIDE_SLAB_OUT = 1.05;
export const CLOSED_CAB_OUTSIDE_WIDTH_PAD = 0.32;

export const LANDING_FRONT_WALL_SLAB_IN = 0.2;
export const LANDING_FRONT_WALL_SLAB_OUT = 0.04;
export const LANDING_FRONT_WALL_PUSH_OUT = 0.08;

/** Match server `LANDING_FRONT_PASSAGE_HALF_W` (= `EXT_DOOR_W * 0.5 + 0.04`). */
export const LANDING_FRONT_PASSAGE_HALF_W_M = EXTERIOR_DOOR_W_M * 0.5 + 0.04;

/** Dock tolerance for “passage open” gating (server + client collision). */
export const LANDING_PASSAGE_DOCK_Y_TOL_M = 0.5;

/** Shared dimensions / tuning for FP elevator cab + HUD (client + tests). */

import { DEFAULT_BUILDING_FLOOR_SPACING_M, EXTERIOR_DOOR_W_M } from "@the-mammoth/world";

/** Clear cab / hoistway door width — matches landing swing `EXTERIOR_DOOR_W_M`. */
export const DOOR_W = EXTERIOR_DOOR_W_M;
export const DOOR_H = 2.05;
export const DOOR_TH = 0.07;
export const DOOR_SLIDE_M = 0.82;
export const CAR_INNER_MARGIN = 0.07;
export const CAR_CEIL_BELOW_SHAFT_TOP = 0.14;
/** Must match server `elevator::CALL_R_XZ` within a few cm (landing pad vs hail reducer). */
export const CALL_RADIUS_XZ = 1.78;
export const CALL_Y_HALF_WINDOW = 2.2;
/**
 * Landing "call" is hidden (and server `elevator_hail` no-ops) when cab feet are this close to
 * that landing's support Y — avoids "call Ground" while the car is already docked there.
 * Must match server `elevator::LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M`.
 */
export const LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M = 0.5;
/**
 * Extra slack (m) when matching **feet Y** to a landing’s support for cab walk-merge gating (crouch /
 * probe noise). Must match server `elevator::WALK_MERGE_FEET_ON_LANDING_EXTRA_SLACK_M`.
 */
export const ELEV_WALK_MERGE_FEET_ON_LANDING_EXTRA_SLACK_M = 0.12;
/**
 * Extra plate-local XZ padding (m) around the cab inner AABB used as the **outer gate** for
 * walk-merge sampling. The landing slab "hole" is padded beyond the cab inner by `SHAFT_PAD` +
 * `punchElevatorHolesInShellRects.holeTrimM` (see `packages/world/src/shaftPlanformClip.ts`),
 * leaving a short XZ band at the doorway threshold where neither the strict cab inner gate nor
 * the corridor shell floor provides support. This padding bridges that seam so riders stepping
 * out of a docked cab keep continuous walk support instead of free-falling into the shaft or
 * snapping to the floor below. The `fpElevCabWalkMergeSupportFeetAllowed` predicate still gates
 * walk-merge to *docked* cars at the player’s feet Y, so only real seam traversal benefits.
 * Must match server `elevator::WALK_MERGE_GATE_XZ_EXTRA_M`.
 */
export const ELEVATOR_WALK_MERGE_GATE_XZ_EXTRA_M = 0.75;
/** Match server `elevator::CAB_ROOF_WALK_MERGE_FEET_BELOW_M`. */
export const ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_BELOW_M = 0.65;
/** Match server `elevator::CAB_ROOF_WALK_MERGE_FEET_ABOVE_M`. */
export const ELEVATOR_CAB_ROOF_WALK_MERGE_FEET_ABOVE_M = 0.45;
/**
 * Above this upward vertical speed (m/s), do not hard-lock feet to the cab (jump must not be eaten).
 * Must match server `elevator::RIDER_LOCK_SKIP_UPWARD_VY_MPS`.
 */
export const ELEVATOR_RIDER_LOCK_SKIP_UPWARD_VY_MPS = 0.85;
/**
 * Max distance **below** authoritative cab feet support (m) while still counting as “on this car”
 * for walk merge, kinematic vy inheritance, rider snap/clamp, and server `player_rider_snap_grip`.
 *
 * **Derived from {@link DEFAULT_BUILDING_FLOOR_SPACING_M}** so fast vertical motion + net/replica
 * lag cannot drop merge for a whole frame (fall-through), while the fraction stays **&lt; 1 storey**
 * so another car one full level away is not pulled in by Y alone (XZ + `geom_top` vs probe still
 * arbitrate walk).
 *
 * Must match server `elevator::RIDER_SNAP_FEET_BELOW_CAB_M` (= `STOREY_SPACING_M * 0.92`).
 */
export const ELEVATOR_SHAFT_VERTICAL_BELOW_CAB_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 0.92;
/**
 * Clearance above inner cab top line `cabFeetY + innerH` (m) for the same predicates.
 * Scales slightly with storey spacing for jump / substep slack.
 *
 * Must match server `elevator::RIDER_SNAP_HEADROOM_ABOVE_CAB_TOP_M` (= `STOREY_SPACING_M * 0.58`).
 */
export const ELEVATOR_SHAFT_VERTICAL_ABOVE_INNER_TOP_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 0.58;
/**
 * Hard cap (m) **above authoritative cab feet Y** for walk / kinematic support merge. Must stay
 * **below** the next landing’s feet height in the same shaft column or players in an empty
 * hoistway snap onto the cabin one level down. Must match server
 * `elevator::WALK_MERGE_FEET_MAX_OFFSET_ABOVE_CAB_FLOOR_M` (= `STOREY_SPACING_M * 0.82`).
 */
export const ELEVATOR_WALK_MERGE_FEET_MAX_OFFSET_ABOVE_CAB_FLOOR_M =
  DEFAULT_BUILDING_FLOOR_SPACING_M * 0.82;
/**
 * Cab interior upright span (m) for default Mamuthica geometry where shaft `sy` equals
 * {@link DEFAULT_BUILDING_FLOOR_SPACING_M}. Matches server `elevator_layout::inner_height()`.
 */
const ELEVATOR_GAMEPLAY_INNER_HEIGHT_M = Math.max(
  1.8,
  DEFAULT_BUILDING_FLOOR_SPACING_M - 2 * 0.11 - 0.14,
);
/**
 * Extra slack above inner cab top for **rider snap / XZ clamp arming** only (not walk merge).
 * Must stay below the next landing so upper floors do not false-trigger on the cab beneath.
 *
 * Must match server `elevator::RIDER_SNAP_GRIP_EXTRA_ABOVE_INNER_M`.
 */
export const ELEVATOR_RIDER_SNAP_GRIP_EXTRA_ABOVE_INNER_M = Math.max(
  0.15,
  DEFAULT_BUILDING_FLOOR_SPACING_M - ELEVATOR_GAMEPLAY_INNER_HEIGHT_M - 0.1,
);
/**
 * Rider floor-snap / XZ clamp **never** arms when feet are this close to the inner ceiling line
 * (`cabFeetY + innerH`) or above — avoids snapping roof standers through to the cab floor.
 * Must match server `elevator::RIDER_SNAP_FLOOR_ATTACH_MAX_FEET_Y_INSET_BELOW_INNER_TOP_M`.
 */
export const ELEVATOR_RIDER_SNAP_FLOOR_ATTACH_MAX_FEET_Y_INSET_BELOW_INNER_TOP_M = 0.1;
/**
 * Foot-center clearance from hoistway inner half extents so the **walk foot circle** stays inside
 * the same XZ box as `mergeWalkTop` (`half − walkFootRadius − ε`). Match server
 * `elevator::CAB_CLAMP_FOOT_CLEAR_M` (= `FOOT_R` + 2cm).
 */
export const ELEVATOR_CLAMP_FOOT_CLEARANCE_M = 0.24;
/**
 * Door-axis inner edge (fraction of half extent) before door slack — match server
 * `elevator::CAB_CLAMP_DOOR_AXIS_INNER_FRAC`.
 */
export const ELEVATOR_CLAMP_DOOR_AXIS_INNER_FRAC = 0.92;
/** Match server `elevator::DOOR_SLACK_FULL_M` / `DOOR_SLACK_START` / `DOOR_SLACK_FULL_OPEN`. */
export const ELEVATOR_CLAMP_DOOR_SLACK_FULL_M = 0.85;
export const ELEVATOR_CLAMP_DOOR_SLACK_START = 0.45;
export const ELEVATOR_CLAMP_DOOR_SLACK_FULL_OPEN = 0.85;
/**
 * Pad (m) around the cab clamp AABB for “still in cab” snap / clamp **gate** — one locomotion step
 * can overshoot slightly; gate must stay true so we still pull back into the hard box.
 * Match server `elevator::RIDER_PHYS_GATE_PAD_M` (~foot radius so one sprint frame still arms clamp).
 */
export const ELEVATOR_CAB_PHYS_GATE_PAD_M = 0.26;
/**
 * Below this door opening (0..1), cab XZ clamp still pulls the rider box closed — avoids popping
 * through a shut door. When open past this, the **door-side pad shell** does not clamp so you can
 * walk off the car through the opening (must match server `elevator::DOOR_EXIT_CLAMP_MIN_OPEN`).
 */
export const ELEVATOR_DOOR_EXIT_CLAMP_MIN_OPEN = 0.22;
/** Door open/close: short blend toward latest net sample (still discrete-ish, feels snappy). */
export const CAB_INTERP_SEC = 0.1;
/**
 * Landing corridor swing: blend duration for replicated `swingOpen01` samples.
 * Server advances this at `movement::TICK_DT` (20 Hz); matching that window hides stair-stepping
 * without adding noticeable lag vs the authoritative animation.
 */
export const EXTERIOR_DOOR_VIS_INTERP_SEC = 0.05;
/**
 * Exponential smoothing rate (1/s) for cab `doorOpen01` + landing `swingOpen01` **visuals** (and
 * apartment instanced doors): chases replica every frame instead of a fixed smoothstep segment
 * that finishes between 20 Hz updates and reads as a mid-swing pause.
 */
export const DOOR_SWING_OPEN01_VIS_SMOOTH_PER_S = 14;

/** Match `apps/server/src/elevator/mod.rs` `MOVE_SPEED_MPS`. */
export const ELEVATOR_MOVE_SPEED_MPS = 3.15;

/** Match `apps/server/src/elevator/mod.rs` `PH_MOVING`. */
export const ELEVATOR_PHASE_MOVING = 2;

/** Raycast / userData tag for in-car floor selector meshes. */
export const FP_ELEV_FLOOR_PICK_UD = "fpElevFloorPick" as const;

export type FpElevFloorPickUserData = {
  [FP_ELEV_FLOOR_PICK_UD]: { shaftKey: string; level: number };
};

/** Raycast / userData tag for exterior landing swing door interaction. */
export const FP_ELEV_EXTERIOR_DOOR_PICK_UD = "fpElevExteriorDoorPick" as const;

export type FpElevExteriorDoorPickUserData = {
  [FP_ELEV_EXTERIOR_DOOR_PICK_UD]: { shaftKey: string; level: number };
};

/** Raycast / userData tag for landing hail buttons outside the cab. */
export const FP_ELEV_LANDING_HAIL_PICK_UD = "fpElevLandingHailPick" as const;

export type FpElevLandingHailPickUserData = {
  [FP_ELEV_LANDING_HAIL_PICK_UD]: { shaftKey: string; level: number };
};

export const FLOOR_BTN_W = 0.12;
export const FLOOR_BTN_H = 0.092;
export const FLOOR_BTN_D = 0.014;
export const FLOOR_GAP = 0.014;
export const FLOOR_COLS = 3;
/** Long enough for diagonal crosshair → panel in wide hoistways. */
export const FLOOR_PICK_MAX_RAY_M = 10.0;

/**
 * Door open (0..1): hallway peek shows pick meshes only above this.
 * In-cab visibility ignores this (matches server `elevator_select_floor`, which only checks cab pose).
 */
export const ELEV_FLOOR_PICK_DOORWAY_VIS_MIN_OPEN = 0.16;
/** Landing crosshair pick requires at least this door opening (in-cab ignores). */
export const ELEV_FLOOR_PICK_DOORWAY_RAY_MIN_OPEN = 0.32;

export const ATLAS_COLS = 5;
export const ATLAS_CELL_W = 64;
export const ATLAS_CELL_H = 48;
/** Shared dimensions / tuning for FP elevator cab + HUD (client + tests). */

import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";

export const DOOR_W = 1.86;
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

/** Match `apps/server/src/elevator.rs` `MOVE_SPEED_MPS`. */
export const ELEVATOR_MOVE_SPEED_MPS = 3.15;

/** Match `apps/server/src/elevator.rs` `PH_MOVING`. */
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
export const ATLAS_ROWS = 4;
export const ATLAS_CELL_W = 64;
export const ATLAS_CELL_H = 48;

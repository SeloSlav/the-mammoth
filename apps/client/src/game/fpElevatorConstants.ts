/** Shared dimensions / tuning for FP elevator cab + HUD (client + tests). */

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

import { LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M } from "./fpElevatorConstants.js";

/**
 * When the replicated/predicted cab feet Y is this close to a landing's support height, we treat the
 * car as already docked there — no "Press E to call this floor" (matches server `elevator_hail` guard).
 */
export function fpElevSuppressLandingHailBecauseCabAtLandingSupport(
  cabFeetWorldY: number,
  landingSupportFeetWorldY: number,
  tolM: number = LANDING_HAIL_SUPPRESS_CAB_Y_TOL_M,
): boolean {
  return Math.abs(cabFeetWorldY - landingSupportFeetWorldY) < tolM;
}

/**
 * Base max distance we correct toward replay in one server pose (~50 ms). Larger errors spread
 * across several updates so we never jump a full accumulated desync in one frame (that was
 * happening after the full-stop no-op path let client/server drift apart).
 */
export const RECONCILE_MAX_CORRECTION_PER_POSE_M = 0.08;

/**
 * At higher walk/sprint caps, the same sub-tick / 20 Hz skew shows up as a larger **meter** error.
 * Without extra budget, `t = 0.08 / corrDist` only closes a big sprint desync over many pose
 * updates, which reads as rubber-banding. Scales with horizontal speed; idle stays at base.
 */
export const RECONCILE_MAX_EXTRA_PER_HORIZONTAL_MPS = 0.012;

/** Beyond this distance corrections hard-snap (teleport, cheat detection, etc.). */
export const DISPLAY_HARD_SNAP_M = 3.0;

/**
 * While feet are in the **moving** cab rider volume, skip applying **any** small replay correction
 * (X/Y/Z + `_displayOffset`). Replay dt ≠ server tick dt, so phantom error is on all axes; only
 * deferring Y still left horizontal reconcile pumping `displayOffsetM`.  Above this, full snap
 * (fell out, teleported, etc.).
 */
export const ELEV_MOVING_RIDER_RECONCILE_SNAP_M = 2.5;

/**
 * Moving-cab authority can be a few meters behind/ahead in Y while still being the same ride.
 * If XZ still agrees and the gap is mostly vertical, treat it as timeline skew instead of a
 * real desync so reconcile does not tug the camera every 20 Hz pose update.
 */
export const ELEV_MOVING_RIDER_RECONCILE_VERTICAL_ONLY_MAX_M = 4.5;

export const ELEV_MOVING_RIDER_RECONCILE_HORIZONTAL_MAX_M = 0.35;

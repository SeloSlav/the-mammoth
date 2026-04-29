import * as THREE from "three";
import {
  BIT_BACK,
  BIT_FORWARD,
  BIT_LEFT,
  BIT_RIGHT,
} from "./moveIntentCodec";

/**
 * Intent publish cadence — keep near `apps/server/src/movement.rs` physics schedule
 * (`TimeDuration::from_micros(50_000)` ≈ 20 Hz) so prediction and authority stay aligned.
 */
export const NET_INTERVAL_MS = 50;
export const NET_DT_SEC = NET_INTERVAL_MS * 0.001;

export const clampTinyDisplayOffsetComponents = (v: THREE.Vector3) => {
  if (Math.abs(v.x) < 1e-5) v.x = 0;
  if (Math.abs(v.y) < 1e-5) v.y = 0;
  if (Math.abs(v.z) < 1e-5) v.z = 0;
};

/** Immediate resend when move bits flip; keeps stop/start from waiting a full server tick. */
export const MOVE_INTENT_EDGE_WINDOW_MS = NET_INTERVAL_MS;
/**
 * While grounded movement is active, resend aim yaw when turning by roughly 1 degree so the
 * server path does not visibly cut corners between 20 Hz heartbeat publishes.
 */
export const MOVE_INTENT_YAW_EDGE_RAD = 0.02;
export const MOVE_INTENT_MOVE_BITS = BIT_FORWARD | BIT_BACK | BIT_LEFT | BIT_RIGHT;

/** Horizontal half-extent (m) of the replicated `player_pose` box (XZ). */
export const POSE_AOI_HALF = 42;
/** Slightly wider than pose AOI so swing/foot events at the edge are still subscribed. */
export const WORLD_SOUND_AOI_HALF = POSE_AOI_HALF + 8;
/** Recentre AOI when predicted position moves this far from the last subscription anchor (m). */
export const POSE_AOI_RECENTER = 14;
export const MOUSE_SENS = 0.0022;
/** ~88° — enough to scan hoistway tops without going full flip. */
export const PITCH_LIMIT = 1.53;
/** Alt free-look: head yaw relative to body (radians, clamped per side; ~±135°, not full 180°). */
export const FREE_LOOK_YAW_MAX = 2.35;
/** Extra camera bob on top of eye-height bob from `stepFpLocomotion` (meters, local space). */
export const CAM_BOB_DIP_Y = 0.004;

export const MELEE_COOLDOWN_MS = 480;

/** PBR shell + large static merges: shading cost grows ~pixelRatio²; `1` keeps fill-rate predictable on DPR>1 laptops. */
export const FP_SESSION_MAX_PIXEL_RATIO = 1;
export const FP_VIEWMODEL_RENDER_LAYER = 1;
export const FP_MIRROR_SELF_RENDER_LAYER = 2;

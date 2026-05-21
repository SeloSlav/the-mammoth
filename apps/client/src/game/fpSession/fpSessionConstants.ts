import * as THREE from "three";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "@the-mammoth/world";
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

/** Recentre world-sound / dropped-item AOI when vertical drift exceeds this (m). */
export const POSE_AOI_RECENTER_Y_M = DEFAULT_BUILDING_FLOOR_SPACING_M * 0.75;
/** Immediate resend when move bits flip; keeps stop/start from waiting a full server tick. */
export const MOVE_INTENT_EDGE_WINDOW_MS = NET_INTERVAL_MS;
/**
 * Resend aim yaw when turning by roughly 1 degree — keeps server facing fresh between 20 Hz
 * heartbeats (critical while **stationary**: melee reads `player_input.aim_yaw` immediately).
 */
export const MOVE_INTENT_YAW_EDGE_RAD = 0.02;
export const MOVE_INTENT_MOVE_BITS = BIT_FORWARD | BIT_BACK | BIT_LEFT | BIT_RIGHT;

/** Horizontal half-extent (m) of the replicated `player_pose` box (XZ). */
export const POSE_AOI_HALF = 42;
/** Slightly wider than pose AOI so swing/foot events at the edge are still subscribed. */
export const WORLD_SOUND_AOI_HALF = POSE_AOI_HALF + 8;
/**
 * Passed into {@link mountDroppedItemsWorld} for API compatibility; ignored (baseline subscribes all `dropped_item`).
 * Kept in case we later switch to AOI-only replication for scale.
 */
export const DROPPED_ITEM_SUBSCRIBE_HALF_M = Math.max(POSE_AOI_HALF, 150);
/** Recentre AOI when predicted position moves this far from the last subscription anchor (m). */
export const POSE_AOI_RECENTER = 14;
export const MOUSE_SENS = 0.0022;
/** Fraction of a turn that bleeds into post-flick coast velocity. */
export const LOOK_INERTIA_COAST_GAIN = 0.28;
/** Exponential decay rate (1/s) for look coast velocity — lower = longer tail after flicks. */
export const LOOK_INERTIA_DAMP_PER_S = 10;
/** ~88° — enough to scan hoistway tops without going full flip. */
export const PITCH_LIMIT = 1.53;
/** Alt free-look: head yaw relative to body (radians, clamped per side; ~±135°, not full 180°). */
export const FREE_LOOK_YAW_MAX = 2.35;
/** Extra camera bob on top of eye-height bob from `stepFpLocomotion` (meters, local space). */
export const CAM_BOB_DIP_Y = 0.004;

export const MELEE_COOLDOWN_MS = 480;

/** PBR shell + large static merges: shading cost grows ~pixelRatio²; `1` keeps fill-rate predictable on DPR>1 laptops. */
export const FP_SESSION_MAX_PIXEL_RATIO = 1;
/**
 * WebGPU MSAA on the swapchain / main `WebGPURenderer` view (`antialias` constructor option).
 * Planar cab mirrors use their own (lower-res) render targets with `samples: 0` so reflection passes
 * are not multiplied by MSAA fill.
 */
export const FP_SESSION_WEBGPU_ANTIALIAS = true;

export const FP_VIEWMODEL_RENDER_LAYER = 1;
export const FP_MIRROR_SELF_RENDER_LAYER = 2;
/**
 * Residential flat shells + owned apartment meshes — global sun/fill on layer 0 skips these unless feet
 * are inside the unit; dim peek ambient lights this layer alone for doorway views from the corridor.
 */
export const FP_RESIDENTIAL_UNIT_INTERIOR_LAYER = 3;
/** Invisible interaction helpers (stash picks, helper raycast boxes) excluded from the main camera. */
export const FP_INTERACTION_PICK_LAYER = 4;
/**
 * Max center-screen ray distance (m) for apartment stash / sittable HUD picks. Feet must still be
 * within each interact cylinder ({@link clientMayUseApartmentStash} / sittable spec radius).
 */
export const FP_APARTMENT_INTERACT_PICK_MAX_RAY_M = 5.5;
/**
 * Heavy apartment GLB props (decor + builtins). Main camera enables this; apartment planar-mirror
 * reflection virtual cameras disable it so the reflector pass does not replay ~200k+ furniture tris.
 */
export const FP_APARTMENT_DECOR_PROP_LAYER = 5;

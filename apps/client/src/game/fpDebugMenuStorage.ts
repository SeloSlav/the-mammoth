/**
 * localStorage keys for dev/QA toggles (mirrors console `localStorage.setItem` docs).
 * FP collision readers live in `fpCollisionPolicy.ts`; this module is for UI + writes only.
 */
export const LS_FP_COLLISION_DEBUG = "mammothFpCollisionDebug";
export const LS_FP_PHYSICS_DEBUG = "mammothFpPhysicsDebug";
export const LS_FP_RECONCILE_DEBUG = "mammothFpReconcileDebug";
export const LS_FP_DOOR_ANIM_SKEW_WARN = "mammothFpDoorAnimSkewWarn";
export const LS_FP_LEGACY_COLLISION = "mammothFpLegacyCollision";
export const LS_FP_PERF_DEBUG = "mammothFpDebug";
/** Console [mmLoadDbg] — connect + FP mount timelines, long tasks, RAF hitches (`?loaddebug=1`). */
export const LS_FP_LOADING_DEBUG = "mammothFpLoadingDebug";
export const LS_APARTMENT_UNIT_BOUNDS_DEBUG = "mammothApartmentUnitBoundsDebug";
export const LS_DOOR_DEBUG_AUTOSTART = "mmDoorDebugAutostart";
export const LS_ELEV_DEBUG_AUTOSTART = "mmElevDebugAutostart";
export const LS_WALL_PROBE_AUTOSTART = "mmWallProbeAutostart";

export function lsToggleIsOn(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function lsToggleSet(key: string, on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(key, "1");
    else globalThis.localStorage?.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

/** `mammothFpLegacyCollision`: when set to "1", legacy path is ON (character controller off). */
export function lsLegacyCollisionIsOn(): boolean {
  return lsToggleIsOn(LS_FP_LEGACY_COLLISION);
}

export function lsLegacyCollisionSet(on: boolean): void {
  lsToggleSet(LS_FP_LEGACY_COLLISION, on);
}

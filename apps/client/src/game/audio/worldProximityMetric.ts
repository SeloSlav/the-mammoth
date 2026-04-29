/**
 * Elliptical proximity metric for `world_sound_event`: horizontal XZ is Euclidean; world Y is scaled by
 * replicated `axis_weight_y` so vertical separation (floors) attenuates faster than the same offset on XZ.
 * Keep behavior aligned with `apps/server/src/world_sound.rs` (`AXIS_WEIGHT_Y_*` + `axis_weight_y` column).
 */

/** `axis_weight_y === 1` recovers spherical `hypot(dx,dy,dz)`. */
export const WORLD_SOUND_AXIS_WEIGHT_Y_SPHERICAL = 1.0;

const MIN_AXIS_WEIGHT = 1e-5;

/**
 * Effective listener distance for culling / falloff — `sqrt(dx² + dz² + (axisWeightY·dy)²)`.
 */
export function worldSoundAxisWeightedDistanceM(
  listenerX: number,
  listenerY: number,
  listenerZ: number,
  soundX: number,
  soundY: number,
  soundZ: number,
  axisWeightY: number,
): number {
  const dx = soundX - listenerX;
  const dy = soundY - listenerY;
  const dz = soundZ - listenerZ;
  const w = Math.max(MIN_AXIS_WEIGHT, axisWeightY);
  return Math.hypot(dx, dz, w * dy);
}

/**
 * Euclidean distance from listener to the real sound origin.
 */
export function worldSoundEuclideanDistanceM(
  listenerX: number,
  listenerY: number,
  listenerZ: number,
  soundX: number,
  soundY: number,
  soundZ: number,
): number {
  const dx = soundX - listenerX;
  const dy = soundY - listenerY;
  const dz = soundZ - listenerZ;
  return Math.hypot(dx, dy, dz);
}

/**
 * Panner world position: same direction from listener → real source as true 3D, but distance =
 * `effectiveM` so Web Audio `inverse` rolloff matches axis-weighted attenuation.
 */
export function worldSoundVirtualPannerPosition(
  listenerX: number,
  listenerY: number,
  listenerZ: number,
  soundX: number,
  soundY: number,
  soundZ: number,
  effectiveM: number,
): { x: number; y: number; z: number } {
  const dx = soundX - listenerX;
  const dy = soundY - listenerY;
  const dz = soundZ - listenerZ;
  const euclidean = Math.hypot(dx, dy, dz);
  if (euclidean < 1e-6) {
    return { x: soundX, y: soundY, z: soundZ };
  }
  const s = effectiveM / euclidean;
  return {
    x: listenerX + dx * s,
    y: listenerY + dy * s,
    z: listenerZ + dz * s,
  };
}

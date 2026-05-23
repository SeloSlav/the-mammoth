/** Closest the orbit camera may approach its target (meters) — lower = more zoom-in. */
export const EDITOR_ORBIT_MIN_DISTANCE_M = 0.14;

/** “Neutral” orbit feel at this camera–target radius (meters). */
export const EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M = 6.5;

/** Softens compensation so close-up controls do not feel twitchy. */
export const EDITOR_ORBIT_SPEED_DISTANCE_COMPENSATION_DAMP = 0.82;

/**
 * Fraction of pending orbit delta applied per {@link OrbitControls#update} while dragging.
 * Higher = tighter tracking; lower = smoother but laggier drag.
 */
export const EDITOR_ORBIT_DRAG_SMOOTH_FACTOR = 0.34;

/** Rebind distance-scaled orbit speeds after this relative distance change. */
export const EDITOR_ORBIT_SPEED_DISTANCE_REBIND_RATIO = 0.02;

export const EDITOR_ORBIT_ZOOM_SPEED_MIN = 0.65;
export const EDITOR_ORBIT_ZOOM_SPEED_MAX = 5.5;
export const EDITOR_ORBIT_ROTATE_SPEED_MIN = 0.7;
export const EDITOR_ORBIT_ROTATE_SPEED_MAX = 4;
/** Pan already scales with camera distance in OrbitControls — allow a higher ceiling when zoomed in. */
export const EDITOR_ORBIT_PAN_SPEED_MIN = 0.12;
export const EDITOR_ORBIT_PAN_SPEED_MAX = 42;

export type EditorOrbitDistanceInvariantSpeeds = {
  zoomSpeed: number;
  rotateSpeed: number;
  panSpeed: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Keeps orbit rotate/zoom/pan feeling similar regardless of camera–target distance.
 * Pan needs the same compensation because {@link OrbitControls} multiplies pan delta by distance.
 */
export function editorOrbitDistanceInvariantSpeeds(opts: {
  distanceM: number;
  minDistanceM: number;
  referenceDistanceM?: number;
  damp?: number;
}): EditorOrbitDistanceInvariantSpeeds {
  const distance = Math.max(opts.minDistanceM, opts.distanceM);
  const referenceDistanceM = opts.referenceDistanceM ?? EDITOR_ORBIT_INVARIANT_REFERENCE_DISTANCE_M;
  const damp = opts.damp ?? EDITOR_ORBIT_SPEED_DISTANCE_COMPENSATION_DAMP;
  const speedScale = (referenceDistanceM / distance) * damp;

  return {
    zoomSpeed: clamp(speedScale, EDITOR_ORBIT_ZOOM_SPEED_MIN, EDITOR_ORBIT_ZOOM_SPEED_MAX),
    rotateSpeed: clamp(speedScale, EDITOR_ORBIT_ROTATE_SPEED_MIN, EDITOR_ORBIT_ROTATE_SPEED_MAX),
    panSpeed: clamp(speedScale, EDITOR_ORBIT_PAN_SPEED_MIN, EDITOR_ORBIT_PAN_SPEED_MAX),
  };
}

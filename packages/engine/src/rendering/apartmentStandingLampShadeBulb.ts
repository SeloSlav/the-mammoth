import * as THREE from "three";

/** Upper bbox band treated as lampshade (pole + base sit below). */
export const STANDING_LAMP_SHADE_BAND_FRAC = 0.36;

/**
 * Bulb center inside the upper shade band — avoids placing the emitter on the pole.
 * Open-top shades emit omni from the geometric center (no room-axis inset).
 * `box` must be a current world-space AABB from {@link THREE.Box3.setFromObject}.
 */
export function apartmentStandingLampShadeBulbWorldPosition(
  box: THREE.Box3,
  size: THREE.Vector3,
  out: THREE.Vector3,
): void {
  const shadeBandH = Math.max(0.14, size.y * STANDING_LAMP_SHADE_BAND_FRAC);
  const bulbY = box.max.y - shadeBandH * 0.5;
  out.set(
    (box.min.x + box.max.x) * 0.5,
    bulbY,
    (box.min.z + box.max.z) * 0.5,
  );
}

/** Panel emitter sits in the lower band of the hanging grow fixture. */
export function apartmentGrowOpPanelEmitterWorldPosition(
  box: THREE.Box3,
  size: THREE.Vector3,
  out: THREE.Vector3,
): void {
  const panelBandH = Math.max(0.08, size.y * 0.24);
  out.set(
    (box.min.x + box.max.x) * 0.5,
    box.min.y + panelBandH * 0.42,
    (box.min.z + box.max.z) * 0.5,
  );
}

/** Flush-mount lens orb + emitter at fixture geometric center. */
export function apartmentCeilingFixtureBulbWorldPosition(
  box: THREE.Box3,
  out: THREE.Vector3,
): void {
  box.getCenter(out);
}

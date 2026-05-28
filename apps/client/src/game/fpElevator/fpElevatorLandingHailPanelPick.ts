import * as THREE from "three";
import type { ElevatorDoorFace } from "./fpElevatorLabels.js";

/** Crosshair must land within this radius on the hail panel face plane (m). */
export const LANDING_HAIL_PANEL_PICK_DISK_RADIUS_M = 0.36;

export function landingHailPanelOutwardNormal(
  doorFace: ElevatorDoorFace,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  switch (doorFace) {
    case "e":
      return out.set(1, 0, 0);
    case "w":
      return out.set(-1, 0, 0);
    case "n":
      return out.set(0, 0, 1);
    case "s":
      return out.set(0, 0, -1);
  }
}

/**
 * True when the screen-center ray hits the circular hail panel within `radiusM` on its face plane.
 * Viewing-angle independent — fixes one-sided icon planes missing oblique/right-side crosshair hits.
 */
export function crosshairHitsLandingHailPanelDisk(
  raycaster: THREE.Raycaster,
  screenCenterNdc: THREE.Vector2,
  camera: THREE.PerspectiveCamera,
  centerWorld: THREE.Vector3,
  outwardNormal: THREE.Vector3,
  radiusM: number,
  scratch: {
    plane: THREE.Plane;
    hit: THREE.Vector3;
  },
): boolean {
  raycaster.setFromCamera(screenCenterNdc, camera);
  scratch.plane.setFromNormalAndCoplanarPoint(outwardNormal, centerWorld);
  const hit = raycaster.ray.intersectPlane(scratch.plane, scratch.hit);
  if (hit == null) return false;
  if (hit.distanceTo(centerWorld) > radiusM) return false;
  // Ray must strike the outward-facing side of the panel (corridor), not from inside the shaft.
  return raycaster.ray.direction.dot(outwardNormal) < -0.01;
}

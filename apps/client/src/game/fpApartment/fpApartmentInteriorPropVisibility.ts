import * as THREE from "three";

/** Matches decor/furniture group bounds expansion for hallway / exterior peeks. */
export const APARTMENT_PROP_FRUSTUM_MARGIN_M = 1.5;

/**
 * When the viewer is inside their apartment, hide props clearly behind the camera. Spinning in a
 * small unit otherwise keeps every high-poly decor GLB in the frustum pass (~500k+ triangles).
 */
export const APARTMENT_INTERIOR_PROP_BEHIND_CAMERA_DOT_MAX = 0;

const _boundsCenterScratch = new THREE.Vector3();
const _toPropScratch = new THREE.Vector3();

export function apartmentPropBehindCameraWhenInterior(
  propWorldBounds: THREE.Box3,
  cameraWorldPos: THREE.Vector3,
  cameraWorldDir: THREE.Vector3,
  behindCameraDotMax = APARTMENT_INTERIOR_PROP_BEHIND_CAMERA_DOT_MAX,
): boolean {
  propWorldBounds.getCenter(_boundsCenterScratch);
  _toPropScratch.subVectors(_boundsCenterScratch, cameraWorldPos);
  const distSq = _toPropScratch.lengthSq();
  if (distSq < 1e-8) return false;
  _toPropScratch.multiplyScalar(1 / Math.sqrt(distSq));
  return _toPropScratch.dot(cameraWorldDir) < behindCameraDotMax;
}

export function resolveApartmentInteriorPropGroupVisible(input: {
  allowDemand: boolean;
  containingUnitKey: string | null;
  groupUnitKey: string | undefined;
  propWorldBounds: THREE.Box3 | undefined;
  viewFrustum: THREE.Frustum;
  cameraWorldPos: THREE.Vector3;
  cameraWorldDir: THREE.Vector3;
}): boolean {
  if (!input.allowDemand) return false;
  const isContainingUnit =
    input.containingUnitKey !== null && input.groupUnitKey === input.containingUnitKey;
  if (input.containingUnitKey !== null && !isContainingUnit) return false;

  const bounds = input.propWorldBounds;
  if (!(bounds instanceof THREE.Box3)) return true;

  if (
    isContainingUnit &&
    apartmentPropBehindCameraWhenInterior(
      bounds,
      input.cameraWorldPos,
      input.cameraWorldDir,
    )
  ) {
    return false;
  }

  return input.viewFrustum.intersectsBox(bounds);
}

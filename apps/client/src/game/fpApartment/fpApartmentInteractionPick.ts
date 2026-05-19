import * as THREE from "three";

const _boundsScratch = new THREE.Box3();
const _centerScratch = new THREE.Vector3();
const _sizeScratch = new THREE.Vector3();

/**
 * Size and position an invisible interaction pick in `parent` local space from the parent's
 * descendant bounds (world AABB converted to local center).
 */
export function fitApartmentInteractionPickToObject(
  parent: THREE.Object3D,
  pick: THREE.Mesh,
  minScale: { x: number; y: number; z: number },
): void {
  parent.updateMatrixWorld(true);
  _boundsScratch.setFromObject(parent);
  _boundsScratch.getSize(_sizeScratch);
  _boundsScratch.getCenter(_centerScratch);
  parent.worldToLocal(_centerScratch);
  pick.position.copy(_centerScratch);
  pick.scale.set(
    Math.max(minScale.x, _sizeScratch.x),
    Math.max(minScale.y, _sizeScratch.y),
    Math.max(minScale.z, _sizeScratch.z),
  );
}

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

/** Tall floor-level pick for balcony grow trays — center-screen rays often pass over flat soil meshes. */
export function fitBalconyGrowGroundInteractionPick(
  pick: THREE.Mesh,
  localX: number,
  localZ: number,
  opts?: { width?: number; height?: number; centerY?: number },
): void {
  const width = opts?.width ?? 0.78;
  const height = opts?.height ?? 1.25;
  const centerY = opts?.centerY ?? height * 0.5;
  pick.position.set(localX, centerY, localZ);
  pick.scale.set(width, height, width);
}

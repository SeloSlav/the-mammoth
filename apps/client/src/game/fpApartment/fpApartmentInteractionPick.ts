import * as THREE from "three";

const _boundsScratch = new THREE.Box3();
const _centerScratch = new THREE.Vector3();
const _sizeScratch = new THREE.Vector3();
const _worldScaleScratch = new THREE.Vector3();
const _meshBoundsScratch = new THREE.Box3();
const _inverseRootScratch = new THREE.Matrix4();

function isGrowTrayPickObject(obj: THREE.Object3D): boolean {
  return (
    (typeof obj.name === "string" &&
      (obj.name.startsWith("grow_tray_pick:") ||
        obj.name.startsWith("grow_tray_center_pick:") ||
        obj.name.startsWith("grow_slot_pick:") ||
        obj.name.startsWith("grow_plant_pick:"))) ||
    obj.userData.mammothGrowPlantPick === true ||
    obj.userData.mammothGrowTrayCenterPick === true
  );
}

/** Visual-only bounds in `decorRoot` local space — excludes interaction picks. */
export function readDecorVisualLocalBounds(
  decorRoot: THREE.Object3D,
  out = _boundsScratch,
): THREE.Box3 {
  out.makeEmpty();
  decorRoot.updateMatrixWorld(true);
  _inverseRootScratch.copy(decorRoot.matrixWorld).invert();
  decorRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (isGrowTrayPickObject(obj)) return;
    if (obj.userData.mammothApartmentStashKey !== undefined) return;
    _meshBoundsScratch.setFromObject(obj);
    _meshBoundsScratch.applyMatrix4(_inverseRootScratch);
    out.union(_meshBoundsScratch);
  });
  return out;
}

/**
 * Size and position an invisible interaction pick in `parent` local space from the parent's
 * descendant bounds (world AABB converted to local center and local scale).
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
  parent.getWorldScale(_worldScaleScratch);
  pick.position.copy(_centerScratch);
  pick.scale.set(
    Math.max(minScale.x, _sizeScratch.x / _worldScaleScratch.x),
    Math.max(minScale.y, _sizeScratch.y / _worldScaleScratch.y),
    Math.max(minScale.z, _sizeScratch.z / _worldScaleScratch.z),
  );
}

export type BalconyGrowSlotPickSize = {
  width: number;
  height: number;
};

/** Derive quadrant pick size from tray visual bounds in decor local space. */
export function balconyGrowSlotPickSizeFromTrayBounds(
  bounds: THREE.Box3,
): BalconyGrowSlotPickSize {
  bounds.getSize(_sizeScratch);
  const cell = Math.min(_sizeScratch.x, _sizeScratch.z) * 0.36;
  return {
    width: Math.max(0.12, cell),
    height: Math.max(0.45, _sizeScratch.y * 0.92),
  };
}

/** Model-bound tray pick — local XZ/Y from GLB bounds after placement scale. */
export function fitBalconyGrowTrayInteractionPick(
  visualRoot: THREE.Object3D,
  pick: THREE.Mesh,
): void {
  const bounds = readDecorVisualLocalBounds(visualRoot, new THREE.Box3());
  if (bounds.isEmpty()) {
    fitApartmentInteractionPickToObject(visualRoot, pick, { x: 0.28, y: 0.85, z: 0.28 });
    return;
  }
  bounds.getCenter(_centerScratch);
  bounds.getSize(_sizeScratch);
  pick.position.copy(_centerScratch);
  pick.scale.set(
    Math.max(0.12, _sizeScratch.x),
    Math.max(0.45, _sizeScratch.y),
    Math.max(0.12, _sizeScratch.z),
  );
}

/** Per-quadrant slot pick — sized to the rescaled tray model. */
export function fitBalconyGrowSlotInteractionPick(
  pick: THREE.Mesh,
  localX: number,
  localZ: number,
  size: BalconyGrowSlotPickSize,
): void {
  pick.position.set(localX, size.height * 0.5, localZ);
  pick.scale.set(size.width, size.height, size.width);
}

/** Hub pick at tray center — opens fertilizer stash without blocking on planted quadrants. */
export function fitBalconyGrowTrayCenterInteractionPick(
  pick: THREE.Mesh,
  size: BalconyGrowSlotPickSize,
): void {
  const hub = Math.max(0.1, size.width * 0.52);
  pick.position.set(0, size.height * 0.5, 0);
  pick.scale.set(hub, size.height, hub);
}

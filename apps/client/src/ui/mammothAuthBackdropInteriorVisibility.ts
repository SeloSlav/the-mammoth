import * as THREE from "three";

/**
 * Shared megablock cache roots are reused by `mountFpSession`; reset any stale `.visible`
 * overrides before FP floor-band visibility owns shell meshes again.
 */
export function restoreUnitInteriorMeshVisibilityAfterAuthView(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior === true) {
      obj.visible = true;
    }
  });
}

import * as THREE from "three";

export type FpPlanarMirror = {
  surface: THREE.Mesh;
  syncForCamera(args: {
    camera: THREE.PerspectiveCamera;
    configureVirtualCamera?: (camera: THREE.Camera) => void;
    /**
     * When false, the reflector keeps the last captured texture instead of re-rendering the scene
     * (large GPU savings when the mirror is behind you / far away).
     */
    forceReflectionUpdate?: boolean;
  }): void;
  dispose(): void;
};

export function createFpPlanarMirrorFromPlaceholder(placeholder: THREE.Mesh): FpPlanarMirror {
  const parent = placeholder.parent;
  if (!parent) throw new Error("createFpPlanarMirrorFromPlaceholder: placeholder has no parent");
  const geometry = placeholder.geometry.clone();
  const material = new THREE.MeshStandardMaterial({
    color: 0x7f8588,
    metalness: 0.65,
    roughness: 0.18,
  });
  material.toneMapped = false;
  const surface = new THREE.Mesh(geometry, material);
  surface.name = placeholder.name;
  surface.position.copy(placeholder.position);
  surface.quaternion.copy(placeholder.quaternion);
  surface.scale.copy(placeholder.scale);
  surface.visible = placeholder.visible;
  surface.renderOrder = placeholder.renderOrder;
  surface.frustumCulled = false;
  surface.userData = { ...placeholder.userData, mammothCabMirror: true };
  parent.add(surface);
  parent.remove(placeholder);
  const placeholderMat = placeholder.material;
  placeholder.geometry.dispose();
  if (Array.isArray(placeholderMat)) placeholderMat.forEach((entry) => entry.dispose());
  else placeholderMat.dispose();

  return {
    surface,
    syncForCamera() {
      // Dynamic planar reflections were a full extra scene render and still looked too low-res in
      // cab gameplay. Keep mirrors as cheap static panels until we have a proper high-quality path.
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

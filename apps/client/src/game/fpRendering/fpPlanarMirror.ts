import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { reflector } from "three/tsl";

export type FpPlanarMirror = {
  surface: THREE.Mesh;
  syncForCamera(args: {
    camera: THREE.PerspectiveCamera;
    configureVirtualCamera?: (camera: THREE.Camera) => void;
  }): void;
  dispose(): void;
};

function planeSizeFromGeometry(geometry: THREE.BufferGeometry): { width: number; height: number } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return { width: 1, height: 1 };
  const size = box.getSize(new THREE.Vector3());
  const width = Math.max(size.x, size.z, 0.001);
  const height = Math.max(size.y, 0.001);
  return { width, height };
}

export function createFpPlanarMirrorFromPlaceholder(
  placeholder: THREE.Mesh,
  opts?: { resolutionScale?: number },
): FpPlanarMirror {
  const parent = placeholder.parent;
  if (!parent) throw new Error("createFpPlanarMirrorFromPlaceholder: placeholder has no parent");
  const geometry = placeholder.geometry.clone();
  const planeSize = planeSizeFromGeometry(geometry);
  const aspect = planeSize.width / planeSize.height;
  const resolutionScale = opts?.resolutionScale ?? (aspect >= 0.75 ? 0.85 : 0.7);
  const mirrorNode = reflector({
    resolutionScale,
    bounces: false,
    samples: 4,
  });
  const material = new MeshBasicNodeMaterial();
  material.colorNode = mirrorNode;
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
  surface.add(mirrorNode.target);
  parent.add(surface);
  parent.remove(placeholder);
  const placeholderMat = placeholder.material;
  placeholder.geometry.dispose();
  if (Array.isArray(placeholderMat)) placeholderMat.forEach((entry) => entry.dispose());
  else placeholderMat.dispose();

  return {
    surface,
    syncForCamera({ camera, configureVirtualCamera }) {
      const reflectorBase = mirrorNode.reflector;
      reflectorBase.forceUpdate = true;
      const virtualCamera = reflectorBase.getVirtualCamera(camera);
      configureVirtualCamera?.(virtualCamera);
    },
    dispose() {
      mirrorNode.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

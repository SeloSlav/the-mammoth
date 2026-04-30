import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { reflector } from "three/tsl";

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
    /** True only for the single mirror currently allowed to own a live reflector. */
    dynamicActive?: boolean;
  }): void;
  dispose(): void;
};

type DynamicMirrorState = {
  mirrorNode: ReturnType<typeof reflector>;
  material: MeshBasicNodeMaterial;
};

const FP_CAB_MIRROR_REFLECTION_RESOLUTION_SCALE = 0.62;

export function createFpPlanarMirrorFromPlaceholder(placeholder: THREE.Mesh): FpPlanarMirror {
  const parent = placeholder.parent;
  if (!parent) throw new Error("createFpPlanarMirrorFromPlaceholder: placeholder has no parent");
  const geometry = placeholder.geometry.clone();
  const staticMaterial = new THREE.MeshStandardMaterial({
    color: 0x7f8588,
    metalness: 0.65,
    roughness: 0.18,
  });
  staticMaterial.toneMapped = false;
  const surface: THREE.Mesh = new THREE.Mesh(geometry, staticMaterial);
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

  let dynamic: DynamicMirrorState | null = null;

  const ensureDynamic = (): DynamicMirrorState => {
    if (dynamic) return dynamic;
    const mirrorNode = reflector({
      resolutionScale: FP_CAB_MIRROR_REFLECTION_RESOLUTION_SCALE,
      bounces: false,
      samples: 0,
    });
    const material = new MeshBasicNodeMaterial();
    material.colorNode = mirrorNode;
    material.toneMapped = false;
    surface.material = material;
    surface.add(mirrorNode.target);
    dynamic = { mirrorNode, material };
    return dynamic;
  };

  const disposeDynamic = (): void => {
    if (!dynamic) return;
    surface.remove(dynamic.mirrorNode.target);
    dynamic.mirrorNode.dispose();
    dynamic.material.dispose();
    dynamic = null;
    surface.material = staticMaterial;
  };

  return {
    surface,
    syncForCamera({
      camera,
      configureVirtualCamera,
      dynamicActive = false,
      forceReflectionUpdate = false,
    }) {
      if (!dynamicActive) {
        disposeDynamic();
        return;
      }
      const activeDynamic = ensureDynamic();
      const reflectorBase = activeDynamic.mirrorNode.reflector;
      reflectorBase.forceUpdate = forceReflectionUpdate;
      if (!forceReflectionUpdate) return;
      const virtualCamera = reflectorBase.getVirtualCamera(camera);
      configureVirtualCamera?.(virtualCamera);
    },
    dispose() {
      disposeDynamic();
      geometry.dispose();
      staticMaterial.dispose();
    },
  };
}

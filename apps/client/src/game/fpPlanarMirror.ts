import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { float, positionWorld, texture, uniform, vec2, vec4 } from "three/tsl";

export type FpPlanarMirror = {
  surface: THREE.Mesh;
  render(args: {
    renderer: THREE.WebGPURenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    beforeMirrorRender?: () => void;
    afterMirrorRender?: () => void;
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
  opts?: { textureHeight?: number; clipBias?: number; tint?: number },
): FpPlanarMirror {
  const parent = placeholder.parent;
  if (!parent) throw new Error("createFpPlanarMirrorFromPlaceholder: placeholder has no parent");
  const geometry = placeholder.geometry.clone();
  const planeSize = planeSizeFromGeometry(geometry);
  const targetHeight = opts?.textureHeight ?? 896;
  const targetWidth = Math.max(256, Math.round(targetHeight * (planeSize.width / planeSize.height)));
  const renderTarget = new THREE.RenderTarget(targetWidth, targetHeight, {
    depthBuffer: true,
  });
  renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const textureMatrix = new THREE.Matrix4();
  const textureMatrixNode = uniform(textureMatrix);
  const tintNode = uniform(new THREE.Color(opts?.tint ?? 0xffffff));
  const projectedUv4 = textureMatrixNode.mul(vec4(positionWorld, float(1)));
  const projectedUv = projectedUv4.xy.div(projectedUv4.w);
  const mirrorSample = texture(
    renderTarget.texture,
    vec2(projectedUv.x, float(1).sub(projectedUv.y)),
  );
  const material = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.03,
    metalness: 0.02,
  });
  material.colorNode = vec4(mirrorSample.rgb.mul(tintNode), float(1));
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

  const virtualCamera = new THREE.PerspectiveCamera();
  const rotationMatrix = new THREE.Matrix4();
  const reflectorPlane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const reflectorWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const lookAtPosition = new THREE.Vector3();
  const clipPlane = new THREE.Vector4();
  const view = new THREE.Vector3();
  const target = new THREE.Vector3();
  const q = new THREE.Vector4();

  return {
    surface,
    render({ renderer, scene, camera, beforeMirrorRender, afterMirrorRender }) {
      if (!surface.visible) return;
      reflectorWorldPosition.setFromMatrixPosition(surface.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(surface.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
      view.subVectors(reflectorWorldPosition, cameraWorldPosition);
      if (view.dot(normal) > 0) return;

      view.reflect(normal).negate().add(reflectorWorldPosition);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(reflectorWorldPosition, lookAtPosition);
      target.reflect(normal).negate().add(reflectorWorldPosition);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      virtualCamera.near = camera.near;
      virtualCamera.far = camera.far;
      virtualCamera.aspect = camera.aspect;
      virtualCamera.fov = camera.fov;
      virtualCamera.lookAt(target);
      virtualCamera.updateProjectionMatrix();
      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
      virtualCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      textureMatrix.set(
        0.5,
        0,
        0,
        0.5,
        0,
        0.5,
        0,
        0.5,
        0,
        0,
        0.5,
        0.5,
        0,
        0,
        0,
        1,
      );
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(surface.matrixWorld);

      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(
        reflectorPlane.normal.x,
        reflectorPlane.normal.y,
        reflectorPlane.normal.z,
        reflectorPlane.constant,
      );
      const projectionMatrix = virtualCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + projectionMatrix.elements[8]!) / projectionMatrix.elements[0]!;
      q.y = (Math.sign(clipPlane.y) + projectionMatrix.elements[9]!) / projectionMatrix.elements[5]!;
      q.z = -1;
      q.w = (1 + projectionMatrix.elements[10]!) / projectionMatrix.elements[14]!;
      clipPlane.multiplyScalar(2 / clipPlane.dot(q));
      projectionMatrix.elements[2] = clipPlane.x;
      projectionMatrix.elements[6] = clipPlane.y;
      projectionMatrix.elements[10] = clipPlane.z + 1 - (opts?.clipBias ?? 0.003);
      projectionMatrix.elements[14] = clipPlane.w;

      const currentTarget = renderer.getRenderTarget();
      surface.visible = false;
      beforeMirrorRender?.();
      try {
        renderer.setRenderTarget(renderTarget);
        renderer.clear();
        renderer.render(scene, virtualCamera);
      } finally {
        renderer.setRenderTarget(currentTarget);
        afterMirrorRender?.();
        surface.visible = true;
      }
    },
    dispose() {
      renderTarget.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

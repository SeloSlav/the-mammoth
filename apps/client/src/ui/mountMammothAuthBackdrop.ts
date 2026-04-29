import * as THREE from "three";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
} from "@the-mammoth/engine";
import { ensureStairwellCigaretteMeshReady } from "@the-mammoth/world";
import {
  attachFpSessionEnvironment,
  FP_SESSION_SKY_CAMERA_FAR,
} from "../game/fpSession/fpSessionEnvironment.js";
import { createFpSessionStaticWorld } from "../game/fpSession/fpSessionWorldMount.js";
import {
  FP_SESSION_MAX_PIXEL_RATIO,
  FP_SESSION_WEBGPU_ANTIALIAS,
} from "../game/fpSession/fpSessionConstants.js";

const AUTH_BACKDROP_CAMERA_FOV_DEG = 38;
const AUTH_BACKDROP_ORBIT_AMPLITUDE_RAD = 0.045;
const AUTH_BACKDROP_ORBIT_SPEED_SEC = 0.055;

export async function mountMammothAuthBackdrop(canvas: HTMLCanvasElement): Promise<() => void> {
  await assertWebGpuAdapterOrThrow();
  await ensureStairwellCigaretteMeshReady();

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: FP_SESSION_WEBGPU_ANTIALIAS,
    forceWebGL: false,
  });
  await renderer.init();
  assertWebGpuRendererBackend(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, FP_SESSION_MAX_PIXEL_RATIO));

  const fpEnvironment = attachFpSessionEnvironment(scene, renderer);
  const camera = new THREE.PerspectiveCamera(
    AUTH_BACKDROP_CAMERA_FOV_DEG,
    1,
    0.1,
    FP_SESSION_SKY_CAMERA_FAR,
  );

  const { buildingRoot, cellRoot } = createFpSessionStaticWorld();
  hideUnitInteriorMeshesForExteriorAuthView(buildingRoot);
  scene.add(buildingRoot, cellRoot);
  buildingRoot.updateMatrixWorld(true);
  cellRoot.updateMatrixWorld(true);

  const buildingBounds = new THREE.Box3().setFromObject(buildingRoot);
  const buildingSize = new THREE.Vector3();
  const buildingCenter = new THREE.Vector3();
  buildingBounds.getSize(buildingSize);
  buildingBounds.getCenter(buildingCenter);

  const lookTarget = buildingCenter.clone();
  lookTarget.x += buildingSize.x * 0.12;
  lookTarget.y = buildingBounds.min.y + buildingSize.y * 0.35;

  const baseCameraOffset = new THREE.Vector3(
    -Math.max(buildingSize.x * 0.58, 130),
    Math.max(buildingSize.y * 0.44, 30),
    Math.max(buildingSize.x * 0.5, 120),
  );
  const cameraOffset = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  const resize = () => {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let disposed = false;
  let raf = 0;

  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const nowSec = performance.now() * 0.001;
    const orbit = Math.sin(nowSec * AUTH_BACKDROP_ORBIT_SPEED_SEC) * AUTH_BACKDROP_ORBIT_AMPLITUDE_RAD;
    cameraOffset.copy(baseCameraOffset).applyAxisAngle(worldUp, orbit);
    camera.position.copy(lookTarget).add(cameraOffset);
    camera.lookAt(lookTarget);

    fpEnvironment.onFrame({
      camera,
      nowSec,
      viewWidthPx: canvas.clientWidth,
      viewHeightPx: canvas.clientHeight,
    });
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    fpEnvironment.dispose();
    scene.remove(buildingRoot, cellRoot);
    disposeObjectTree(buildingRoot);
    disposeObjectTree(cellRoot);
    renderer.dispose();
    scene.clear();
  };
}

function hideUnitInteriorMeshesForExteriorAuthView(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior === true) {
      obj.visible = false;
    }
  });
}

function disposeObjectTree(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry as THREE.BufferGeometry | undefined;
    if (geometry && !disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry);
      geometry.dispose();
    }
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!material || disposedMaterials.has(material)) continue;
      disposedMaterials.add(material);
      material.dispose();
    }
  });
}

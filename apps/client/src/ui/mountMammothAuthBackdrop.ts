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
import { waitMegablockStaticWorldMeshReady } from "../game/fpSession/fpSessionStaticWorldMeshCache.js";
import {
  FP_SESSION_MAX_PIXEL_RATIO,
  FP_SESSION_WEBGPU_ANTIALIAS,
} from "../game/fpSession/fpSessionConstants.js";

const AUTH_BACKDROP_CAMERA_FOV_DEG = 38;
const AUTH_BACKDROP_ORBIT_WOBBLE_AMPLITUDE_RAD = 0.045;
const AUTH_BACKDROP_ORBIT_WOBBLE_SPEED_SEC = 0.055;
/** Slow yaw orbit around the building (~3.3 min per full turn at this rate). */
const AUTH_BACKDROP_BUILDING_YAW_RAD_PER_SEC = 0.032;
/** Aim-point shift (fraction of building short-axis width) so the block reads on the right while we yaw. */
const AUTH_BACKDROP_RIGHT_FRAMING_WIDTH_FRAC = 0.22;

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

  const { buildingRoot, cellRoot, buildingBodyWorldBounds } =
    await waitMegablockStaticWorldMeshReady();
  hideUnitInteriorMeshesForExteriorAuthView(buildingRoot);
  scene.add(buildingRoot, cellRoot);
  buildingRoot.updateMatrixWorld(true);
  cellRoot.updateMatrixWorld(true);

  /**
   * Framing must use the megablock stack only. `buildingRoot` also parents the exterior tree grove
   * (huge scatter radius) — `setFromObject(buildingRoot)` was pushing the camera to the horizon.
   */
  const buildingBounds = buildingBodyWorldBounds.clone();
  const buildingSize = new THREE.Vector3();
  const buildingCenter = new THREE.Vector3();
  buildingBounds.getSize(buildingSize);
  buildingBounds.getCenter(buildingCenter);

  /** Orbit / distance reference point — vertical band across the façade, not offset in X (framing handles left/right). */
  const lookTarget = buildingCenter.clone();
  lookTarget.y = buildingBounds.min.y + buildingSize.y * 0.35;

  const baseCameraOffset = new THREE.Vector3(
    -Math.max(buildingSize.x * 0.58, 130),
    Math.max(buildingSize.y * 0.44, 30),
    Math.max(buildingSize.x * 0.5, 120),
  );
  const cameraOffset = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const framingShiftWorld = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const toCamFlat = new THREE.Vector3();

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
    const yawOrbit = nowSec * AUTH_BACKDROP_BUILDING_YAW_RAD_PER_SEC;
    const wobble =
      Math.sin(nowSec * AUTH_BACKDROP_ORBIT_WOBBLE_SPEED_SEC) *
      AUTH_BACKDROP_ORBIT_WOBBLE_AMPLITUDE_RAD;
    cameraOffset.copy(baseCameraOffset).applyAxisAngle(worldUp, yawOrbit + wobble);
    camera.position.copy(lookTarget).add(cameraOffset);
    // Horizontal “screen right”: in the ground plane, perpendicular to camera→target.
    toCamFlat.subVectors(camera.position, lookTarget);
    toCamFlat.y = 0;
    const horizLenSq = toCamFlat.lengthSq();
    if (horizLenSq > 1e-6) {
      toCamFlat.multiplyScalar(1 / Math.sqrt(horizLenSq));
      framingShiftWorld.crossVectors(worldUp, toCamFlat).normalize();
      const framingM = buildingSize.x * AUTH_BACKDROP_RIGHT_FRAMING_WIDTH_FRAC;
      aimPoint.copy(lookTarget).addScaledVector(framingShiftWorld, -framingM);
      camera.lookAt(aimPoint);
    } else {
      camera.lookAt(lookTarget);
    }

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
    restoreUnitInteriorMeshVisibilityAfterAuthView(buildingRoot);
    scene.remove(buildingRoot, cellRoot);
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

/** Shared cache roots are reused by `mountFpSession`; reset so FP shell visibility can own the flags. */
function restoreUnitInteriorMeshVisibilityAfterAuthView(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.userData.mammothUnitInterior === true) {
      obj.visible = true;
    }
  });
}

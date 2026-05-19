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
import {
  primeMegablockStaticWorldMeshBuild,
  waitMegablockStaticWorldMeshReady,
  type MegablockBackdropHooks,
} from "../game/fpSession/fpSessionStaticWorldMeshCache.js";
import {
  FP_SESSION_MAX_PIXEL_RATIO,
  FP_SESSION_WEBGPU_ANTIALIAS,
} from "../game/fpSession/fpSessionConstants.js";
import { yieldToMain } from "../game/fpSession/yieldToMain.js";

const AUTH_BACKDROP_CAMERA_FOV_DEG = 38;
const AUTH_BACKDROP_ORBIT_WOBBLE_AMPLITUDE_RAD = 0.045;
const AUTH_BACKDROP_ORBIT_WOBBLE_SPEED_SEC = 0.055;
/** Slow yaw orbit around the building (~3.3 min per full turn at this rate). */
const AUTH_BACKDROP_BUILDING_YAW_RAD_PER_SEC = 0.032;
/** Aim-point shift (fraction of building short-axis width) so the block reads on the right while we yaw. */
const AUTH_BACKDROP_RIGHT_FRAMING_WIDTH_FRAC = 0.22;

/**
 * Fallback orbital framing before meshes arrive — see `content/building/mammoth.json` sizing hints.
 * Tightened each storey via progressive megablock hooks and finalized when {@link waitMegablockStaticWorldMeshReady} resolves.
 */
const AUTH_BACKDROP_FALLBACK_BUILDING_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-130, -2, -130),
  new THREE.Vector3(130, 75, 130),
);

export async function mountMammothAuthBackdrop(canvas: HTMLCanvasElement): Promise<() => void> {
  await assertWebGpuAdapterOrThrow();
  await yieldToMain();
  await ensureStairwellCigaretteMeshReady();
  await yieldToMain();

  const scene = new THREE.Scene();

  let disposed = false;
  let raf = 0;
  let worldAttached = false;
  let buildingRootForDispose: THREE.Group | null = null;

  /** World-space stack bounds for orbit framing — grows each storey during progressive attach. */
  const framingBounds = AUTH_BACKDROP_FALLBACK_BUILDING_BOUNDS.clone();

  const backdropHooks: MegablockBackdropHooks = {
    onFloorPlateInstantiated: async ({ buildingRoot }) => {
      if (disposed) return;
      if (buildingRoot.parent !== scene) scene.add(buildingRoot);
      buildingRoot.updateMatrixWorld(true);
      framingBounds.copy(new THREE.Box3().setFromObject(buildingRoot));
      worldAttached = true;
      buildingRootForDispose = buildingRoot;
    },
  };

  primeMegablockStaticWorldMeshBuild({
    getBackdropHooks: () => (disposed ? null : backdropHooks),
  });

  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: FP_SESSION_WEBGPU_ANTIALIAS,
    forceWebGL: false,
  });
  await renderer.init();
  assertWebGpuRendererBackend(renderer);
  await yieldToMain();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, FP_SESSION_MAX_PIXEL_RATIO));

  const fpEnvironment = attachFpSessionEnvironment(scene, renderer);
  const camera = new THREE.PerspectiveCamera(
    AUTH_BACKDROP_CAMERA_FOV_DEG,
    1,
    0.1,
    FP_SESSION_SKY_CAMERA_FAR,
  );

  const buildingSizeScratch = new THREE.Vector3();
  const buildingCenterScratch = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const baseCameraOffset = new THREE.Vector3();
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

  void waitMegablockStaticWorldMeshReady()
    .then(async (world) => {
      if (disposed) return;
      hideUnitInteriorMeshesForExteriorAuthView(world.buildingRoot);
      await yieldToMain();
      if (world.buildingRoot.parent !== scene) scene.add(world.buildingRoot);
      if (world.cellRoot.parent !== scene) scene.add(world.cellRoot);
      await yieldToMain();
      world.buildingRoot.updateMatrixWorld(true);
      world.cellRoot.updateMatrixWorld(true);
      await yieldToMain();
      framingBounds.copy(world.buildingBodyWorldBounds);
      worldAttached = true;
      buildingRootForDispose = world.buildingRoot;
    })
    .catch((err: unknown) => {
      if (disposed) return;
      console.warn("[MammothAuthBackdrop] megablock mesh failed to attach", err);
    });

  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const nowSec = performance.now() * 0.001;
    const yawOrbit = nowSec * AUTH_BACKDROP_BUILDING_YAW_RAD_PER_SEC;
    const wobble =
      Math.sin(nowSec * AUTH_BACKDROP_ORBIT_WOBBLE_SPEED_SEC) *
      AUTH_BACKDROP_ORBIT_WOBBLE_AMPLITUDE_RAD;

    framingBounds.getSize(buildingSizeScratch);
    framingBounds.getCenter(buildingCenterScratch);
    lookTarget.copy(buildingCenterScratch);
    lookTarget.y = framingBounds.min.y + buildingSizeScratch.y * 0.35;

    baseCameraOffset.set(
      -Math.max(buildingSizeScratch.x * 0.58, 130),
      Math.max(buildingSizeScratch.y * 0.44, 30),
      Math.max(buildingSizeScratch.x * 0.5, 120),
    );
    cameraOffset.copy(baseCameraOffset).applyAxisAngle(worldUp, yawOrbit + wobble);
    camera.position.copy(lookTarget).add(cameraOffset);
    toCamFlat.subVectors(camera.position, lookTarget);
    toCamFlat.y = 0;
    const horizLenSq = toCamFlat.lengthSq();
    if (horizLenSq > 1e-6) {
      toCamFlat.multiplyScalar(1 / Math.sqrt(horizLenSq));
      framingShiftWorld.crossVectors(worldUp, toCamFlat).normalize();
      const framingM = buildingSizeScratch.x * AUTH_BACKDROP_RIGHT_FRAMING_WIDTH_FRAC;
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
    if (worldAttached && buildingRootForDispose) {
      restoreUnitInteriorMeshVisibilityAfterAuthView(buildingRootForDispose);
    }
    scene.clear();
    renderer.dispose();
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

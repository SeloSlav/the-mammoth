import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
  deepDisposeObject3D,
} from "@the-mammoth/engine";
import {
  FP_SESSION_MAX_PIXEL_RATIO,
  FP_SESSION_WEBGPU_ANTIALIAS,
} from "../game/fpSession/fpSessionConstants.js";
import { yieldToMain } from "../game/fpSession/yieldToMain.js";

const PREVIEW_MALE_URI = "/static/models/players/male.glb";
const PREVIEW_FEMALE_URI = "/static/models/players/female.glb";

export type ProfilePreviewAvatarBody = 0 | 1;

function previewUriForBody(body: ProfilePreviewAvatarBody): string {
  return body === 1 ? PREVIEW_FEMALE_URI : PREVIEW_MALE_URI;
}

async function loadGltfPrimaryOrMaleFallback(uri: string): Promise<{
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}> {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(uri);
    return { scene: gltf.scene, animations: [...gltf.animations] };
  } catch {
    if (uri !== PREVIEW_MALE_URI) {
      const gltf = await loader.loadAsync(PREVIEW_MALE_URI);
      return { scene: gltf.scene, animations: [...gltf.animations] };
    }
    throw new Error("[profilePreview] failed to load male player GLB");
  }
}

/**
 * WebGPU turntable preview for the profile gate. Drag horizontally on the canvas to yaw.
 * Female asset falls back to male when missing (same as mirror preload).
 */
export async function mountProfileCharacterPreview(
  canvas: HTMLCanvasElement,
  body: ProfilePreviewAvatarBody,
): Promise<() => void> {
  await assertWebGpuAdapterOrThrow();
  await yieldToMain();

  const uri = previewUriForBody(body);
  const { scene: srcScene, animations } = await loadGltfPrimaryOrMaleFallback(uri);

  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: FP_SESSION_WEBGPU_ANTIALIAS,
    alpha: true,
    forceWebGL: false,
  });
  await renderer.init();
  assertWebGpuRendererBackend(renderer);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, FP_SESSION_MAX_PIXEL_RATIO));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  const pivot = new THREE.Group();
  pivot.name = "profile_preview_pivot";

  const modelRoot = srcScene.clone(true);
  const box = new THREE.Box3().setFromObject(modelRoot);
  modelRoot.position.x -= (box.min.x + box.max.x) / 2;
  modelRoot.position.z -= (box.min.z + box.max.z) / 2;
  modelRoot.position.y -= box.min.y;

  const size = box.getSize(new THREE.Vector3());
  pivot.add(modelRoot);
  scene.add(pivot);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.92);
  key.position.set(2.2, 4.8, 3.4);
  scene.add(key);

  let mixer: THREE.AnimationMixer | null = null;
  const idleClip =
    animations.find((c) => /idle/i.test(c.name)) ??
    animations.find((c) => /stand/i.test(c.name)) ??
    animations[0];
  if (idleClip) {
    mixer = new THREE.AnimationMixer(modelRoot);
    mixer.clipAction(idleClip).play();
  }

  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const dist = Math.max(2.35, maxDim * 1.42);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.06, 48);
  camera.position.set(0, Math.min(1.58, size.y * 0.38 + 0.74), dist);
  camera.lookAt(0, Math.min(1.24, size.y * 0.46), 0);

  let dragging = false;
  let lastClientX = 0;

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    dragging = true;
    lastClientX = ev.clientX;
    canvas.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return;
    const dx = ev.clientX - lastClientX;
    lastClientX = ev.clientX;
    pivot.rotation.y += dx * 0.005;
  };
  const endDrag = (ev: PointerEvent) => {
    dragging = false;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let disposed = false;
  let raf = 0;
  let lastT = performance.now() * 0.001;

  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const now = performance.now() * 0.001;
    const dt = Math.min(0.05, now - lastT);
    lastT = now;
    mixer?.update(dt);
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endDrag);
    canvas.removeEventListener("pointercancel", endDrag);
    mixer?.stopAllAction();
    mixer = null;
    deepDisposeObject3D(scene);
    renderer.dispose();
  };
}

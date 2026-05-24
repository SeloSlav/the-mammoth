import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { editorKeyboardTargetIsFormField } from "./editorSceneTransformModeHotkeys.js";

type OrbitControlsInertiaState = OrbitControls & {
  _sphericalDelta?: { set: (x: number, y: number, z: number) => void };
  _panOffset?: { set: (x: number, y: number, z: number) => void };
};

const offsetScratch = new THREE.Vector3();

function clearOrbitControlsPendingMotion(orbitControls: OrbitControls): void {
  const internal = orbitControls as OrbitControlsInertiaState;
  internal._sphericalDelta?.set(0, 0, 0);
  internal._panOffset?.set(0, 0, 0);
}

/** Turn the orbit view 180° in place by mirroring the look target across the camera. */
export function flipEditorOrbitView180(
  camera: THREE.PerspectiveCamera,
  orbitControls: OrbitControls,
): void {
  offsetScratch.copy(orbitControls.target).sub(camera.position);
  const distance = offsetScratch.length();
  if (distance < 1e-6) return;

  offsetScratch.multiplyScalar(-1 / distance);
  orbitControls.target.copy(camera.position).addScaledVector(offsetScratch, distance);

  const damping = orbitControls.enableDamping;
  orbitControls.enableDamping = false;
  clearOrbitControlsPendingMotion(orbitControls);
  orbitControls.update();
  orbitControls.enableDamping = damping;
  orbitControls.dispatchEvent({ type: "change" });
}

export function editorOrbitFlipViewFromKeyboardEvent(
  ev: Pick<KeyboardEvent, "code" | "repeat" | "target" | "ctrlKey" | "metaKey" | "altKey">,
): boolean {
  if (ev.repeat) return false;
  if (ev.code !== "KeyH" && ev.code !== "End") return false;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
  if (editorKeyboardTargetIsFormField(ev.target)) return false;
  return true;
}

export function registerEditorOrbitFlipViewHotkey(opts: {
  getCanFlip: () => boolean;
  getCamera: () => THREE.PerspectiveCamera;
  getOrbitControls: () => OrbitControls;
  requestRender: () => void;
}): () => void {
  const { getCanFlip, getCamera, getOrbitControls, requestRender } = opts;

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (!editorOrbitFlipViewFromKeyboardEvent(ev)) return;
    if (!getCanFlip()) return;

    flipEditorOrbitView180(getCamera(), getOrbitControls());
    requestRender();
    ev.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}

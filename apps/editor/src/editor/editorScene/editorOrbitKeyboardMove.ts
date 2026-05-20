import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { editorKeyboardTargetIsFormField } from "./editorSceneTransformModeHotkeys.js";

type OrbitMoveAxis = "forward" | "back" | "left" | "right" | "up" | "down";

const ORBIT_MOVE_KEY_CODES: Readonly<Record<string, OrbitMoveAxis>> = {
  KeyW: "forward",
  KeyS: "back",
  KeyA: "left",
  KeyD: "right",
  KeyQ: "up",
  KeyE: "down",
};

export function createEditorOrbitKeyboardMove(deps: {
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  getSpeedMps: () => number;
  getEnabled: () => boolean;
}): { update: (dt: number) => void; dispose: () => void } {
  const { camera, orbitControls, getSpeedMps, getEnabled } = deps;

  const moveState: Record<OrbitMoveAxis, number> = {
    forward: 0,
    back: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
  };

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);

  const setAxis = (axis: OrbitMoveAxis, pressed: boolean): void => {
    moveState[axis] = pressed ? 1 : 0;
  };

  const onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || !getEnabled()) return;
    if (editorKeyboardTargetIsFormField(ev.target)) return;
    const axis = ORBIT_MOVE_KEY_CODES[ev.code];
    if (!axis) return;
    setAxis(axis, true);
    ev.preventDefault();
  };

  const onKeyUp = (ev: KeyboardEvent): void => {
    const axis = ORBIT_MOVE_KEY_CODES[ev.code];
    if (!axis) return;
    setAxis(axis, false);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const update = (dt: number): void => {
    if (!getEnabled()) return;

    const forwardAxis = moveState.forward - moveState.back;
    const strafeAxis = moveState.right - moveState.left;
    const verticalAxis = moveState.up - moveState.down;
    if (forwardAxis === 0 && strafeAxis === 0 && verticalAxis === 0) return;

    camera.getWorldDirection(forward).normalize();
    right.crossVectors(forward, worldUp);
    if (right.lengthSq() < 1e-10) {
      right.setFromMatrixColumn(camera.matrix, 0).normalize();
    } else {
      right.normalize();
    }

    const speed = getSpeedMps() * dt;
    delta.set(0, 0, 0);
    delta.addScaledVector(forward, forwardAxis * speed);
    delta.addScaledVector(right, strafeAxis * speed);
    delta.addScaledVector(worldUp, verticalAxis * speed);

    camera.position.add(delta);
    orbitControls.target.add(delta);
  };

  const dispose = (): void => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };

  return { update, dispose };
}

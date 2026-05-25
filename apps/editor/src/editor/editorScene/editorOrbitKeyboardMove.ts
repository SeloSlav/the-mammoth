import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EDITOR_ORBIT_KEYBOARD_YAW_RAD_PER_SEC } from "./editorOrbitSpeeds.js";
import { editorKeyboardTargetIsFormField } from "./editorSceneTransformModeHotkeys.js";
import { demandEditorSceneRender } from "./editorSceneRenderDemand.js";

type OrbitMoveAxis = "forward" | "back" | "left" | "right" | "orbitLeft" | "orbitRight";

const ORBIT_MOVE_KEY_CODES: Readonly<Record<string, OrbitMoveAxis>> = {
  KeyW: "forward",
  KeyS: "back",
  KeyA: "left",
  KeyD: "right",
  KeyQ: "orbitLeft",
  KeyE: "orbitRight",
};

export function createEditorOrbitKeyboardMove(deps: {
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  getSpeedMps: () => number;
  getEnabled: () => boolean;
}): { update: (dt: number) => void; isActive: () => boolean; dispose: () => void } {
  const { camera, orbitControls, getSpeedMps, getEnabled } = deps;

  const moveState: Record<OrbitMoveAxis, number> = {
    forward: 0,
    back: 0,
    left: 0,
    right: 0,
    orbitLeft: 0,
    orbitRight: 0,
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
    demandEditorSceneRender();
    ev.preventDefault();
  };

  const onKeyUp = (ev: KeyboardEvent): void => {
    const axis = ORBIT_MOVE_KEY_CODES[ev.code];
    if (!axis) return;
    setAxis(axis, false);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const isActive = (): boolean =>
    moveState.forward +
      moveState.back +
      moveState.left +
      moveState.right +
      moveState.orbitLeft +
      moveState.orbitRight >
    0;

  const update = (dt: number): void => {
    if (!getEnabled()) return;

    const forwardAxis = moveState.forward - moveState.back;
    const strafeAxis = moveState.right - moveState.left;
    const yawAxis = moveState.orbitLeft - moveState.orbitRight;

    if (yawAxis !== 0) {
      orbitControls.rotateLeft(yawAxis * EDITOR_ORBIT_KEYBOARD_YAW_RAD_PER_SEC * dt);
    }

    if (forwardAxis === 0 && strafeAxis === 0) return;

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

    camera.position.add(delta);
    orbitControls.target.add(delta);
  };

  const dispose = (): void => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };

  return { update, isActive, dispose };
}

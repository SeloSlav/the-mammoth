// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createEditorOrbitKeyboardMove } from "./editorOrbitKeyboardMove.js";

describe("createEditorOrbitKeyboardMove", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("yaws in place around the orbit target on Q / E without moving the pivot", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(5, 2, 0);
    const orbitControls = new OrbitControls(camera, null);
    orbitControls.enableDamping = false;
    orbitControls.target.set(0, 1.5, 0);
    orbitControls.update();

    const targetBefore = orbitControls.target.clone();
    const radiusBefore = camera.position.distanceTo(orbitControls.target);

    const move = createEditorOrbitKeyboardMove({
      camera,
      orbitControls,
      getSpeedMps: () => 18,
      getEnabled: () => true,
    });
    cleanups.push(() => move.dispose());

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", bubbles: true }));
    move.update(0.35);
    orbitControls.update();

    expect(orbitControls.target.distanceTo(targetBefore)).toBeLessThan(1e-6);
    expect(camera.position.distanceTo(orbitControls.target)).toBeCloseTo(radiusBefore, 5);

    const forwardBefore = new THREE.Vector3(0, 0, -1);
    camera.getWorldDirection(forwardBefore);
    expect(Math.abs(forwardBefore.x)).toBeGreaterThan(0.05);

    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyQ", bubbles: true }));
  });

  it("still pans with WASD without changing orbit radius", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2, 6);
    const orbitControls = new OrbitControls(camera, null);
    orbitControls.enableDamping = false;
    orbitControls.target.set(0, 1.5, 0);
    orbitControls.update();

    const radiusBefore = camera.position.distanceTo(orbitControls.target);

    const move = createEditorOrbitKeyboardMove({
      camera,
      orbitControls,
      getSpeedMps: () => 12,
      getEnabled: () => true,
    });
    cleanups.push(() => move.dispose());

    const cameraBefore = camera.position.clone();
    const targetBefore = orbitControls.target.clone();

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
    move.update(0.1);
    orbitControls.update();
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", bubbles: true }));

    expect(camera.position.distanceTo(cameraBefore)).toBeGreaterThan(0.1);
    expect(orbitControls.target.distanceTo(targetBefore)).toBeGreaterThan(0.1);
    expect(camera.position.distanceTo(orbitControls.target)).toBeCloseTo(radiusBefore, 5);
  });
});

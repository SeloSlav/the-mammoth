import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createEditorOrbitDistanceSpeedBinder } from "./editorOrbitDistanceSpeedBinder.js";
import { EDITOR_ORBIT_MIN_DISTANCE_M } from "./editorOrbitSpeeds.js";

describe("createEditorOrbitDistanceSpeedBinder", () => {
  it("binds speeds once until distance changes meaningfully", () => {
    const camera = new THREE.PerspectiveCamera();
    const orbitControls = new OrbitControls(camera, null);
    const bind = createEditorOrbitDistanceSpeedBinder({ camera, orbitControls });

    camera.position.set(0, 0, 6.5);
    orbitControls.target.set(0, 0, 0);
    bind();
    const initialRotate = orbitControls.rotateSpeed;

    camera.position.set(0, 0, 6.48);
    bind();
    expect(orbitControls.rotateSpeed).toBe(initialRotate);

    camera.position.set(0, 0, EDITOR_ORBIT_MIN_DISTANCE_M);
    bind();
    expect(orbitControls.rotateSpeed).toBeGreaterThan(initialRotate);
  });
});

describe("attachEditorOrbitSnappyFeel", () => {
  it("flushes queued delta and clears inertia on release", async () => {
    const { attachEditorOrbitSnappyFeel } = await import("./editorOrbitSnappyFeel.js");
    const camera = new THREE.PerspectiveCamera();
    const orbitControls = new OrbitControls(camera, null);
    const detach = attachEditorOrbitSnappyFeel(orbitControls);

    orbitControls.enableDamping = true;
    orbitControls.rotateLeft(0.25);
    expect(orbitControls.enableDamping).toBe(true);

    orbitControls.dispatchEvent({ type: "end" });

    const internal = orbitControls as OrbitControls & {
      _sphericalDelta: { theta: number; phi: number };
      _panOffset: THREE.Vector3;
    };
    expect(internal._sphericalDelta.theta).toBe(0);
    expect(internal._sphericalDelta.phi).toBe(0);
    expect(internal._panOffset.lengthSq()).toBe(0);
    expect(orbitControls.enableDamping).toBe(true);

    detach();
  });
});

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  editorOrbitFlipViewFromKeyboardEvent,
  flipEditorOrbitView180,
} from "./editorOrbitFlipView.js";

describe("flipEditorOrbitView180", () => {
  it("turns the view 180° in place by mirroring the orbit target", () => {
    const camera = new THREE.PerspectiveCamera();
    const orbitControls = new OrbitControls(camera, null);
    orbitControls.target.set(0, 1.5, 5);
    camera.position.set(0, 1.5, 0);
    orbitControls.update();

    const beforeDistance = camera.position.distanceTo(orbitControls.target);
    const beforeForward = new THREE.Vector3();
    camera.getWorldDirection(beforeForward);

    flipEditorOrbitView180(camera, orbitControls);

    const afterDistance = camera.position.distanceTo(orbitControls.target);
    const afterForward = new THREE.Vector3();
    camera.getWorldDirection(afterForward);

    expect(camera.position.x).toBeCloseTo(0, 5);
    expect(camera.position.y).toBeCloseTo(1.5, 5);
    expect(camera.position.z).toBeCloseTo(0, 5);
    expect(orbitControls.target.x).toBeCloseTo(0, 5);
    expect(orbitControls.target.y).toBeCloseTo(1.5, 5);
    expect(orbitControls.target.z).toBeCloseTo(-5, 5);
    expect(afterDistance).toBeCloseTo(beforeDistance, 5);
    expect(afterForward.dot(beforeForward)).toBeCloseTo(-1, 5);
  });

  it("no-ops when the camera sits on the orbit target", () => {
    const camera = new THREE.PerspectiveCamera();
    const orbitControls = new OrbitControls(camera, null);
    orbitControls.target.set(1, 2, 3);
    camera.position.copy(orbitControls.target);

    flipEditorOrbitView180(camera, orbitControls);

    expect(camera.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe("editorOrbitFlipViewFromKeyboardEvent", () => {
  it("accepts H and End without modifiers", () => {
    expect(
      editorOrbitFlipViewFromKeyboardEvent({
        code: "KeyH",
        repeat: false,
        target: null,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true);
    expect(
      editorOrbitFlipViewFromKeyboardEvent({
        code: "End",
        repeat: false,
        target: null,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true);
  });

  it("rejects other keys and modifiers", () => {
    expect(
      editorOrbitFlipViewFromKeyboardEvent({
        code: "Home",
        repeat: false,
        target: null,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false);
    expect(
      editorOrbitFlipViewFromKeyboardEvent({
        code: "End",
        repeat: true,
        target: null,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false);
    expect(
      editorOrbitFlipViewFromKeyboardEvent({
        code: "End",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false);
  });
});

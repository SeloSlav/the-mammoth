import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyEditorArrowDirectionalScaleNudge,
  editorArrowNudgeDirectionalScaleRequest,
  editorArrowNudgeDominantScaleAxis,
  editorArrowNudgeKey,
  editorArrowNudgeStep,
} from "./editorSceneArrowNudgeHotkeys.js";

describe("editor arrow nudge hotkeys", () => {
  it("recognizes only arrow keys", () => {
    expect(editorArrowNudgeKey("ArrowLeft")).toBe("ArrowLeft");
    expect(editorArrowNudgeKey("ArrowRight")).toBe("ArrowRight");
    expect(editorArrowNudgeKey("ArrowUp")).toBe("ArrowUp");
    expect(editorArrowNudgeKey("ArrowDown")).toBe("ArrowDown");
    expect(editorArrowNudgeKey("KeyW")).toBeNull();
  });

  it("uses grid snap when enabled and supports coarse/fine modifiers", () => {
    expect(
      editorArrowNudgeStep({
        baseStep: 0.01,
        gridSnapM: 0,
        shiftKey: false,
        altKey: false,
      }),
    ).toBeCloseTo(0.01);
    expect(
      editorArrowNudgeStep({
        baseStep: 0.01,
        gridSnapM: 0.05,
        shiftKey: true,
        altKey: false,
      }),
    ).toBeCloseTo(0.5);
    expect(
      editorArrowNudgeStep({
        baseStep: 0.01,
        gridSnapM: 0.05,
        shiftKey: false,
        altKey: true,
      }),
    ).toBeCloseTo(0.005);
  });

  it("maps scale arrows to the dominant screen axis", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    expect(editorArrowNudgeDominantScaleAxis(camera, "ArrowLeft")).toBe("x");
    expect(editorArrowNudgeDominantScaleAxis(camera, "ArrowRight")).toBe("x");
    expect(editorArrowNudgeDominantScaleAxis(camera, "ArrowUp")).toBe("y");
    expect(editorArrowNudgeDominantScaleAxis(camera, "ArrowDown")).toBe("y");
    expect(editorArrowNudgeDirectionalScaleRequest(camera, "ArrowDown")).toEqual({
      axis: "y",
      sideSign: -1,
    });
  });

  it("scales one face directionally while anchoring the opposite face", () => {
    const object = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    object.add(mesh);

    applyEditorArrowDirectionalScaleNudge(object, "y", -1, 0.5);

    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    expect(box.max.y).toBeCloseTo(1);
    expect(box.min.y).toBeCloseTo(-1.5);
    expect(object.scale.y).toBeCloseTo(1.25);
    expect(object.position.y).toBeCloseTo(-0.25);
  });

  it("clamps directional scale nudges above zero", () => {
    const object = new THREE.Object3D();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    object.add(mesh);
    object.scale.set(0.005, 1, 1);

    applyEditorArrowDirectionalScaleNudge(object, "x", 1, -1);

    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    expect(box.max.x - box.min.x).toBeCloseTo(0.001);
  });
});

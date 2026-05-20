import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMyApartmentDecorUniformScale,
  constrainMyApartmentDecorScaleFromGizmo,
  isMyApartmentDecorUniformScaleAxis,
  readMyApartmentDecorCommittedScale,
} from "./editorMyApartmentDecorScale.js";

describe("editorMyApartmentDecorScale", () => {
  it("treats center and XYZ axes as uniform scale", () => {
    expect(isMyApartmentDecorUniformScaleAxis("XYZ")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("E")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("Y")).toBe(false);
  });

  it("pins X/Z when dragging the Y handle so only height changes", () => {
    const root = new THREE.Object3D();
    root.scale.set(1.2, 1.2, 1.2);
    const pin = { startScale: root.scale.clone() };
    root.scale.set(1.2, 2.4, 1.2);
    constrainMyApartmentDecorScaleFromGizmo(root, {
      transformMode: "scale",
      axis: "Y",
      dragging: true,
      gesturePin: pin,
    });
    expect(root.scale.x).toBeCloseTo(1.2, 4);
    expect(root.scale.z).toBeCloseTo(1.2, 4);
    expect(root.scale.y).toBeCloseTo(2.4, 4);
  });

  it("commits vertical stretch separately from uniformScale", () => {
    const root = new THREE.Object3D();
    root.scale.set(1, 2, 1);
    const committed = readMyApartmentDecorCommittedScale(root);
    expect(committed.uniformScale).toBeCloseTo(1, 4);
    expect(committed.verticalScaleMul).toBeCloseTo(2, 4);
  });

  it("resets verticalScaleMul when scale is uniform", () => {
    const root = new THREE.Object3D();
    root.scale.set(1.5, 1.5, 1.5);
    applyMyApartmentDecorUniformScale(root);
    const committed = readMyApartmentDecorCommittedScale(root);
    expect(committed.uniformScale).toBeCloseTo(1.5, 4);
    expect(committed.verticalScaleMul).toBe(1);
  });
});

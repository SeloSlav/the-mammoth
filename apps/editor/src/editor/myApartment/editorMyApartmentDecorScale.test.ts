import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMyApartmentDecorUniformScale,
  constrainMyApartmentDecorScaleFromGizmo,
  isMyApartmentDecorUniformScaleAxis,
  readMyApartmentDecorCommittedScale,
} from "./editorMyApartmentDecorScale.js";

describe("editorMyApartmentDecorScale", () => {
  it("treats only the center cube as uniform scale", () => {
    expect(isMyApartmentDecorUniformScaleAxis("XYZ")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("E")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("XYZE")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("XY")).toBe(false);
    expect(isMyApartmentDecorUniformScaleAxis("YZ")).toBe(false);
    expect(isMyApartmentDecorUniformScaleAxis("XZ")).toBe(false);
    expect(isMyApartmentDecorUniformScaleAxis(null)).toBe(false);
    expect(isMyApartmentDecorUniformScaleAxis("Y")).toBe(false);
    expect(isMyApartmentDecorUniformScaleAxis("X")).toBe(false);
    expect(isMyApartmentDecorUniformScaleAxis("Z")).toBe(false);
  });

  it("collapses center-cube drags to uniform scale on all axes", () => {
    const root = new THREE.Object3D();
    root.scale.set(2, 2, 2);
    constrainMyApartmentDecorScaleFromGizmo(root, {
      transformMode: "scale",
      axis: "XYZ",
      dragging: true,
      gesturePin: { startScale: new THREE.Vector3(1, 1, 1) },
    });
    expect(root.scale.x).toBeCloseTo(2, 4);
    expect(root.scale.y).toBeCloseTo(2, 4);
    expect(root.scale.z).toBeCloseTo(2, 4);
  });

  it("keeps plane-square drags on their active axes only", () => {
    const root = new THREE.Object3D();
    const pin = { startScale: new THREE.Vector3(1, 1, 1.5) };
    root.scale.set(2, 2, 1.5);
    constrainMyApartmentDecorScaleFromGizmo(root, {
      transformMode: "scale",
      axis: "XY",
      dragging: true,
      gesturePin: pin,
    });
    expect(root.scale.x).toBeCloseTo(2, 4);
    expect(root.scale.y).toBeCloseTo(2, 4);
    expect(root.scale.z).toBeCloseTo(1.5, 4);
  });

  it("pins X/Z when dragging the Y handle so only height changes", () => {
    const root = new THREE.Object3D();
    const pin = { startScale: root.scale.clone() };
    root.scale.set(1.2, 1.2, 1.2);
    pin.startScale.copy(root.scale);
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

  it("pins Y/Z when dragging the X handle", () => {
    const root = new THREE.Object3D();
    const pin = { startScale: new THREE.Vector3(1, 1.5, 2) };
    root.scale.set(2.5, 1.5, 2);
    constrainMyApartmentDecorScaleFromGizmo(root, {
      transformMode: "scale",
      axis: "X",
      dragging: true,
      gesturePin: pin,
    });
    expect(root.scale.x).toBeCloseTo(2.5, 4);
    expect(root.scale.y).toBeCloseTo(1.5, 4);
    expect(root.scale.z).toBeCloseTo(2, 4);
  });

  it("commits per-axis scale fields", () => {
    const root = new THREE.Object3D();
    root.scale.set(2, 1, 1.5);
    const committed = readMyApartmentDecorCommittedScale(root);
    expect(committed.scaleX).toBeCloseTo(2, 4);
    expect(committed.scaleY).toBeCloseTo(1, 4);
    expect(committed.scaleZ).toBeCloseTo(1.5, 4);
  });

  it("resets verticalScaleMul when scale is uniform", () => {
    const root = new THREE.Object3D();
    root.scale.set(1.5, 1.5, 1.5);
    applyMyApartmentDecorUniformScale(root);
    const committed = readMyApartmentDecorCommittedScale(root);
    expect(committed.uniformScale).toBeCloseTo(1.5, 4);
    expect(committed.verticalScaleMul).toBe(1);
  });

  it("does not touch scale outside scale mode", () => {
    const root = new THREE.Object3D();
    root.scale.set(2, 1, 1.5);
    constrainMyApartmentDecorScaleFromGizmo(root, {
      transformMode: "translate",
      axis: "Y",
      dragging: true,
      gesturePin: null,
    });
    expect(root.scale.x).toBeCloseTo(2, 4);
    expect(root.scale.y).toBeCloseTo(1, 4);
    expect(root.scale.z).toBeCloseTo(1.5, 4);
  });
});

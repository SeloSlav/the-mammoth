import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMyApartmentDecorPlaneUniformScaleFromGesture,
  applyMyApartmentDecorSingleAxisScaleFromGesture,
  applyMyApartmentDecorUniformScale,
  applyMyApartmentDecorUniformScaleFromGesture,
  constrainMyApartmentDecorScaleFromGizmo,
  isMyApartmentDecorPlaneScaleAxis,
  isMyApartmentDecorSingleAxisScaleAxis,
  isMyApartmentDecorUniformScaleAxis,
  myApartmentDecorPointerDistanceScaleFactor,
  readMyApartmentDecorCommittedScale,
} from "./editorMyApartmentDecorScale.js";

describe("editorMyApartmentDecorScale", () => {
  it("treats only the center cube as uniform scale", () => {
    expect(isMyApartmentDecorUniformScaleAxis("XYZ")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("E")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("XYZE")).toBe(true);
    expect(isMyApartmentDecorUniformScaleAxis("XY")).toBe(false);
    expect(isMyApartmentDecorUniformScaleAxis("Y")).toBe(false);
  });

  it("derives one proportional factor from pointer distance on plane squares", () => {
    expect(isMyApartmentDecorPlaneScaleAxis("XY")).toBe(true);
    expect(isMyApartmentDecorSingleAxisScaleAxis("X")).toBe(true);

    const pointerStart = new THREE.Vector3(1, 0, 0);
    const pointerEnd = new THREE.Vector3(2, 0, 0);
    expect(myApartmentDecorPointerDistanceScaleFactor(pointerStart, pointerEnd)).toBeCloseTo(
      2,
      4,
    );

    const root = new THREE.Object3D();
    const startScale = new THREE.Vector3(1, 1.5, 2);
    applyMyApartmentDecorPlaneUniformScaleFromGesture(
      root,
      "XY",
      startScale,
      pointerStart,
      pointerEnd,
    );
    expect(root.scale.x).toBeCloseTo(2, 4);
    expect(root.scale.y).toBeCloseTo(3, 4);
    expect(root.scale.z).toBeCloseTo(2, 4);
  });

  it("uses the same pointer factor at diagonal drag angles on a plane", () => {
    const pointerStart = new THREE.Vector3(1, 1, 0).normalize();
    const pointerEnd = new THREE.Vector3(2, 2, 0).normalize();
    const factor = myApartmentDecorPointerDistanceScaleFactor(pointerStart, pointerEnd);

    const root = new THREE.Object3D();
    const startScale = new THREE.Vector3(1, 2, 3);
    applyMyApartmentDecorPlaneUniformScaleFromGesture(
      root,
      "XY",
      startScale,
      pointerStart,
      pointerEnd,
    );
    expect(root.scale.x).toBeCloseTo(startScale.x * factor, 4);
    expect(root.scale.y).toBeCloseTo(startScale.y * factor, 4);
    expect(root.scale.x / startScale.x).toBeCloseTo(root.scale.y / startScale.y, 4);
    expect(root.scale.z).toBeCloseTo(3, 4);
  });

  it("collapses center-cube drags to uniform scale on all axes", () => {
    const root = new THREE.Object3D();
    const startScale = new THREE.Vector3(1, 1, 1);
    applyMyApartmentDecorUniformScaleFromGesture(
      root,
      startScale,
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
    );
    expect(root.scale.x).toBeCloseTo(2, 4);
    expect(root.scale.y).toBeCloseTo(2, 4);
    expect(root.scale.z).toBeCloseTo(2, 4);
  });

  it("pins X/Z when dragging the Y handle so only height changes", () => {
    const root = new THREE.Object3D();
    const startScale = new THREE.Vector3(1.2, 1.2, 1.2);
    root.scale.set(1.2, 2.4, 1.2);
    applyMyApartmentDecorSingleAxisScaleFromGesture(root, "Y", startScale);
    expect(root.scale.x).toBeCloseTo(1.2, 4);
    expect(root.scale.z).toBeCloseTo(1.2, 4);
    expect(root.scale.y).toBeCloseTo(2.4, 4);
  });

  it("pins Y/Z when dragging the X handle", () => {
    const root = new THREE.Object3D();
    const startScale = new THREE.Vector3(1, 1.5, 2);
    root.scale.set(2.5, 1.5, 2);
    applyMyApartmentDecorSingleAxisScaleFromGesture(root, "X", startScale);
    expect(root.scale.x).toBeCloseTo(2.5, 4);
    expect(root.scale.y).toBeCloseTo(1.5, 4);
    expect(root.scale.z).toBeCloseTo(2, 4);
  });

  it("routes gizmo axes through pointer, plane, and single-axis handlers", () => {
    const root = new THREE.Object3D();
    const pin = {
      startScale: new THREE.Vector3(1, 1, 1),
      pointerStart: new THREE.Vector3(1, 0, 0),
    };
    root.scale.set(1, 2, 1);
    constrainMyApartmentDecorScaleFromGizmo(root, {
      transformMode: "scale",
      axis: "Y",
      dragging: true,
      gesturePin: pin,
      pointerEnd: new THREE.Vector3(1, 0, 0),
    });
    expect(root.scale.x).toBeCloseTo(1, 4);
    expect(root.scale.y).toBeCloseTo(2, 4);
    expect(root.scale.z).toBeCloseTo(1, 4);

    root.scale.set(1, 1, 1);
    constrainMyApartmentDecorScaleFromGizmo(root, {
      transformMode: "scale",
      axis: "XY",
      dragging: true,
      gesturePin: pin,
      pointerEnd: new THREE.Vector3(2, 0, 0),
    });
    expect(root.scale.x).toBeCloseTo(2, 4);
    expect(root.scale.y).toBeCloseTo(2, 4);
    expect(root.scale.z).toBeCloseTo(1, 4);
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

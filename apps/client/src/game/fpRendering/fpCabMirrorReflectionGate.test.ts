import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY } from "@the-mammoth/world";
import {
  cabMirrorReflectionFacingScore,
  cabMirrorReflectionWorthUpdating,
  FP_APARTMENT_MIRROR_REFLECTION_MAX_DISTANCE_M,
  FP_APARTMENT_MIRROR_REFLECTION_MIN_FACING_DOT,
  pickCabMirrorPrimaryUpdateIndex,
} from "./fpCabMirrorReflectionGate.js";

describe("cabMirrorReflectionWorthUpdating", () => {
  it("returns false when mirror is behind the camera (XZ)", () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 1.6, 0);
    mesh.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 2);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(cabMirrorReflectionWorthUpdating(mesh, cam, forward)).toBe(false);
  });

  it("returns true when mirror is ahead within distance", () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 1.6, 8);
    mesh.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(cabMirrorReflectionWorthUpdating(mesh, cam, forward)).toBe(true);
  });
});

describe("cabMirrorReflectionFacingScore", () => {
  it("returns -1 when outside forward cone", () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 1.6, 0);
    mesh.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 2);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(cabMirrorReflectionFacingScore(mesh, cam, forward)).toBe(-1);
  });

  it("returns positive when mirror is ahead", () => {
    const mesh = new THREE.Mesh();
    mesh.position.set(0, 1.6, 8);
    mesh.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(cabMirrorReflectionFacingScore(mesh, cam, forward)).toBeGreaterThan(0);
  });
});

describe("pickCabMirrorPrimaryUpdateIndex", () => {
  it("returns -1 when every surface is invisible", () => {
    const a = new THREE.Mesh();
    a.position.set(0, 1.6, 8);
    a.visible = false;
    a.updateMatrixWorld(true);
    const b = new THREE.Mesh();
    b.position.set(8, 1.6, 0);
    b.visible = false;
    b.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    expect(
      pickCabMirrorPrimaryUpdateIndex([{ surface: a }, { surface: b }], {
        cameraWorld: cam,
        cameraForward: forward,
      }),
    ).toBe(-1);
  });

  it("prefers the mirror more aligned with the view among eligible surfaces", () => {
    const ahead = new THREE.Mesh();
    ahead.position.set(0, 1.6, 4);
    ahead.updateMatrixWorld(true);
    const side = new THREE.Mesh();
    side.position.set(3.5, 1.6, 1.5);
    side.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    const idx = pickCabMirrorPrimaryUpdateIndex([{ surface: ahead }, { surface: side }], {
      cameraWorld: cam,
      cameraForward: forward,
    });
    expect(idx).toBe(0);
  });

  it("returns -1 when looking vertically so reflections do not duplicate the whole scene", () => {
    const ahead = new THREE.Mesh();
    ahead.position.set(0, 1.6, 4);
    ahead.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forwardUp = new THREE.Vector3(0.05, 0.92, 0.1).normalize();
    expect(
      pickCabMirrorPrimaryUpdateIndex([{ surface: ahead }], {
        cameraWorld: cam,
        cameraForward: forwardUp,
        skipReflectionWhenVerticalLookAboveAbsY: 0.62,
      }),
    ).toBe(-1);
    const forwardFlat = new THREE.Vector3(0, 0, 1);
    expect(
      pickCabMirrorPrimaryUpdateIndex([{ surface: ahead }], {
        cameraWorld: cam,
        cameraForward: forwardFlat,
        skipReflectionWhenVerticalLookAboveAbsY: 0.62,
      }),
    ).toBe(0);
  });

  it("skips apartment mirrors outside the containing unit or view frustum", () => {
    const apt = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.28));
    apt.position.set(0, 1.4, 1.2);
    apt.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY] = true;
    apt.userData.mammothApartmentUnitKey = "unit_a";
    apt.updateMatrixWorld(true);
    const cab = new THREE.Mesh();
    cab.position.set(0, 1.6, 4);
    cab.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(0, 0, 1);

    expect(
      pickCabMirrorPrimaryUpdateIndex([{ surface: apt }, { surface: cab }], {
        cameraWorld: cam,
        cameraForward: forward,
        containingResidentialUnitKey: "unit_b",
      }),
    ).toBe(1);

    const viewCam = new THREE.PerspectiveCamera(75, 1, 0.1, 50);
    viewCam.position.copy(cam);
    viewCam.lookAt(0, 1.4, 2);
    viewCam.updateMatrixWorld(true);
    const frustum = new THREE.Frustum();
    const proj = new THREE.Matrix4().multiplyMatrices(
      viewCam.projectionMatrix,
      viewCam.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(proj);

    const idxInUnit = pickCabMirrorPrimaryUpdateIndex([{ surface: apt }], {
      cameraWorld: cam,
      cameraForward: forward,
      containingResidentialUnitKey: "unit_a",
      viewFrustum: frustum,
    });
    expect(idxInUnit).toBe(0);
  });

  it("uses stricter distance for apartment mirrors than cab mirrors", () => {
    const apt = new THREE.Mesh();
    apt.position.set(0, 1.4, 2.2);
    apt.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY] = true;
    apt.userData.mammothApartmentUnitKey = "u1";
    apt.updateMatrixWorld(true);
    const cam = new THREE.Vector3(0, 1.6, 0);
    const forward = new THREE.Vector3(0, 0, 1);
    const score = cabMirrorReflectionFacingScore(apt, cam, forward, {
      maxDistanceM: FP_APARTMENT_MIRROR_REFLECTION_MAX_DISTANCE_M,
      minFacingDot: FP_APARTMENT_MIRROR_REFLECTION_MIN_FACING_DOT,
    });
    expect(score).toBe(-1);
  });
});

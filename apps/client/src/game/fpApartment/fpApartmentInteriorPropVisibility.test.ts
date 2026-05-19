import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  apartmentPropBehindCameraWhenInterior,
  resolveApartmentInteriorPropGroupVisible,
} from "./fpApartmentInteriorPropVisibility.js";

describe("apartmentPropBehindCameraWhenInterior", () => {
  it("hides props whose bounds center is behind the camera", () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(-1, 1, 1));
    const camPos = new THREE.Vector3(0, 0.5, 0.5);
    const camDir = new THREE.Vector3(1, 0, 0);
    expect(apartmentPropBehindCameraWhenInterior(bounds, camPos, camDir)).toBe(true);
  });

  it("keeps props in front of the camera", () => {
    const bounds = new THREE.Box3(new THREE.Vector3(3, 0, 0), new THREE.Vector3(4, 1, 1));
    const camPos = new THREE.Vector3(0, 0.5, 0.5);
    const camDir = new THREE.Vector3(1, 0, 0);
    expect(apartmentPropBehindCameraWhenInterior(bounds, camPos, camDir)).toBe(false);
  });
});

describe("resolveApartmentInteriorPropGroupVisible", () => {
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    new THREE.PerspectiveCamera(75, 1, 0.1, 100).projectionMatrix,
  );
  const camPos = new THREE.Vector3(0, 0, 0);
  const camDir = new THREE.Vector3(0, 0, -1);

  it("hides non-containing units when a containing unit key is set", () => {
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        containingUnitKey: "unit_a",
        groupUnitKey: "unit_b",
        propWorldBounds: new THREE.Box3(new THREE.Vector3(-1, -1, -2), new THREE.Vector3(1, 1, -1)),
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(false);
  });

  it("hides containing-unit props behind the camera even when bounds intersect the frustum", () => {
    const behindBounds = new THREE.Box3(
      new THREE.Vector3(-1, -1, 1),
      new THREE.Vector3(1, 1, 2),
    );
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        containingUnitKey: "unit_a",
        groupUnitKey: "unit_a",
        propWorldBounds: behindBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(false);
  });
});

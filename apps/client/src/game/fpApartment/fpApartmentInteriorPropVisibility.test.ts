import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  apartmentPropBehindCameraWhenInterior,
  apartmentPropOutsideForwardViewWhenInterior,
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

describe("apartmentPropOutsideForwardViewWhenInterior", () => {
  it("hides props in the peripheral view cone while inside a unit", () => {
    const bounds = new THREE.Box3(new THREE.Vector3(2.5, 0, -2), new THREE.Vector3(3.5, 1, -1));
    const camPos = new THREE.Vector3(0, 0.5, 0.5);
    const camDir = new THREE.Vector3(0, 0, -1);
    expect(apartmentPropOutsideForwardViewWhenInterior(bounds, camPos, camDir)).toBe(true);
  });

  it("keeps props near the view axis", () => {
    const bounds = new THREE.Box3(new THREE.Vector3(0, 0, -4), new THREE.Vector3(1, 1, -3));
    const camPos = new THREE.Vector3(0, 0.5, 0.5);
    const camDir = new THREE.Vector3(0, 0, -1);
    expect(apartmentPropOutsideForwardViewWhenInterior(bounds, camPos, camDir)).toBe(false);
  });
});

function apartmentPropTestView(): {
  frustum: THREE.Frustum;
  camPos: THREE.Vector3;
  camDir: THREE.Vector3;
} {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, 0.5, 0.5);
  camera.lookAt(0, 0.5, -10);
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  frustum.setFromProjectionMatrix(viewProjection);
  return {
    frustum,
    camPos: camera.getWorldPosition(new THREE.Vector3()),
    camDir: camera.getWorldDirection(new THREE.Vector3()),
  };
}

describe("resolveApartmentInteriorPropGroupVisible", () => {
  const { frustum, camPos, camDir } = apartmentPropTestView();

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

  it("hides containing-unit props outside the forward view cone even when in the frustum", () => {
    const peripheralBounds = new THREE.Box3(
      new THREE.Vector3(1.4, -1, -2),
      new THREE.Vector3(2.4, 1, 0),
    );
    expect(
      apartmentPropOutsideForwardViewWhenInterior(peripheralBounds, camPos, camDir),
    ).toBe(true);
    expect(frustum.intersectsBox(peripheralBounds)).toBe(true);
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        containingUnitKey: "unit_a",
        groupUnitKey: "unit_a",
        propWorldBounds: peripheralBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(false);
  });

  it("does not apply the forward cone for hallway peeks without a containing unit", () => {
    const peripheralBounds = new THREE.Box3(
      new THREE.Vector3(1.4, -1, -2),
      new THREE.Vector3(2.4, 1, 0),
    );
    expect(
      apartmentPropOutsideForwardViewWhenInterior(peripheralBounds, camPos, camDir),
    ).toBe(true);
    expect(frustum.intersectsBox(peripheralBounds)).toBe(true);
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        containingUnitKey: null,
        groupUnitKey: "unit_a",
        propWorldBounds: peripheralBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(true);
  });
});

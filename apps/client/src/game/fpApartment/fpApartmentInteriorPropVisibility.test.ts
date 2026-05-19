import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  apartmentPropBehindCameraWhenInterior,
  applyApartmentInteriorPropVisibilityBudget,
  clearApartmentInteriorPropVisibilityBudgetState,
  createApartmentInteriorPropVisibilityBudgetState,
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
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

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

  it("keeps a visible in-unit prop in the side band until clearly behind", () => {
    const peripheralBounds = new THREE.Box3(
      new THREE.Vector3(0.05, -1, -0.53),
      new THREE.Vector3(0.55, 1, 0.47),
    );
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        containingUnitKey: "unit_a",
        groupUnitKey: "unit_a",
        propWorldBounds: peripheralBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
        wasVisible: true,
      }),
    ).toBe(true);
  });

  it("defers newly visible in-unit props until they are clearly in front", () => {
    const peripheralBounds = new THREE.Box3(
      new THREE.Vector3(0.05, -1, -0.53),
      new THREE.Vector3(0.55, 1, 0.47),
    );
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        containingUnitKey: "unit_a",
        groupUnitKey: "unit_a",
        propWorldBounds: peripheralBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
        wasVisible: false,
      }),
    ).toBe(false);
  });
});

describe("applyApartmentInteriorPropVisibilityBudget", () => {
  it("shows only the forward-most pending props within the per-frame budget", () => {
    const state = createApartmentInteriorPropVisibilityBudgetState();
    const front = new THREE.Group();
    const side = new THREE.Group();
    const back = new THREE.Group();

    applyApartmentInteriorPropVisibilityBudget(
      [
        { key: "front", object: front, desiredVisible: true, forwardDot: 0.9 },
        { key: "side", object: side, desiredVisible: true, forwardDot: 0.2 },
        { key: "back", object: back, desiredVisible: true, forwardDot: -0.4 },
      ],
      state,
      1,
    );

    expect(front.visible).toBe(true);
    expect(side.visible).toBe(false);
    expect(back.visible).toBe(false);
    expect(state.visibleKeys.has("front")).toBe(true);
    expect(state.visibleKeys.has("side")).toBe(false);

    applyApartmentInteriorPropVisibilityBudget(
      [
        { key: "front", object: front, desiredVisible: true, forwardDot: 0.9 },
        { key: "side", object: side, desiredVisible: true, forwardDot: 0.2 },
        { key: "back", object: back, desiredVisible: true, forwardDot: -0.4 },
      ],
      state,
      1,
    );

    expect(front.visible).toBe(true);
    expect(side.visible).toBe(true);
    expect(back.visible).toBe(false);

    clearApartmentInteriorPropVisibilityBudgetState(state);
  });

  it("hides props immediately when they fall out of the desired set", () => {
    const state = createApartmentInteriorPropVisibilityBudgetState();
    const prop = new THREE.Group();
    state.visibleKeys.add("prop");
    prop.visible = true;

    applyApartmentInteriorPropVisibilityBudget(
      [{ key: "prop", object: prop, desiredVisible: false, forwardDot: -1 }],
      state,
    );

    expect(prop.visible).toBe(false);
    expect(state.visibleKeys.has("prop")).toBe(false);
  });
});

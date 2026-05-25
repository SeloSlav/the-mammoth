import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  apartmentInteriorPropWarmupPendingForUnit,
  apartmentPropBehindCameraWhenInterior,
  applyApartmentInteriorPropVisibility,
  applyApartmentInteriorPropVisibilityBudget,
  clearApartmentInteriorPropVisibilityState,
  createApartmentInteriorPropVisibilityState,
  markAllApartmentInteriorPropsWarmedForUnit,
  resolveApartmentInteriorPropGroupVisible,
  resolveApartmentInteriorPropWarmUpVisible,
  syncApartmentInteriorPropVisibilityUnit,
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

  it("hides all decor when the viewer is not inside any residential unit", () => {
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: null,
        groupUnitKey: "unit_a",
        propWorldBounds: new THREE.Box3(new THREE.Vector3(-1, -1, -2), new THREE.Vector3(1, 1, 2)),
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(false);
  });

  it("hides non-containing units when a containing unit key is set", () => {
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
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
        visibleUnitKeys: new Set(["unit_a"]),
        groupUnitKey: "unit_a",
        propWorldBounds: behindBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(false);
  });

  it("shows peripheral in-unit props in steady state without forward-cone hysteresis", () => {
    const peripheralBounds = new THREE.Box3(
      new THREE.Vector3(0.05, -1, -0.53),
      new THREE.Vector3(0.55, 1, 0.47),
    );
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
        groupUnitKey: "unit_a",
        propWorldBounds: peripheralBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(true);
  });

  it("shows retained-unit props for hallway doorway peeks", () => {
    const retainedUnitKey = "unit_a";
    const doorwayBounds = new THREE.Box3(
      new THREE.Vector3(-0.4, -1, -3),
      new THREE.Vector3(0.4, 1, -2),
    );

    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: new Set([retainedUnitKey]),
        groupUnitKey: retainedUnitKey,
        propWorldBounds: doorwayBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(true);
  });

  it("skips behind-camera cull for walls when skipInteriorForwardCone is set", () => {
    const behindBounds = new THREE.Box3(
      new THREE.Vector3(-1, -1, 1),
      new THREE.Vector3(1, 1, 2),
    );
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
        groupUnitKey: "unit_a",
        propWorldBounds: behindBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
      }),
    ).toBe(false);
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
        groupUnitKey: "unit_a",
        propWorldBounds: behindBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
        skipInteriorForwardCone: true,
      }),
    ).toBe(frustum.intersectsBox(behindBounds));
  });

  it("supports legacy forward-cone hysteresis when wasVisible is set", () => {
    const peripheralBounds = new THREE.Box3(
      new THREE.Vector3(0.05, -1, -0.53),
      new THREE.Vector3(0.55, 1, 0.47),
    );
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
        groupUnitKey: "unit_a",
        propWorldBounds: peripheralBounds,
        viewFrustum: frustum,
        cameraWorldPos: camPos,
        cameraWorldDir: camDir,
        wasVisible: true,
      }),
    ).toBe(true);
    expect(
      resolveApartmentInteriorPropGroupVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
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

describe("resolveApartmentInteriorPropWarmUpVisible", () => {
  it("shows all containing-unit decor during entry warm-up", () => {
    expect(
      resolveApartmentInteriorPropWarmUpVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
        groupUnitKey: "unit_a",
      }),
    ).toBe(true);
    expect(
      resolveApartmentInteriorPropWarmUpVisible({
        allowDemand: true,
        visibleUnitKeys: new Set(["unit_a"]),
        groupUnitKey: "unit_b",
      }),
    ).toBe(false);
  });
});

describe("syncApartmentInteriorPropVisibilityUnit", () => {
  it("clears visible keys and restores warm-up cache when the containing unit changes", () => {
    const state = createApartmentInteriorPropVisibilityState();
    state.warmedKeys.add("a");
    state.visibleKeys.add("a");
    state.activeUnitKey = "unit_a";
    state.warmedKeysByUnit.set("unit_b", new Set(["b"]));

    syncApartmentInteriorPropVisibilityUnit(state, "unit_b");

    expect(state.activeUnitKey).toBe("unit_b");
    expect(state.warmedKeys.has("b")).toBe(true);
    expect(state.warmedKeys.has("a")).toBe(false);
    expect(state.visibleKeys.size).toBe(0);
    expect(state.warmedKeysByUnit.get("unit_a")?.has("a")).toBe(true);
  });

  it("persists warm-up when leaving a unit and restores it on re-entry", () => {
    const state = createApartmentInteriorPropVisibilityState();
    state.activeUnitKey = "unit_a";
    state.warmedKeys.add("decor_a");

    syncApartmentInteriorPropVisibilityUnit(state, null);
    expect(state.warmedKeys.size).toBe(0);
    expect(state.warmedKeysByUnit.get("unit_a")?.has("decor_a")).toBe(true);

    syncApartmentInteriorPropVisibilityUnit(state, "unit_a");
    expect(state.warmedKeys.has("decor_a")).toBe(true);
  });
});

describe("markAllApartmentInteriorPropsWarmedForUnit", () => {
  it("marks every decor GLB warmed and persists the cache for the unit", () => {
    const state = createApartmentInteriorPropVisibilityState();
    const decorA = new THREE.Group();
    decorA.userData.mammothApartmentUnitKey = "unit_a";
    const decorB = new THREE.Group();
    decorB.userData.mammothApartmentUnitKey = "unit_a";
    const wall = new THREE.Group();
    wall.userData.mammothApartmentUnitKey = "unit_a";
    wall.userData.mammothApartmentWallAuthoring = true;
    const groups = new Map([
      ["a", decorA],
      ["b", decorB],
      ["wall", wall],
    ]);

    markAllApartmentInteriorPropsWarmedForUnit(state, "unit_a", groups);

    expect(state.activeUnitKey).toBe("unit_a");
    expect(state.warmedKeys.has("a")).toBe(true);
    expect(state.warmedKeys.has("b")).toBe(true);
    expect(state.warmedKeys.has("wall")).toBe(false);
    expect(apartmentInteriorPropWarmupPendingForUnit(state, "unit_a", groups)).toBe(false);
    expect(state.warmedKeysByUnit.get("unit_a")?.has("a")).toBe(true);
  });
});

describe("apartmentInteriorPropWarmupPendingForUnit", () => {
  it("ignores walls/mirrors and tracks unwarmed decor GLBs", () => {
    const state = createApartmentInteriorPropVisibilityState();
    const decor = new THREE.Group();
    decor.userData.mammothApartmentUnitKey = "unit_a";
    const wall = new THREE.Group();
    wall.userData.mammothApartmentUnitKey = "unit_a";
    wall.userData.mammothApartmentWallAuthoring = true;
    const groups = new Map([
      ["decor", decor],
      ["wall", wall],
    ]);

    expect(apartmentInteriorPropWarmupPendingForUnit(state, "unit_a", groups)).toBe(true);

    state.warmedKeys.add("decor");
    expect(apartmentInteriorPropWarmupPendingForUnit(state, "unit_a", groups)).toBe(false);
  });
});

describe("applyApartmentInteriorPropVisibility", () => {
  it("warms unwarmed props in forward order then applies warmed props immediately", () => {
    const state = createApartmentInteriorPropVisibilityState();
    const warmed = new THREE.Group();
    const front = new THREE.Group();
    const side = new THREE.Group();
    state.warmedKeys.add("warmed");

    applyApartmentInteriorPropVisibility(
      [
        { key: "warmed", object: warmed, desiredVisible: true, forwardDot: 0.1 },
        { key: "front", object: front, desiredVisible: true, forwardDot: 0.9 },
        { key: "side", object: side, desiredVisible: true, forwardDot: 0.2 },
      ],
      state,
      1,
    );

    expect(warmed.visible).toBe(true);
    expect(front.visible).toBe(true);
    expect(side.visible).toBe(false);
    expect(state.warmedKeys.has("front")).toBe(true);
    expect(state.warmedKeys.has("side")).toBe(false);

    applyApartmentInteriorPropVisibility(
      [
        { key: "warmed", object: warmed, desiredVisible: true, forwardDot: 0.1 },
        { key: "front", object: front, desiredVisible: true, forwardDot: 0.9 },
        { key: "side", object: side, desiredVisible: true, forwardDot: 0.2 },
      ],
      state,
      1,
    );

    expect(side.visible).toBe(true);
    expect(state.warmedKeys.has("side")).toBe(true);
  });

  it("hides props immediately when they fall out of the desired set", () => {
    const state = createApartmentInteriorPropVisibilityState();
    const prop = new THREE.Group();
    state.visibleKeys.add("prop");
    state.warmedKeys.add("prop");
    prop.visible = true;

    applyApartmentInteriorPropVisibility(
      [{ key: "prop", object: prop, desiredVisible: false, forwardDot: -1 }],
      state,
    );

    expect(prop.visible).toBe(false);
    expect(state.visibleKeys.has("prop")).toBe(false);
  });

  it("rate-limits steady-state hidden→visible transitions for warmed props", () => {
    const state = createApartmentInteriorPropVisibilityState();
    state.activeUnitKey = "unit_a";
    const a = new THREE.Group();
    const b = new THREE.Group();
    state.warmedKeys.add("a");
    state.warmedKeys.add("b");

    applyApartmentInteriorPropVisibility(
      [
        { key: "a", object: a, desiredVisible: true, forwardDot: 0.9 },
        { key: "b", object: b, desiredVisible: true, forwardDot: 0.8 },
      ],
      state,
      32,
      1,
    );

    expect(a.visible).toBe(true);
    expect(b.visible).toBe(false);
    expect(state.visibleKeys.has("a")).toBe(true);
    expect(state.visibleKeys.has("b")).toBe(false);

    applyApartmentInteriorPropVisibility(
      [
        { key: "a", object: a, desiredVisible: true, forwardDot: 0.9 },
        { key: "b", object: b, desiredVisible: true, forwardDot: 0.8 },
      ],
      state,
      32,
      1,
    );

    expect(a.visible).toBe(true);
    expect(b.visible).toBe(true);
  });
});

describe("applyApartmentInteriorPropVisibilityBudget (legacy)", () => {
  it("shows only the forward-most pending props within the per-frame budget", () => {
    const state = createApartmentInteriorPropVisibilityState();
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

    clearApartmentInteriorPropVisibilityState(state);
  });

  it("hides props immediately when they fall out of the desired set", () => {
    const state = createApartmentInteriorPropVisibilityState();
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

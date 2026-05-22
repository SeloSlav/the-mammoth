import * as THREE from "three";
import { describe, expect, it, afterEach } from "vitest";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import {
  getBalconyGrowInspectTarget,
  setBalconyGrowInspectTarget,
} from "./fpBalconyGrowInspectState.js";
import { getBalconyGrowInspectScreenAnchor } from "./fpBalconyGrowInspectPresentation.js";
import { syncBalconyGrowInspect } from "./fpBalconyGrowInspectSync.js";

function growingPlantState(): BalconyGrowOpUnitState {
  return {
    trays: [],
    light: { unitKey: "u1", lightsOn: 1 },
    patches: [],
    plants: [
      {
        rowKey: "k",
        unitKey: "u1",
        trayId: "tray-a",
        slotIndex: 3,
        cropDefId: "lovage-seeds",
        plantedAtMicros: 0n,
        matureAtMicros: 0n,
        targetDays: 5,
        daysGrown: 1,
        fertilizedAtPlant: 0,
        phase: 1,
        owner: {} as never,
      },
    ],
  };
}

function mountTrayPickMesh(): THREE.Mesh {
  const trayRoot = new THREE.Group();
  trayRoot.userData.mammothGrowTraySoilLocalY = 0.2;
  trayRoot.userData.mammothGrowTraySlotOffsets = [
    { x: -0.2, z: -0.2 },
    { x: 0.2, z: -0.2 },
    { x: -0.2, z: 0.2 },
    { x: 0.2, z: 0.2 },
  ];
  trayRoot.position.set(0, 0, 0);
  trayRoot.updateMatrixWorld(true);

  const mesh = new THREE.Mesh();
  mesh.userData.mammothGrowTrayId = "tray-a";
  mesh.userData.mammothGrowTrayUnitKey = "u1";
  mesh.userData.mammothGrowTrayRoot = trayRoot;
  return mesh;
}

describe("syncBalconyGrowInspect", () => {
  afterEach(() => {
    setBalconyGrowInspectTarget(null);
  });

  it("shows inspect via soil aim without a plant pick ray hit", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 1.5, 0.55);
    camera.lookAt(0.2, 0.25, 0.2);
    camera.updateMatrixWorld(true);

    const canvas = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;

    const pick = mountTrayPickMesh();
    syncBalconyGrowInspect([], growingPlantState(), camera, canvas, [pick]);

    expect(getBalconyGrowInspectTarget()).toEqual({
      unitKey: "u1",
      trayId: "tray-a",
      slotIndex: 3,
    });
    expect(getBalconyGrowInspectScreenAnchor()?.visible).toBe(true);
  });

  it("clears inspect when the center hub pick is aimed", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 1.5, 0.55);
    camera.lookAt(0, 0.25, 0);
    camera.updateMatrixWorld(true);

    const canvas = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;
    const centerPick = new THREE.Mesh();
    centerPick.userData.mammothGrowTrayId = "tray-a";
    centerPick.userData.mammothGrowTrayUnitKey = "u1";
    centerPick.userData.mammothGrowTrayCenterPick = true;

    setBalconyGrowInspectTarget({ unitKey: "u1", trayId: "tray-a", slotIndex: 2 });
    syncBalconyGrowInspect(
      [{ object: centerPick, distance: 1, point: new THREE.Vector3(), face: null, faceIndex: 0, uv: undefined, normal: new THREE.Vector3() }],
      growingPlantState(),
      camera,
      canvas,
      [],
    );

    expect(getBalconyGrowInspectTarget()).toBeNull();
    expect(getBalconyGrowInspectScreenAnchor()).toBeNull();
  });

  it("clears inspect when grow-tray open prompt is active", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    const canvas = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;

    setBalconyGrowInspectTarget({ unitKey: "u1", trayId: "tray-a", slotIndex: 2 });
    syncBalconyGrowInspect(
      [],
      growingPlantState(),
      camera,
      canvas,
      [],
      [],
      {
        kind: "balcony_grow_tray",
        unitKey: "u1",
        trayId: "tray-a",
        stashKey: "u1#grow_tray:tray-a",
        stashLabel: "grow tray",
      },
    );

    expect(getBalconyGrowInspectTarget()).toBeNull();
    expect(getBalconyGrowInspectScreenAnchor()).toBeNull();
  });
});
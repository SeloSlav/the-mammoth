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
        matureAtMicros: 60_000_000_000n,
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
});

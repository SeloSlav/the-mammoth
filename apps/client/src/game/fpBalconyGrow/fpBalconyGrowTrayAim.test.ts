import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import {
  balconyGrowLivePlantInSlot,
  growTrayRayHitTargetsLivePlant,
  resolveBalconyGrowSoilAimedSlotIndex,
} from "./fpBalconyGrowTrayAim.js";

function emptyGrowState(): BalconyGrowOpUnitState {
  return { trays: [], plants: [], light: null, patches: [] };
}

describe("balconyGrowLivePlantInSlot", () => {
  it("returns true for non-empty phase plants", () => {
    const growState: BalconyGrowOpUnitState = {
      ...emptyGrowState(),
      plants: [
        {
          rowKey: "k",
          unitKey: "u1",
          trayId: "tray-a",
          slotIndex: 2,
          cropDefId: "seed-tomato",
          plantedAtMicros: 0n,
          matureAtMicros: 1n,
          phase: 1,
          owner: {} as never,
        },
      ],
    };
    expect(balconyGrowLivePlantInSlot(growState, "tray-a", 2)).toBe(true);
    expect(balconyGrowLivePlantInSlot(growState, "tray-a", 0)).toBe(false);
  });
});

describe("growTrayRayHitTargetsLivePlant", () => {
  it("uses explicit slot index on slot picks", () => {
    const growState: BalconyGrowOpUnitState = {
      ...emptyGrowState(),
      plants: [
        {
          rowKey: "k",
          unitKey: "u1",
          trayId: "tray-a",
          slotIndex: 1,
          cropDefId: "seed-tomato",
          plantedAtMicros: 0n,
          matureAtMicros: 1n,
          phase: 1,
          owner: {} as never,
        },
      ],
    };
    const mesh = new THREE.Mesh();
    mesh.userData.mammothGrowTrayId = "tray-a";
    mesh.userData.mammothGrowSlotIndex = 1;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 2);
    camera.lookAt(0, 0.5, 0);
    expect(growTrayRayHitTargetsLivePlant({ object: mesh }, growState, camera)).toBe(true);
  });

  it("never treats the center hub pick as a planted slot", () => {
    const growState: BalconyGrowOpUnitState = {
      ...emptyGrowState(),
      plants: [
        {
          rowKey: "k",
          unitKey: "u1",
          trayId: "tray-a",
          slotIndex: 1,
          cropDefId: "seed-tomato",
          plantedAtMicros: 0n,
          matureAtMicros: 1n,
          phase: 1,
          owner: {} as never,
        },
      ],
    };
    const mesh = new THREE.Mesh();
    mesh.userData.mammothGrowTrayId = "tray-a";
    mesh.userData.mammothGrowTrayCenterPick = true;
    const camera = new THREE.PerspectiveCamera();
    expect(growTrayRayHitTargetsLivePlant({ object: mesh }, growState, camera)).toBe(false);
  });
});

describe("resolveBalconyGrowSoilAimedSlotIndex", () => {
  it("returns nearest slot under the center-screen ray", () => {
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

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 1.5, 0.6);
    camera.lookAt(0.2, 0.2, 0.2);
    camera.updateMatrixWorld(true);

    const slot = resolveBalconyGrowSoilAimedSlotIndex(camera, trayRoot);
    expect(slot).toBe(3);
  });
});

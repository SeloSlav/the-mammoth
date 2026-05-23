import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import {
  balconyGrowLivePlantInSlot,
  growTrayRayHitTargetsLivePlant,
  resolveBalconyGrowSoilAimedSlotIndex,
} from "./fpBalconyGrowTrayAim.js";
import { sortBalconyGrowRaycastHits } from "./fpBalconyGrowTrayAnchor.js";

function emptyGrowState(): BalconyGrowOpUnitState {
  return { trays: [], plants: [], light: null, patches: [], traysWithSubstrate: new Set() };
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
          matureAtMicros: 0n,
          targetDays: 5,
          daysGrown: 1,
          substrateFedOvernight: 0,
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
          matureAtMicros: 0n,
          targetDays: 5,
          daysGrown: 1,
          substrateFedOvernight: 0,
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
          matureAtMicros: 0n,
          targetDays: 5,
          daysGrown: 1,
          substrateFedOvernight: 0,
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

describe("sortBalconyGrowRaycastHits", () => {
  it("keeps quadrant slot hits ahead of center hub hits", () => {
    const slot = new THREE.Mesh();
    slot.userData.mammothGrowSlotIndex = 2;
    const center = new THREE.Mesh();
    center.userData.mammothGrowTrayCenterPick = true;
    const tray = new THREE.Mesh();

    const hits = sortBalconyGrowRaycastHits([
      { object: tray, distance: 0.1, point: new THREE.Vector3(), face: null, faceIndex: 0, uv: undefined, normal: new THREE.Vector3() },
      { object: center, distance: 0.1, point: new THREE.Vector3(), face: null, faceIndex: 0, uv: undefined, normal: new THREE.Vector3() },
      { object: slot, distance: 0.1, point: new THREE.Vector3(), face: null, faceIndex: 0, uv: undefined, normal: new THREE.Vector3() },
    ]);

    expect(hits.map((hit) => hit.object)).toEqual([slot, center, tray]);
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

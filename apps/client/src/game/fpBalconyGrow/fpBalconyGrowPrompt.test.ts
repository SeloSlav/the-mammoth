import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import { getBalconyGrowTrayPromptFromHit } from "./fpBalconyGrowPrompt.js";
import { growTrayIdForPlacement } from "./fpBalconyGrowTrayDecor.js";

vi.mock("../fpApartment/fpApartmentGameplay.js", () => ({
  clientOwnsClaimedApartmentUnit: () => true,
}));

vi.mock("./fpBalconyGrowTrayAnchor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fpBalconyGrowTrayAnchor.js")>();
  return {
    ...actual,
    clientFeetNearGrowTray: () => true,
  };
});

function growStateWithPlants(): BalconyGrowOpUnitState {
  return {
    trays: [],
    plants: [0, 1, 2, 3].map((slotIndex) => ({
      rowKey: `k-${slotIndex}`,
      unitKey: "u1",
      trayId: "tray-a",
      slotIndex,
      cropDefId: "parsley-seeds",
      plantedAtMicros: 0n,
      matureAtMicros: 0n,
      targetDays: 5,
      daysGrown: 1,
      substrateFedOvernight: 0,
      phase: 1,
      owner: {} as never,
    })),
    light: null,
    patches: [],
    traysWithSubstrate: new Set(),
  };
}

describe("getBalconyGrowTrayPromptFromHit", () => {
  it("uses decor ids for imported grow trays and content ids for authored trays", () => {
    expect(growTrayIdForPlacement("db:42", 42n)).toBe("decor:42");
    expect(growTrayIdForPlacement("content:unit-a:tray-authored", null)).toBe("tray-authored");
  });

  it("suppresses grow-tray stash when the aimed slot has a growing plant", () => {
    const mesh = new THREE.Mesh();
    mesh.userData.mammothGrowTrayId = "tray-a";
    mesh.userData.mammothGrowTrayUnitKey = "u1";
    mesh.userData.mammothGrowSlotIndex = 2;
    mesh.userData.mammothGrowTrayRoot = new THREE.Group();

    const prompt = getBalconyGrowTrayPromptFromHit(
      {} as never,
      {} as never,
      { x: 0, y: 0, z: 0 },
      new THREE.PerspectiveCamera(),
      { object: mesh, distance: 1, point: new THREE.Vector3(), face: null, faceIndex: 0, uv: undefined, normal: new THREE.Vector3() },
      growStateWithPlants(),
    );

    expect(prompt).toBeNull();
  });

  it("always opens grow-tray stash from the center hub pick", () => {
    const mesh = new THREE.Mesh();
    mesh.userData.mammothGrowTrayId = "tray-a";
    mesh.userData.mammothGrowTrayUnitKey = "u1";
    mesh.userData.mammothGrowTrayCenterPick = true;
    mesh.userData.mammothGrowTrayRoot = new THREE.Group();

    const prompt = getBalconyGrowTrayPromptFromHit(
      {} as never,
      {} as never,
      { x: 0, y: 0, z: 0 },
      new THREE.PerspectiveCamera(),
      { object: mesh, distance: 1, point: new THREE.Vector3(), face: null, faceIndex: 0, uv: undefined, normal: new THREE.Vector3() },
      growStateWithPlants(),
    );

    expect(prompt).toEqual({
      kind: "balcony_grow_tray",
      unitKey: "u1",
      trayId: "tray-a",
      stashKey: "u1#grow_tray:tray-a",
      stashLabel: "grow tray",
    });
  });

  it("offers harvest when days grown reaches target even before server phase flip", () => {
    const mesh = new THREE.Mesh();
    mesh.userData.mammothGrowTrayId = "tray-a";
    mesh.userData.mammothGrowTrayUnitKey = "u1";
    mesh.userData.mammothGrowSlotIndex = 0;
    mesh.userData.mammothGrowTrayRoot = new THREE.Group();

    const prompt = getBalconyGrowTrayPromptFromHit(
      {} as never,
      {} as never,
      { x: 0, y: 0, z: 0 },
      new THREE.PerspectiveCamera(),
      { object: mesh, distance: 1, point: new THREE.Vector3(), face: null, faceIndex: 0, uv: undefined, normal: new THREE.Vector3() },
      {
        trays: [],
        light: null,
        patches: [],
        traysWithSubstrate: new Set(),
        plants: [
          {
            rowKey: "k-0",
            unitKey: "u1",
            trayId: "tray-a",
            slotIndex: 0,
            cropDefId: "parsley-seeds",
            plantedAtMicros: 0n,
            matureAtMicros: 0n,
            targetDays: 4,
            daysGrown: 4,
            substrateFedOvernight: 0,
            phase: 1,
            owner: {} as never,
          },
        ],
      },
    );

    expect(prompt).toEqual({
      kind: "balcony_grow_harvest",
      unitKey: "u1",
      trayId: "tray-a",
      slotIndex: 0,
      cropDisplayName: "Fresh parsley",
    });
  });
});

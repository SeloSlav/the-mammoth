import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { BalconyGrowOpUnitState } from "../../inventory/balconyGrowOpState.js";
import { getBalconyGrowTrayPromptFromHit } from "./fpBalconyGrowPrompt.js";
import { growTrayIdForPlacement } from "./fpBalconyGrowTrayDecor.js";

vi.mock("../fpApartment/fpApartmentGameplay.js", () => ({
  clientOwnsClaimedApartmentUnit: () => true,
}));

vi.mock("./fpBalconyGrowTrayAnchor.js", () => ({
  clientFeetNearGrowTray: () => true,
}));

function growStateWithPlants(): BalconyGrowOpUnitState {
  return {
    trays: [],
    plants: [0, 1, 2, 3].map((slotIndex) => ({
      rowKey: `k-${slotIndex}`,
      unitKey: "u1",
      trayId: "tray-a",
      slotIndex,
      cropDefId: "lovage-seeds",
      plantedAtMicros: 0n,
      matureAtMicros: 1n,
      phase: 1,
      owner: {} as never,
    })),
    light: null,
    patches: [],
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
});

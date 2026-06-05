import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectOwnedBalconyGrowPickMeshes } from "./fpBalconyGrowTrayAnchor.js";

const { clientOwnsClaimedApartmentUnit } = vi.hoisted(() => ({
  clientOwnsClaimedApartmentUnit: vi.fn(() => true),
}));

vi.mock("../fpApartment/fpApartmentGameplay.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../fpApartment/fpApartmentGameplay.js")>()),
  clientOwnsClaimedApartmentUnit,
}));

function growPick(root: THREE.Object3D, unitKey = "unit-a"): THREE.Mesh {
  const mesh = new THREE.Mesh();
  mesh.userData.mammothGrowTrayRoot = root;
  mesh.userData.mammothGrowTrayUnitKey = unitKey;
  return mesh;
}

describe("collectOwnedBalconyGrowPickMeshes", () => {
  beforeEach(() => {
    clientOwnsClaimedApartmentUnit.mockClear();
  });

  it("checks ownership and shared tray-root visibility once per collection pass", () => {
    const root = new THREE.Group();
    const visibleRead = vi.fn(() => true);
    Object.defineProperty(root, "visible", {
      configurable: true,
      get: visibleRead,
    });
    const picks = [growPick(root), growPick(root), growPick(root)];
    const dst: THREE.Mesh[] = [];

    collectOwnedBalconyGrowPickMeshes(
      {} as never,
      {} as never,
      { x: 0, y: 0, z: 0 },
      picks,
      [],
      dst,
    );

    expect(dst).toEqual(picks);
    expect(clientOwnsClaimedApartmentUnit).toHaveBeenCalledTimes(1);
    expect(visibleRead).toHaveBeenCalledTimes(1);
  });

  it("checks a hidden shared tray root's nearby volume once", () => {
    const root = new THREE.Group();
    root.visible = false;
    const getWorldPosition = vi.spyOn(root, "getWorldPosition");
    const picks = [growPick(root), growPick(root)];
    const dst: THREE.Mesh[] = [];

    collectOwnedBalconyGrowPickMeshes(
      {} as never,
      {} as never,
      { x: 0, y: 0, z: 0 },
      picks,
      [],
      dst,
    );

    expect(dst).toEqual(picks);
    expect(getWorldPosition).toHaveBeenCalledTimes(1);
  });

  it("uses a subscribed owned-unit key without rescanning ownership", () => {
    const root = new THREE.Group();
    const ownedPick = growPick(root, "owned-unit");
    const otherPick = growPick(root, "other-unit");
    const dst: THREE.Mesh[] = [];

    collectOwnedBalconyGrowPickMeshes(
      {} as never,
      {} as never,
      { x: 0, y: 0, z: 0 },
      [ownedPick, otherPick],
      [],
      dst,
      [],
      [],
      "owned-unit",
    );

    expect(dst).toEqual([ownedPick]);
    expect(clientOwnsClaimedApartmentUnit).not.toHaveBeenCalled();
  });
});

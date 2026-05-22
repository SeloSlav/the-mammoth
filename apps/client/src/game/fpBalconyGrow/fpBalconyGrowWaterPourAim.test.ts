import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { MountFpApartmentDecorMeshesResult } from "../fpApartment/fpApartmentDecorMeshes.js";
import { resolveBalconyWaterPourAimXz } from "./fpBalconyGrowWaterPourAim.js";

describe("resolveBalconyWaterPourAimXz", () => {
  it("uses tray soil plane instead of world y=0", () => {
    const trayRoot = new THREE.Group();
    trayRoot.userData.mammothGrowTraySoilLocalY = 0.2;
    trayRoot.position.set(40, 25, 60);
    trayRoot.updateMatrixWorld(true);

    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5));
    pick.userData.mammothGrowTrayRoot = trayRoot;
    pick.position.copy(trayRoot.position);
    pick.updateMatrixWorld(true);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(40, 26.5, 60.4);
    camera.lookAt(40, 25.2, 60);
    camera.updateMatrixWorld(true);

    const decor = {
      raycastBalconyGrowTrayHits: () => [{ object: pick, point: new THREE.Vector3(40, 25.1, 60) }],
    } as unknown as MountFpApartmentDecorMeshesResult;

    const out = { x: 0, z: 0 };
    expect(resolveBalconyWaterPourAimXz(camera, decor, new THREE.Vector3(40, 25, 60), out)).toBe(
      true,
    );
    expect(Math.hypot(out.x - 40, out.z - 60)).toBeLessThan(0.35);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(10);
  });

  it("returns false when no grow tray is under the crosshair", () => {
    const decor = {
      raycastBalconyGrowTrayHits: () => [],
    } as unknown as MountFpApartmentDecorMeshesResult;
    const out = { x: 0, z: 0 };
    expect(
      resolveBalconyWaterPourAimXz(
        new THREE.PerspectiveCamera(),
        decor,
        new THREE.Vector3(),
        out,
      ),
    ).toBe(false);
  });
});

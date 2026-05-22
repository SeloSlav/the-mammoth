import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { resolveBalconyWaterPourAimXz } from "./fpBalconyGrowWaterPourAim.js";

describe("resolveBalconyWaterPourAimXz", () => {
  it("uses the player's floor plane so water can be poured anywhere", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(40, 26.5, 60.4);
    camera.lookAt(41, 25, 62);
    camera.updateMatrixWorld(true);

    const out = { x: 0, z: 0 };
    expect(resolveBalconyWaterPourAimXz(camera, null, new THREE.Vector3(40, 25, 60), out)).toBe(
      true,
    );
    expect(out.x).toBeCloseTo(41, 2);
    expect(out.z).toBeCloseTo(62, 2);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(10);
  });

  it("falls back in front of the player when the view ray is parallel to the floor", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    camera.updateMatrixWorld(true);

    const out = { x: 0, z: 0 };
    expect(
      resolveBalconyWaterPourAimXz(
        camera,
        null,
        new THREE.Vector3(),
        out,
      ),
    ).toBe(true);
    expect(out.z).toBeLessThan(-1);
  });
});

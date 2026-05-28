import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildApartmentWindowShutterVisual } from "@the-mammoth/world";
import { bindAuthBackdropShutterFacadeEnv } from "./mammothAuthBackdropFacadeLighting.js";

describe("bindAuthBackdropShutterFacadeEnv", () => {
  it("uses low env intensity and extra roughness on steel — not FP metallic boost", () => {
    const shutter = buildApartmentWindowShutterVisual();
    const env = new THREE.Texture();
    bindAuthBackdropShutterFacadeEnv(shutter, env);

    const plate = shutter.getObjectByName("shutter_back_plate") as THREE.Mesh | undefined;
    expect(plate).toBeTruthy();
    const mat = plate!.material as THREE.MeshStandardMaterial;
    expect(mat.envMap).toBe(env);
    expect(mat.envMapIntensity).toBeLessThan(0.2);
    expect(mat.roughness).toBeGreaterThan(0.58);
  });
});

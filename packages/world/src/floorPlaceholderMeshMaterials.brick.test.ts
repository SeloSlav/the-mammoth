import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { unitExteriorBrickWallMaterial } from "./floorPlaceholderMeshMaterials.js";

describe("unitExteriorBrickWallMaterial", () => {
  it("lifts dark PATINA albedo toward slab concrete without warm emissive salmon", () => {
    const m = unitExteriorBrickWallMaterial;
    expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(m.color.r).toBeGreaterThan(1.7);
    expect(m.color.g).toBeGreaterThan(m.color.r);
    expect(m.color.b).toBeGreaterThan(m.color.r);
    expect(m.emissiveIntensity).toBe(0);
    expect(m.fog).toBe(false);
    expect(m.normalScale.x).toBeLessThan(0.32);
    expect(m.roughness).toBeLessThan(0.9);
  });
});

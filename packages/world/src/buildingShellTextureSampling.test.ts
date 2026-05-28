import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import {
  configureBuildingShellTextureSampling,
  exteriorConcreteWallMaterial,
  initBuildingShellTextureSampling,
  refreshBuildingShellTextureSampling,
  unitExteriorBrickWallMaterial,
} from "./floorPlaceholderMeshMaterials.js";

describe("buildingShellTextureSampling", () => {
  it("configures trilinear mips and anisotropy on shell textures", () => {
    const tex = new THREE.Texture();
    configureBuildingShellTextureSampling(tex);
    expect(tex.generateMipmaps).toBe(true);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.anisotropy).toBeGreaterThanOrEqual(1);
  });

  it("clamps anisotropy from renderer capabilities and softens exterior normals", () => {
    const renderer = {
      capabilities: { getMaxAnisotropy: () => 8 },
    } as unknown as WebGPURenderer;
    initBuildingShellTextureSampling(renderer);
    refreshBuildingShellTextureSampling();
    const tex = new THREE.Texture();
    configureBuildingShellTextureSampling(tex);
    expect(tex.anisotropy).toBeLessThanOrEqual(4);
    expect(tex.anisotropy).toBeGreaterThanOrEqual(1);
    expect(exteriorConcreteWallMaterial.normalScale.x).toBeLessThan(0.5);
    expect(unitExteriorBrickWallMaterial.normalScale.x).toBeLessThan(0.5);
  });
});

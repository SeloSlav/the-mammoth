import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildExteriorProceduralTreeGroup,
  disposeObject3D,
  ENABLE_EXTERIOR_PROCEDURAL_TREES,
  type ExteriorProceduralTreePlacement,
} from "./index.js";

describe("exterior procedural trees", () => {
  it("defaults on through the global world feature flag", () => {
    expect(ENABLE_EXTERIOR_PROCEDURAL_TREES).toBe(true);
  });

  it("places hundreds of realistically scaled trees outside the building footprint as instanced meshes", () => {
    const footprint = new THREE.Box3(
      new THREE.Vector3(-120, 0, -18),
      new THREE.Vector3(120, 60, 18),
    );
    const group = buildExteriorProceduralTreeGroup(footprint, {
      count: 240,
      seed: 0x7a677265,
      groundY: -0.04,
      minFacadeClearanceM: 11,
      maxScatterDistanceM: 130,
    });

    try {
      const placements = group.userData
        .mammothExteriorProceduralTreePlacements as ExteriorProceduralTreePlacement[];
      expect(group.userData.mammothAlwaysVisible).toBe(true);
      expect(group.userData.mammothExteriorProceduralTreeCount).toBe(240);
      expect(placements).toHaveLength(240);
      expect(placements.some((p) => p.heightM >= 28)).toBe(true);

      for (const p of placements) {
        const clearX =
          p.x < footprint.min.x
            ? footprint.min.x - p.x
            : p.x > footprint.max.x
              ? p.x - footprint.max.x
              : 0;
        const clearZ =
          p.z < footprint.min.z
            ? footprint.min.z - p.z
            : p.z > footprint.max.z
              ? p.z - footprint.max.z
              : 0;
        expect(Math.max(clearX, clearZ)).toBeGreaterThanOrEqual(6);
      }

      const instanced = group.children.filter(
        (child): child is THREE.InstancedMesh =>
          child instanceof THREE.InstancedMesh,
      );
      expect(instanced).toHaveLength(2);
      expect(instanced[0]!.count).toBeGreaterThan(placements.length);
      expect(instanced[1]!.count).toBeGreaterThan(placements.length);
    } finally {
      disposeObject3D(group);
    }
  });
});

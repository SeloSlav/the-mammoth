import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildExteriorEzTreeCollisionAABBs,
  buildExteriorMegablockTreePlacements,
  ENABLE_EXTERIOR_PROCEDURAL_TREES,
} from "./index.js";

describe("exterior megablock tree placements (ez-tree presets)", () => {
  it("defaults on through the global world feature flag", () => {
    expect(ENABLE_EXTERIOR_PROCEDURAL_TREES).toBe(true);
  });

  it("scatter hundreds of realistically scaled placements outside the mamutica-like footprint", () => {
    const footprint = new THREE.Box3(
      new THREE.Vector3(-120, 0, -18),
      new THREE.Vector3(120, 60, 18),
    );
    const placements = buildExteriorMegablockTreePlacements(footprint, {
      count: 240,
      seed: 0x7a67_7265,
      minFacadeClearanceM: 11,
      maxScatterDistanceM: 130,
    });

    expect(placements).toHaveLength(240);
    expect(placements.some((p) => p.heightM >= 28)).toBe(true);

    const usedVariants = new Set<number>();
    for (const p of placements) {
      usedVariants.add(p.prototypeIndex);

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
    /** Mix ash / oak / aspen / pine / shrubs — avoids a single monoculture band. */
    expect(usedVariants.size).toBeGreaterThan(5);
  });

  it("pillar collision derives one vertical AABB per placement", () => {
    const tree = buildExteriorEzTreeCollisionAABBs(
      [
        {
          x: 120,
          z: -50,
          heightM: 14,
          yawRad: 0,
          prototypeIndex: 10,
        },
      ],
      -0.2,
    );
    expect(tree).toHaveLength(1);
    expect(tree[0]!.max[1]).toBeGreaterThan(tree[0]!.min[1] + 1);
    expect(tree[0]!.max[2]).toBeGreaterThan(tree[0]!.min[2] + 0.2);
  });
});

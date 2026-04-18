import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  buildFloorMeshes,
  collectCollisionAabbsFromObject3D,
  parseStairWellDef,
} from "./index.js";
import { addStairWellPlaceholder } from "./stairElevatorPlaceholders.js";

function blocks(
  aabbs: readonly { min: readonly [number, number, number]; max: readonly [number, number, number] }[],
  x: number,
  y: number,
  z: number,
): boolean {
  return aabbs.some(
    (aabb) =>
      x >= aabb.min[0] &&
      x <= aabb.max[0] &&
      y >= aabb.min[1] &&
      y <= aabb.max[1] &&
      z >= aabb.min[2] &&
      z <= aabb.max[2],
  );
}

describe("stair door threshold collision", () => {
  it("pulls raised shaft door cutouts flush to the stair floor band", () => {
    const sx = 8.35;
    const sy = 60 / 19;
    const sz = 13.95;
    const root = new THREE.Group();

    addStairWellPlaceholder(root, sx, sy, sz, {
      groundDoor: {
        face: "s",
        tangentOffsetAlongWall: 0,
        doorWidthM: 1.8,
        doorHoleY0Local: -sy * 0.5 + 0.282,
        doorHoleY1Local: -sy * 0.5 + 0.282 + 2.2,
      },
    });

    const aabbs = collectCollisionAabbsFromObject3D(root);
    const wallZ = -sz * 0.5 + 0.055;

    expect(blocks(aabbs, 0, -sy * 0.5 + 0.17, wallZ)).toBe(false);
    expect(blocks(aabbs, 2.7, -sy * 0.5 + 0.17, wallZ)).toBe(true);
  });

  it("cuts the adjacent corridor wall flush to the floor for typical stair entries", () => {
    const stairSy = 60 / 19;
    const root = buildFloorMeshes(
      {
        id: "floor_threshold_collision",
        version: 1,
        objects: [
          {
            id: "corridor_south",
            prefabId: "corridor_main",
            position: [0, 1.605, -4.2],
            scale: [4.4, 3.05, 3.8],
          },
          {
            id: "stair_01",
            prefabId: "stair_well_a",
            position: [0, 1.6589473684210527, 0],
            scale: [4, stairSy, 4],
          },
        ],
      },
      {
        storyLevelIndex: 2,
        stairWellDef: parseStairWellDef({
          id: "stairs",
          version: 1,
          entryOpening: {
            face: "s",
            tangentOffsetAlongWallM: 0,
            widthM: 1.4,
            heightM: 2.2,
            centerYM: -0.1,
          },
        }),
      },
    );

    const aabbs = collectCollisionAabbsFromObject3D(root);
    const wallZ = -4.2 + 3.8 * 0.5 - 0.055;

    expect(blocks(aabbs, 0, 0.25, wallZ)).toBe(false);
    expect(blocks(aabbs, 1.55, 0.25, wallZ)).toBe(true);
  });
});

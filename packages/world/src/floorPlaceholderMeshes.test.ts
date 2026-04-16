import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { classifyPrefab } from "./floorPlaceholderMeshes.js";
import {
  applyStairOpeningCollisionOverlay,
  buildFpBlockerAABBsForBuilding,
  buildStaticCollisionSceneForBuilding,
  buildFloorMeshes,
  buildStairOpeningCollisionOverlayForBuilding,
  collectCollisionAabbsFromObject3D,
  instantiateBuildingFloorStack,
  parseBuildingDoc,
  parseFloorDoc,
  parseStairWellDef,
} from "./index.js";

describe("classifyPrefab", () => {
  it("classifies corridor and lobby prefabs", () => {
    expect(classifyPrefab("corridor_main")).toBe("corridor");
    expect(classifyPrefab("Lobby_A")).toBe("corridor");
    expect(classifyPrefab("hall_central")).toBe("corridor");
  });

  it("classifies residential units", () => {
    expect(classifyPrefab("apartment_1a")).toBe("unit");
    expect(classifyPrefab("UNIT_br")).toBe("unit");
  });

  it("classifies stair and elevator cores", () => {
    expect(classifyPrefab("stair_core")).toBe("core");
    expect(classifyPrefab("elevator_bank")).toBe("core");
  });

  it("defaults to misc", () => {
    expect(classifyPrefab("props_crate")).toBe("misc");
  });

  it("cuts both typical stairwell doors through the shaft and adjacent corridor shells", () => {
    const stairWellDef = parseStairWellDef({
      id: "stairs",
      version: 1,
      entryOpening: {
        face: "e",
        tangentOffsetAlongWallM: 0,
        widthM: 1.6,
        heightM: 2,
      },
    });
    const root = buildFloorMeshes(
      {
        id: "floor_test",
        version: 1,
        objects: [
          {
            id: "corridor_east",
            prefabId: "corridor_main",
            position: [3.8, 0, 0],
            scale: [3.6, 3.2, 4.4],
          },
          {
            id: "corridor_south",
            prefabId: "corridor_main",
            position: [0, 0, -4.2],
            scale: [4.4, 3.2, 3.8],
          },
          {
            id: "stair_01",
            prefabId: "stair_well_a",
            position: [0, 0, 0],
            scale: [4, 3.2, 4],
          },
        ],
      },
      { storyLevelIndex: 7, stairWellDef },
    );

    const stair = root.getObjectByName("stair_01");
    expect(stair?.userData.editorStairPreviewGroundDoor).toMatchObject({
      face: expect.any(String),
      tangentOffsetAlongWall: expect.any(Number),
    });
    const stairSouthWallNames: string[] = [];
    stair?.traverse((obj) => {
      if (obj.name.startsWith("shaft_wall_s")) stairSouthWallNames.push(obj.name);
    });
    expect(stairSouthWallNames).not.toContain("shaft_wall_s_solid");
    expect(stairSouthWallNames.some((name) => name.startsWith("shaft_wall_s_"))).toBe(true);

    const eastCorridor = root.getObjectByName("corridor_east");
    const eastWallNames: string[] = [];
    eastCorridor?.traverse((obj) => {
      if (obj.name.startsWith("shell_wall_w")) eastWallNames.push(obj.name);
    });
    expect(eastWallNames).not.toContain("shell_wall_w");
    expect(eastWallNames.some((name) => name.startsWith("shell_wall_w_"))).toBe(true);

    const southCorridor = root.getObjectByName("corridor_south");
    const southWallNames: string[] = [];
    southCorridor?.traverse((obj) => {
      if (obj.name.startsWith("shell_wall_n")) southWallNames.push(obj.name);
    });
    expect(southWallNames).not.toContain("shell_wall_n");
    expect(southWallNames.some((name) => name.startsWith("shell_wall_n_"))).toBe(true);
  });

  it("cuts the real ground-floor stair hub opening in the stacked building mesh", () => {
    const building = parseBuildingDoc(
      JSON.parse(
        readFileSync(new URL("../../../content/building/mammoth.json", import.meta.url), "utf8"),
      ),
    );
    const root = instantiateBuildingFloorStack(building, (floorDocId) =>
      parseFloorDoc(
        JSON.parse(
          readFileSync(
            new URL(`../../../content/building/floors/${floorDocId}.json`, import.meta.url),
            "utf8",
          ),
        ),
      ),
    );

    const shaft = root.getObjectByName("stair_shaft:stair_hub_e");
    expect(shaft).not.toBeNull();
    const wallNames: string[] = [];
    shaft?.traverse((obj) => {
      if (obj.name.startsWith("shaft_wall_w_lo")) wallNames.push(obj.name);
    });
    expect(wallNames).not.toContain("shaft_wall_w_lo_solid");
    expect(wallNames.some((name) => name.startsWith("shaft_wall_w_lo_"))).toBe(true);
  });

  it("uses stairWellDef openings in collision generation for upper storeys too", () => {
    const building = parseBuildingDoc({
      id: "b",
      version: 1,
      floorRefs: [
        { levelIndex: 1, floorDocId: "f" },
        { levelIndex: 2, floorDocId: "f" },
      ],
    });
    const floor = parseFloorDoc({
      id: "f",
      version: 1,
      objects: [
        {
          id: "corridor_01",
          prefabId: "corridor_main",
          position: [3.8, 0, 0],
          scale: [3.6, 3.2, 4.4],
        },
        {
          id: "stair_01",
          prefabId: "stair_well_a",
          position: [0, 0, 0],
          scale: [4, 3.2, 4],
        },
      ],
    });
    const stairWellDef = parseStairWellDef({
      id: "stairs",
      version: 1,
      entryOpening: {
        face: "e",
        tangentOffsetAlongWallM: 0,
        widthM: 1.6,
        heightM: 2,
      },
      groundEntryOpening: {
        face: "e",
        tangentOffsetAlongWallM: 0,
        widthM: 1.6,
        heightM: 2,
      },
    });
    const collision = buildStaticCollisionSceneForBuilding(building, () => floor, {
      stairWellDef,
    });
    const probe = { x: 1.89, y: 4.4, z: 0 };
    const blocked = collision.solids.some(
      (aabb) =>
        probe.x >= aabb.min[0] &&
        probe.x <= aabb.max[0] &&
        probe.y >= aabb.min[1] &&
        probe.y <= aabb.max[1] &&
        probe.z >= aabb.min[2] &&
        probe.z <= aabb.max[2],
    );
    expect(blocked).toBe(false);
  });

  it("clears authored stair openings from stale blockers while keeping nearby wall blocked", () => {
    const building = parseBuildingDoc({
      id: "b",
      version: 1,
      floorRefs: [
        { levelIndex: 1, floorDocId: "f" },
        { levelIndex: 2, floorDocId: "f" },
      ],
    });
    const floor = parseFloorDoc({
      id: "f",
      version: 1,
      objects: [
        {
          id: "corridor_east",
          prefabId: "corridor_main",
          position: [3.8, 0, 0],
          scale: [3.6, 3.2, 4.4],
        },
        {
          id: "corridor_south",
          prefabId: "corridor_main",
          position: [0, 0, -4.2],
          scale: [4.4, 3.2, 3.8],
        },
        {
          id: "stair_01",
          prefabId: "stair_well_a",
          position: [0, 0, 0],
          scale: [4, 3.2, 4],
        },
      ],
    });
    const stairWellDef = parseStairWellDef({
      id: "stairs",
      version: 1,
      entryOpening: {
        face: "e",
        tangentOffsetAlongWallM: 0,
        widthM: 1.6,
        heightM: 2,
        centerYM: -0.1,
      },
      secondaryEntryOpening: {
        face: "s",
        tangentOffsetAlongWallM: 0,
        widthM: 1.4,
        heightM: 2,
        centerYM: -0.1,
      },
    });
    const stale = buildFpBlockerAABBsForBuilding(building, () => floor, {
      stairWellDef: parseStairWellDef({
        id: "stairs_stale",
        version: 1,
        entryOpening: {
          face: "e",
          tangentOffsetAlongWallM: 1.1,
          widthM: 1.2,
          heightM: 2,
          centerYM: -0.1,
        },
      }),
    });
    const overlay = buildStairOpeningCollisionOverlayForBuilding(
      building,
      () => floor,
      stairWellDef,
      60 / 19,
    );
    const live = applyStairOpeningCollisionOverlay(stale, overlay);
    const blockedAt = (list: readonly { min: readonly [number, number, number]; max: readonly [number, number, number] }[], x: number, y: number, z: number) =>
      list.some(
        (aabb) =>
          x >= aabb.min[0] &&
          x <= aabb.max[0] &&
          y >= aabb.min[1] &&
          y <= aabb.max[1] &&
          z >= aabb.min[2] &&
          z <= aabb.max[2],
      );
    expect(blockedAt(stale, 1.95, 1.55, 0)).toBe(true);
    expect(blockedAt(live, 1.95, 1.55, 0)).toBe(false);
    expect(blockedAt(live, 1.95, 1.55, 1.5)).toBe(true);

    expect(blockedAt(stale, 0, 4.72, -1.95)).toBe(true);
    expect(blockedAt(live, 0, 4.72, -1.95)).toBe(false);
    expect(blockedAt(live, 1.4, 4.72, -1.95)).toBe(true);
  });

  it("marks decorative corridor trim and exterior cladding as non-collidable", () => {
    const root = buildFloorMeshes(
      {
        id: "floor_decor_collision_test",
        version: 1,
        objects: [
          {
            id: "corridor_01",
            prefabId: "corridor_main",
            position: [0, 0, 0],
            scale: [6.2, 3.2, 6.2],
          },
        ],
      },
      { storyLevelIndex: 1 },
    );

    const decorative: THREE.Object3D[] = [];
    let totalBoxMeshes = 0;
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.geometry instanceof THREE.BoxGeometry) totalBoxMeshes += 1;
      if (
        obj.name.startsWith("shell_lobby_frame_") ||
        obj.name.startsWith("shell_exterior_cladding_")
      ) {
        decorative.push(obj);
      }
    });

    expect(decorative.length).toBeGreaterThan(0);
    for (const obj of decorative) {
      expect(obj.userData.mammothNoCollision).toBe(true);
    }

    const collisionAabbs = collectCollisionAabbsFromObject3D(root);
    expect(collisionAabbs.length).toBeLessThan(totalBoxMeshes);
  });
});

import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { classifyPrefab } from "./floorPlaceholderMeshes.js";
import {
  buildFloorMeshes,
  collectCollisionAabbsFromObject3D,
  instantiateBuildingFloorStack,
  parseBuildingDoc,
  parseFloorDoc,
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

  it("cuts a ground-floor stair entry through both the shaft and adjacent corridor shell", () => {
    const root = buildFloorMeshes(
      {
        id: "floor_test",
        version: 1,
        objects: [
          {
            id: "corridor_01",
            prefabId: "corridor_main",
            position: [2.8, 0, 0],
            scale: [3.6, 3.2, 4.4],
          },
          {
            id: "stair_01",
            prefabId: "stair_well_a",
            position: [0, 0, 0],
            scale: [4, 3.2, 4],
          },
        ],
      },
      { storyLevelIndex: 1 },
    );

    const stair = root.getObjectByName("stair_01");
    expect(stair?.userData.editorStairPreviewGroundDoor).toMatchObject({
      face: expect.any(String),
      tangentOffsetAlongWall: expect.any(Number),
    });

    const corridor = root.getObjectByName("corridor_01");
    const wallNames: string[] = [];
    corridor?.traverse((obj) => {
      if (obj.name.startsWith("shell_wall_w")) wallNames.push(obj.name);
    });
    expect(wallNames).not.toContain("shell_wall_w");
    expect(wallNames.some((name) => name.startsWith("shell_wall_w_"))).toBe(true);
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

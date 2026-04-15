import { describe, expect, it } from "vitest";
import { buildFloorMeshes, classifyPrefab } from "./floorPlaceholderMeshes.js";

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
});

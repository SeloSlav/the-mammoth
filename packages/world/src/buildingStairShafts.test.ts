import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import {
  addBuildingStairShaftColumnToRoot,
  getBuildingStairShaftSpecs,
  mergeShaftExteriorHints,
  readShaftFacadeHintFaces,
} from "./buildingStairShafts.js";

describe("readShaftFacadeHintFaces", () => {
  it("maps common labels to cardinals", () => {
    expect(readShaftFacadeHintFaces({ side: "east" })).toEqual(["e"]);
    expect(readShaftFacadeHintFaces({ side: "West" })).toEqual(["w"]);
    expect(readShaftFacadeHintFaces({ side: "n" })).toEqual(["n"]);
  });

  it("returns empty for missing or unknown", () => {
    expect(readShaftFacadeHintFaces(undefined)).toEqual([]);
    expect(readShaftFacadeHintFaces({ side: "up" })).toEqual([]);
  });
});

describe("mergeShaftExteriorHints", () => {
  it("dedupes and prepends hint", () => {
    expect(mergeShaftExteriorHints(["n", "e"], ["e"])).toEqual(["e", "n"]);
    expect(mergeShaftExteriorHints([], undefined)).toEqual([]);
  });
});

describe("getBuildingStairShaftSpecs", () => {
  it("adds facade faces from metadata.side when shaft is inset from plate AABB", () => {
    const floor: FloorDoc = {
      id: "test_floor",
      version: 1,
      objects: [
        {
          id: "stair_1",
          prefabId: "stair_well_a",
          position: [5, 0, 0],
          scale: [6, 3, 6],
          metadata: { side: "east" },
        },
        {
          id: "unit_e",
          prefabId: "apartment_unit_small_a",
          position: [12, 0, 0],
          scale: [8, 3, 8],
        },
      ],
    };
    const building: BuildingDoc = {
      id: "b",
      version: 1,
      floorRefs: [{ levelIndex: 1, floorDocId: floor.id }],
      cores: [],
      units: [],
      slotTemplates: [],
    };
    const specs = getBuildingStairShaftSpecs(
      building,
      () => floor,
      [...building.floorRefs],
      3.2,
    );
    expect(specs).toHaveLength(1);
    expect(specs[0]!.exteriorShaftFaces).toContain("e");
  });

  it("adds facade cardinals for stair faces flush with elevator hoistways (core-to-core)", () => {
    const floor: FloorDoc = {
      id: "core_floor",
      version: 1,
      objects: [
        {
          id: "stair_col",
          prefabId: "stair_well_a",
          position: [0, 0, 0],
          scale: [6, 3, 6],
        },
        {
          id: "elev_core",
          prefabId: "elevator_placeholder",
          position: [4, 0, 0],
          scale: [2, 3, 3],
        },
      ],
    };
    const building: BuildingDoc = {
      id: "b2",
      version: 1,
      floorRefs: [{ levelIndex: 1, floorDocId: floor.id }],
      cores: [],
      units: [],
      slotTemplates: [],
    };
    const specs = getBuildingStairShaftSpecs(
      building,
      () => floor,
      [...building.floorRefs],
      3.2,
    );
    expect(specs).toHaveLength(1);
    expect(specs[0]!.exteriorShaftFaces).toContain("e");
  });
});

describe("addBuildingStairShaftColumnToRoot", () => {
  it("adds railing geometry to every traversable segment in the full-height column", () => {
    const root = new THREE.Group();
    addBuildingStairShaftColumnToRoot(root, {
      planKey: "0,0-test",
      id: "stairs_test",
      px: 0,
      pz: 0,
      sx: 4,
      sz: 4,
      syPlate: 3,
      bottomY: 0,
      storeyCount: 4,
      storeySpacing: 60 / 19,
      minLevelIndex: 1,
      entryDoorContexts: [],
      exteriorShaftFaces: [],
    });

    const column = root.getObjectByName("stair_shaft:stairs_test") as THREE.Group;
    expect(column.children).toHaveLength(4);
    for (let i = 0; i < column.children.length; i++) {
      let railingCount = 0;
      column.children[i]!.traverse((obj) => {
        if (obj.userData.mammothStairRailing === true) railingCount += 1;
      });
      if (i === column.children.length - 1) {
        expect(railingCount).toBe(0);
      } else {
        expect(railingCount).toBeGreaterThan(0);
      }
    }
  });
});

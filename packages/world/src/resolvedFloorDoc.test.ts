import { describe, expect, it } from "vitest";
import type { BuildingDoc, FloorDoc, FloorOverrideDoc } from "@the-mammoth/schemas";
import {
  applyFloorOverrideDoc,
  defaultFloorOverrideDocId,
  resolveFloorDocForLevel,
  resolveFloorOverrideDocId,
} from "./resolvedFloorDoc.js";

describe("resolvedFloorDoc", () => {
  const building: BuildingDoc = {
    id: "mammoth_main",
    version: 1,
    floorRefs: [{ levelIndex: 7, floorDocId: "floor_typical" }],
    cores: [],
    units: [],
    slotTemplates: [],
  };
  const base: FloorDoc = {
    id: "floor_typical",
    version: 1,
    objects: [
      {
        id: "door_a",
        prefabId: "door_prefab",
        position: [0, 0, 0],
        metadata: { side: "west" },
      },
      {
        id: "sign_a",
        prefabId: "sign_prefab",
        position: [5, 0, 0],
      },
    ],
  };
  const overrideDoc: FloorOverrideDoc = {
    id: "mammoth_main__L07",
    version: 1,
    buildingId: "mammoth_main",
    levelIndex: 7,
    removedObjectIds: ["sign_a"],
    objectPatches: [
      {
        targetObjectId: "door_a",
        patch: {
          position: [1, 2, 3],
          metadata: { side: "east", unique: true },
        },
      },
    ],
    addedObjects: [
      {
        id: "notice_a",
        prefabId: "notice_prefab",
        position: [9, 0, 0],
      },
    ],
  };

  it("uses deterministic default override ids", () => {
    expect(defaultFloorOverrideDocId("mammoth_main", 7)).toBe("mammoth_main__L07");
    expect(resolveFloorOverrideDocId(building, building.floorRefs[0]!)).toBe(
      "mammoth_main__L07",
    );
  });

  it("applies removals, patches, and additions", () => {
    const resolved = applyFloorOverrideDoc(base, overrideDoc);
    expect(resolved.objects.map((obj) => obj.id)).toEqual(["door_a", "notice_a"]);
    expect(resolved.objects[0]?.position).toEqual([1, 2, 3]);
    expect(resolved.objects[0]?.metadata).toEqual({ side: "east", unique: true });
  });

  it("resolves a level from base floor plus optional override", () => {
    const resolved = resolveFloorDocForLevel({
      building,
      ref: building.floorRefs[0]!,
      getFloorDoc: () => base,
      getFloorOverrideDoc: () => overrideDoc,
    });
    expect(resolved.objects.some((obj) => obj.id === "sign_a")).toBe(false);
    expect(resolved.objects.some((obj) => obj.id === "notice_a")).toBe(true);
  });
});

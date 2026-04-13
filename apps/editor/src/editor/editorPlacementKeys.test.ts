import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FloorDoc } from "@the-mammoth/schemas";
import { placementKey, PLACEMENT_KEY_SEP, resolvePlacedId } from "./editorPlacementKeys.js";

describe("placementKey", () => {
  it("joins floor and object ids with a separator that cannot appear in ids", () => {
    expect(placementKey("floor_a", "obj_1")).toBe(`floor_a${PLACEMENT_KEY_SEP}obj_1`);
  });
});

describe("resolvePlacedId", () => {
  const floorDocs: Record<string, FloorDoc> = {
    f1: {
      id: "f1",
      version: 1,
      objects: [{ id: "chair", prefabId: "x", position: [0, 0, 0] }],
    },
  };

  it("reads placedObjectId from userData on the hit or an ancestor", () => {
    const mesh = new THREE.Mesh();
    mesh.userData.placedObjectId = "chair";
    expect(resolvePlacedId(mesh, floorDocs)).toBe("chair");
    const parent = new THREE.Group();
    parent.add(mesh);
    mesh.userData.placedObjectId = undefined;
    parent.userData.placedObjectId = "chair";
    expect(resolvePlacedId(mesh, floorDocs)).toBe("chair");
  });

  it("resolves Group name when it matches a placed object id", () => {
    const g = new THREE.Group();
    g.name = "chair";
    expect(resolvePlacedId(g, floorDocs)).toBe("chair");
  });

  it("returns null when nothing matches", () => {
    expect(resolvePlacedId(new THREE.Mesh(), floorDocs)).toBe(null);
  });
});

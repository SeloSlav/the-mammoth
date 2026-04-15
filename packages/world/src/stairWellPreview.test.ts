import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { StairWellDefSchema } from "@the-mammoth/schemas";
import { applyStairWellPartTransforms } from "./stairElevatorPlaceholders.js";

describe("applyStairWellPartTransforms", () => {
  it("applies deltas relative to each part's generated base transform", () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh();
    a.userData.editorStairPartId = "stair_tread";
    a.userData.editorStairAuthoringScope = "typical";
    a.userData.editorStairBasePosition = [0, 0, 0];
    a.userData.editorStairBaseScale = [1, 1, 1];
    a.userData.editorStairBaseRotation = [0, 0, 0, 1];
    root.add(a);

    const b = new THREE.Mesh();
    b.userData.editorStairPartId = "stair_tread";
    b.userData.editorStairAuthoringScope = "typical";
    b.userData.editorStairBasePosition = [0, 1, 2];
    b.userData.editorStairBaseScale = [2, 3, 4];
    b.userData.editorStairBaseRotation = [0, 0, 0, 1];
    root.add(b);

    const def = StairWellDefSchema.parse({
      id: "stairs",
      version: 1,
      partTransforms: {
        stair_tread: {
          position: [1, 2, 3],
          scale: [0.5, 2, 1.5],
        },
      },
    });

    applyStairWellPartTransforms(root, def);

    expect(a.position.toArray()).toEqual([1, 2, 3]);
    expect(b.position.toArray()).toEqual([1, 3, 5]);
    expect(a.scale.toArray()).toEqual([0.5, 2, 1.5]);
    expect(b.scale.toArray()).toEqual([1, 6, 6]);
  });

  it("keeps ground overrides isolated from typical ones", () => {
    const root = new THREE.Group();

    const typical = new THREE.Mesh();
    typical.userData.editorStairPartId = "stair_tread";
    typical.userData.editorStairAuthoringScope = "typical";
    typical.userData.editorStairBasePosition = [0, 0, 0];
    typical.userData.editorStairBaseScale = [1, 1, 1];
    typical.userData.editorStairBaseRotation = [0, 0, 0, 1];
    root.add(typical);

    const ground = new THREE.Mesh();
    ground.userData.editorStairPartId = "stair_tread";
    ground.userData.editorStairAuthoringScope = "ground";
    ground.userData.editorStairBasePosition = [0, 0, 0];
    ground.userData.editorStairBaseScale = [1, 1, 1];
    ground.userData.editorStairBaseRotation = [0, 0, 0, 1];
    root.add(ground);

    const def = StairWellDefSchema.parse({
      id: "stairs",
      version: 1,
      partTransforms: {
        stair_tread: {
          position: [1, 0, 0],
        },
      },
      groundPartTransforms: {
        stair_tread: {
          position: [0, 2, 0],
        },
      },
    });

    applyStairWellPartTransforms(root, def);

    expect(typical.position.toArray()).toEqual([1, 0, 0]);
    expect(ground.position.toArray()).toEqual([0, 2, 0]);
  });
});

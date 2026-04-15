import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { StairWellDefSchema } from "@the-mammoth/schemas";
import {
  addStairWellPlaceholder,
  applyStairWellPartTransforms,
  buildStairWellPreviewRoot,
} from "./stairElevatorPlaceholders.js";
import { STOREY_SPACING_M } from "./stairWellGeometry.js";

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

  it("moves grouped stair flight handles as one object", () => {
    const root = new THREE.Group();
    const flight = new THREE.Group();
    flight.userData.editorStairPartId = "stair_flight_lower";
    flight.userData.editorStairAuthoringScope = "typical";
    flight.userData.editorStairBasePosition = [0, 0, 0];
    flight.userData.editorStairBaseScale = [1, 1, 1];
    flight.userData.editorStairBaseRotation = [0, 0, 0, 1];
    root.add(flight);

    const tread = new THREE.Mesh();
    tread.position.set(0, 1, 0);
    flight.add(tread);

    const def = StairWellDefSchema.parse({
      id: "stairs",
      version: 1,
      partTransforms: {
        stair_flight_lower: {
          position: [0, 2, 0],
        },
      },
    });

    applyStairWellPartTransforms(root, def);
    root.updateMatrixWorld(true);

    expect(flight.position.toArray()).toEqual([0, 2, 0]);
    expect(tread.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([0, 3, 0]);
  });

  it("keeps each generated tread leg wholly inside one grouped flight handle", () => {
    const root = new THREE.Group();
    addStairWellPlaceholder(root, 4, STOREY_SPACING_M, 4);

    const lowerFlight = root.getObjectByName("stair_flight_lower");
    const upperFlight = root.getObjectByName("stair_flight_upper");

    expect(lowerFlight?.children.map((child) => child.name)).toEqual([
      "stair_tread_0",
      "stair_tread_1",
      "stair_tread_2",
      "stair_tread_3",
      "stair_tread_4",
      "stair_tread_5",
      "stair_tread_6",
      "stair_tread_7",
      "stair_tread_8",
      "stair_tread_9",
    ]);
    expect(upperFlight?.children.map((child) => child.name)).toEqual([
      "stair_tread_10",
      "stair_tread_11",
      "stair_tread_12",
      "stair_tread_13",
      "stair_tread_14",
      "stair_tread_15",
      "stair_tread_16",
      "stair_tread_17",
    ]);
  });

  it("adds a corridor-side stair entry opening in the preview when plan context exists", () => {
    const root = buildStairWellPreviewRoot({
      sx: 4,
      sy: STOREY_SPACING_M,
      sz: 4,
      towardPlateXZ: [6, 0],
      shaftPlateXZ: [0, 0],
    });
    expect(root.userData.editorStairPreviewGroundDoor).toMatchObject({
      face: expect.any(String),
      tangentOffsetAlongWall: expect.any(Number),
    });
  });
});

import { describe, expect, it } from "vitest";
import type { FloorDoc } from "@the-mammoth/schemas";
import { exteriorFacesForPlacedObjectInFloor } from "./exteriorFaceExposure.js";

describe("exteriorFacesForPlacedObjectInFloor", () => {
  it("marks unit gap faces exposed, not just plate-AABB faces", () => {
    const floor: FloorDoc = {
      id: "gap_faces",
      version: 1,
      objects: [
        {
          id: "corridor",
          prefabId: "corridor_segment_a",
          position: [0, 0, 0],
          scale: [4, 3, 30],
        },
        {
          id: "unit_a",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, -10],
          scale: [8, 3, 8],
        },
        {
          id: "unit_b",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, 10],
          scale: [8, 3, 8],
        },
      ],
    };

    expect(exteriorFacesForPlacedObjectInFloor(floor, floor.objects[1]!)).toEqual(["e", "n", "s"]);
    expect(exteriorFacesForPlacedObjectInFloor(floor, floor.objects[2]!)).toEqual(["e", "n", "s"]);
  });

  it("treats narrow facade slots between units as exterior", () => {
    const floor: FloorDoc = {
      id: "narrow_unit_slot",
      version: 1,
      objects: [
        {
          id: "corridor",
          prefabId: "corridor_segment_a",
          position: [0, 0, 0],
          scale: [4, 3, 40],
        },
        {
          id: "unit_a",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, -7.05],
          scale: [8, 3, 7],
        },
        {
          id: "unit_b",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, 0.05],
          scale: [8, 3, 7],
        },
      ],
    };

    expect(exteriorFacesForPlacedObjectInFloor(floor, floor.objects[1]!)).toContain("n");
    expect(exteriorFacesForPlacedObjectInFloor(floor, floor.objects[2]!)).toContain("s");
  });

  it("marks stair shaft faces exposed when no farther-out object covers that span", () => {
    const floor: FloorDoc = {
      id: "stair_core_gap",
      version: 1,
      objects: [
        {
          id: "corridor",
          prefabId: "corridor_segment_a",
          position: [0, 0, 0],
          scale: [4, 3, 50],
        },
        {
          id: "stair",
          prefabId: "stair_well_a",
          position: [6, 0, 0],
          scale: [8, 3, 12],
        },
        {
          id: "unit_north",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, 12],
          scale: [9, 3, 8],
        },
        {
          id: "unit_south",
          prefabId: "apartment_unit_small_a",
          position: [6.5, 0, -12],
          scale: [9, 3, 8],
        },
      ],
    };

    expect(exteriorFacesForPlacedObjectInFloor(floor, floor.objects[1]!)).toEqual(["e", "n", "s"]);
  });
});

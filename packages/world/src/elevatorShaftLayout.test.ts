import { describe, expect, it } from "vitest";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import { shaftFloorLocalTopY } from "./stairWellGeometry.js";
import {
  elevatorCabGameplayHalfExtentsM,
  elevatorSupportFeetWorldY,
  FP_LOCOMOTION_SKIN,
  listElevatorShaftLayouts,
} from "./elevatorShaftLayout.js";

describe("elevatorSupportFeetWorldY", () => {
  it("matches plate world + shaft slab top + locomotion skin", () => {
    const shaftSy = 3.16;
    const plateLocalY = 1.66;
    const y = elevatorSupportFeetWorldY({
      buildingWorldOriginY: 2,
      levelIndex: 3,
      floorSpacingM: 3.2,
      shaftPlateLocalY: plateLocalY,
      shaftSy,
    });
    const plateWorldY = 2 + 2 * 3.2;
    const want =
      plateWorldY + plateLocalY + shaftFloorLocalTopY(shaftSy) + FP_LOCOMOTION_SKIN;
    expect(y).toBeCloseTo(want, 8);
  });
});

describe("elevatorCabGameplayHalfExtentsM", () => {
  it("matches server elevator_layout inner_half for default shaft scale", () => {
    const { halfX, halfZ } = elevatorCabGameplayHalfExtentsM(2.38, 4.0);
    expect(halfX).toBeCloseTo(1.01, 5);
    expect(halfZ).toBeCloseTo(1.82, 5);
  });
});

describe("listElevatorShaftLayouts", () => {
  it("dedupes the same plan key across stacked storeys", () => {
    const elevatorObj = {
      id: "e1",
      prefabId: "elevator_shaft_a",
      position: [-2, 1.5, 3] as [number, number, number],
      scale: [2.2, 3.1, 2.6] as [number, number, number],
    };
    const ground: FloorDoc = {
      id: "g",
      version: 1,
      objects: [
        {
          id: "lobby",
          prefabId: "lobby_hall_a",
          position: [0, 1.5, 0],
          scale: [20, 3, 40],
        },
        elevatorObj,
      ],
    };
    const upper: FloorDoc = {
      id: "u",
      version: 1,
      objects: [elevatorObj],
    };
    const building: BuildingDoc = {
      id: "b",
      version: 1,
      floorRefs: [
        { levelIndex: 1, floorDocId: "g" },
        { levelIndex: 2, floorDocId: "u" },
      ],
      cores: [],
      units: [],
      slotTemplates: [],
    };
    const layouts = listElevatorShaftLayouts(building, (id) =>
      id === "g" ? ground : upper,
    );
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.plateX).toBe(-2);
    expect(layouts[0]!.plateZ).toBe(3);
  });

  it("honors an authored elevator door face override", () => {
    const ground: FloorDoc = {
      id: "g",
      version: 1,
      objects: [
        {
          id: "lobby",
          prefabId: "lobby_hall_a",
          position: [0, 1.5, 0],
          scale: [20, 3, 40],
        },
        {
          id: "e1",
          prefabId: "elevator_shaft_a",
          position: [-2, 1.5, 3],
          scale: [2.2, 3.1, 2.6],
          metadata: { elevatorDoorFace: "n" },
        },
      ],
    };
    const building: BuildingDoc = {
      id: "b",
      version: 1,
      floorRefs: [{ levelIndex: 1, floorDocId: "g" }],
      cores: [],
      units: [],
      slotTemplates: [],
    };
    const layouts = listElevatorShaftLayouts(building, () => ground);
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.doorFace).toBe("n");
  });
});

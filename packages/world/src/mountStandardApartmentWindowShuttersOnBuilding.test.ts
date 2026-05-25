import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MAX,
  APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MIN,
  BuildingDocSchema,
  FloorDocSchema,
  apartmentStoryLevelIndexToDisplayFloor,
} from "@the-mammoth/schemas";
import { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
import {
  MAMMOTH_AUTH_STANDARD_WINDOW_SHUTTERS_ROOT_NAME,
  mountStandardApartmentWindowShuttersForBuilding,
} from "./mountStandardApartmentWindowShuttersOnBuilding.js";

function readMammothBuildingDoc() {
  const raw = JSON.parse(
    readFileSync(new URL("../../../content/building/mammoth.json", import.meta.url), "utf8"),
  );
  return BuildingDocSchema.parse(raw);
}

function readTypicalFloorDoc() {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  );
  return FloorDocSchema.parse(raw);
}

describe("mountStandardApartmentWindowShuttersForBuilding", () => {
  it("mounts two shutters per qualifying east/west unit on display floors 13–19", () => {
    const building = readMammothBuildingDoc();
    const typicalFloor = readTypicalFloorDoc();
    const qualifyingUnitCount = typicalFloor.objects.filter((obj) => {
      if (classifyPrefab(obj.prefabId) !== "unit") return false;
      return obj.id.startsWith("unit_e_") || obj.id.startsWith("unit_w_");
    }).length;

    const qualifyingFloorCount = building.floorRefs.filter((ref) => {
      const displayFloor = apartmentStoryLevelIndexToDisplayFloor(ref.levelIndex);
      return (
        displayFloor >= APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MIN &&
        displayFloor <= APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MAX
      );
    }).length;

    const root = mountStandardApartmentWindowShuttersForBuilding({
      building,
      getFloorDoc: (id) => (id === typicalFloor.id ? typicalFloor : readTypicalFloorDoc()),
    });

    expect(root.name).toBe(MAMMOTH_AUTH_STANDARD_WINDOW_SHUTTERS_ROOT_NAME);
    expect(root.children.length).toBe(qualifyingUnitCount * qualifyingFloorCount * 2);
    expect(root.children.length).toBeGreaterThan(0);
  });

  it("skips display floors below the shutter band", () => {
    const building = readMammothBuildingDoc();
    const typicalFloor = readTypicalFloorDoc();
    const lowFloorRef = building.floorRefs.find(
      (ref) => apartmentStoryLevelIndexToDisplayFloor(ref.levelIndex) === 12,
    );
    expect(lowFloorRef).toBeDefined();

    const root = mountStandardApartmentWindowShuttersForBuilding({
      building: {
        ...building,
        floorRefs: [lowFloorRef!],
      },
      getFloorDoc: () => typicalFloor,
    });

    expect(root.children.length).toBe(0);
  });
});

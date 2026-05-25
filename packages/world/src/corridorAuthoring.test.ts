import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BuildingDocSchema,
  FloorDocSchema,
  ownedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import {
  FLOOR_19_GAMEPLAY_LEVEL_INDEX,
  listAuthoringCorridorPreviewFloors,
  resolveFloor19CorridorAuthoringFootprint,
  resolveFloor19CorridorDecorPoses,
  seedFloor19CorridorCeilingLightPlacedItems,
} from "./corridorAuthoring.js";
import {
  corridorEditorShellWallHoleCount,
  resolveCorridorEditorShellForAuthoring,
} from "./corridorEditorShell.js";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "./buildingFloorStack.js";

function readTypicalFloorDoc() {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  );
  return FloorDocSchema.parse(raw);
}

function readMammothBuildingDoc() {
  const raw = JSON.parse(
    readFileSync(new URL("../../../content/building/mammoth.json", import.meta.url), "utf8"),
  );
  return BuildingDocSchema.parse(raw);
}

const FP_FLOOR_19_CORRIDOR_CEILING_LIGHT_MODEL_REL_PATH =
  "static/models/objects/light-ceiling-2.glb";
const FP_FLOOR_19_CORRIDOR_LIGHT_START_Z_M = -72;
const FP_FLOOR_19_CORRIDOR_LIGHT_END_Z_M = 72;
const FP_FLOOR_19_CORRIDOR_LIGHT_SPACING_M = 12;
const FP_FLOOR_19_CORRIDOR_LIGHT_LOCAL_DY_M = 2.722639751374543;
const FP_FLOOR_19_CORRIDOR_LIGHT_SCALE = 0.19097143292300797;

describe("corridorAuthoring", () => {
  const floorDoc = readTypicalFloorDoc();
  const footprint = resolveFloor19CorridorAuthoringFootprint(floorDoc);

  it("resolves corridor_main footprint from the typical floor plate", () => {
    expect(footprint).not.toBeNull();
    expect(footprint!.prefabFootprintSz).toBeCloseTo(159.5, 3);
    expect(footprint!.spanX).toBeGreaterThan(3);
    expect(footprint!.spanZ).toBeGreaterThan(150);
  });

  it("plans corridor editor shell with apartment entry door cutouts on side walls", () => {
    const resolved = resolveCorridorEditorShellForAuthoring({
      floor: floorDoc,
      storyLevelIndex: FLOOR_19_GAMEPLAY_LEVEL_INDEX,
    });
    expect(resolved).not.toBeNull();
    expect(corridorEditorShellWallHoleCount(resolved!.plan.corridorWallHoles)).toBeGreaterThan(10);
  });

  it("lists every stack level whose floor doc contains corridor_main", () => {
    const building = readMammothBuildingDoc();
    const floors = listAuthoringCorridorPreviewFloors(building, (id) =>
      id === floorDoc.id ? floorDoc : undefined,
    );
    expect(floors.length).toBeGreaterThan(10);
    expect(floors.some((f) => f.levelIndex === FLOOR_19_GAMEPLAY_LEVEL_INDEX)).toBe(true);
    expect(
      floors.find((f) => f.levelIndex === FLOOR_19_GAMEPLAY_LEVEL_INDEX)?.hasPersistedBuiltins,
    ).toBe(true);
  });

  it("authors equally spaced ceiling fixtures down floor 19 corridor centerline", () => {
    expect(footprint).not.toBeNull();
    const placedItems = seedFloor19CorridorCeilingLightPlacedItems({
      modelRelPath: FP_FLOOR_19_CORRIDOR_CEILING_LIGHT_MODEL_REL_PATH,
      startZM: FP_FLOOR_19_CORRIDOR_LIGHT_START_Z_M,
      endZM: FP_FLOOR_19_CORRIDOR_LIGHT_END_Z_M,
      spacingM: FP_FLOOR_19_CORRIDOR_LIGHT_SPACING_M,
      uniformScale: FP_FLOOR_19_CORRIDOR_LIGHT_SCALE,
      dy: FP_FLOOR_19_CORRIDOR_LIGHT_LOCAL_DY_M,
      footprint: footprint!,
    });
    const poses = resolveFloor19CorridorDecorPoses(
      ownedApartmentBuiltinsDoc({ version: 2, previewSizeM: 10, placedItems }),
      { footprint, levelIndex: FLOOR_19_GAMEPLAY_LEVEL_INDEX },
    );

    expect(poses).toHaveLength(13);
    expect(poses[0]?.x).toBeCloseTo(0, 3);
    expect(poses[0]?.z).toBeCloseTo(-72, 3);
    expect(poses.at(-1)?.z).toBeCloseTo(72, 3);

    const plateWorldY = (FLOOR_19_GAMEPLAY_LEVEL_INDEX - 1) * DEFAULT_BUILDING_FLOOR_SPACING_M;
    expect(poses[0]?.y).toBeCloseTo(plateWorldY + footprint!.floorY + FP_FLOOR_19_CORRIDOR_LIGHT_LOCAL_DY_M, 3);

    for (let i = 1; i < poses.length; i++) {
      expect(poses[i]!.z - poses[i - 1]!.z).toBeCloseTo(12, 3);
    }
  });
});

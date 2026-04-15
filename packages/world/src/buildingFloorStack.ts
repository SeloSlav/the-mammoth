import * as THREE from "three";
import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import { buildFloorMeshes } from "./floorPlaceholderMeshes.js";
import { elevatorDoorFacesFromGroundFloorDoc } from "./elevatorDoorFacesFromGroundFloorDoc.js";
import {
  addBuildingStairShaftColumnsToRoot,
  getBuildingStairShaftSpecs,
} from "./buildingStairShafts.js";
import {
  mergeElevatorShaftSlabHolesFromFloorDocs,
  mergeShaftSlabHolesFromFloorDocs,
} from "./shaftPlanformClip.js";
import {
  resolveFloorDocForLevel,
  type GetFloorOverrideDoc,
} from "./resolvedFloorDoc.js";

/**
 * Vertical spacing between stacked `BuildingFloorRef` plates (meters).
 * Mamutica (~60 m / 19 inhabited stories) ≈ 3.16 m per story (hr.wikipedia).
 */
export const DEFAULT_BUILDING_FLOOR_SPACING_M = 60 / 19;

export type InstantiateBuildingFloorStackOptions = {
  floorSpacingM?: number;
  getFloorOverrideDoc?: GetFloorOverrideDoc;
  stairWellDef?: StairWellDef;
};

/**
 * Stacks authored floor plates from a `BuildingDoc` into one group (placeholder boxes).
 * `getFloorDoc` must return the `FloorDoc` for each referenced `floorDocId`.
 * Vertical position uses 1-based `BuildingFloorRef.levelIndex` (story 1 sits at y=0).
 */
export function instantiateBuildingFloorStack(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  options?: InstantiateBuildingFloorStackOptions,
): THREE.Group {
  const spacing = options?.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const root = new THREE.Group();
  root.name = `building:${building.id}`;
  const o = building.worldOrigin;
  if (o) root.position.set(o[0], o[1], o[2]);

  const sorted = [...building.floorRefs].sort(
    (a, b) => a.levelIndex - b.levelIndex,
  );
  const resolveDocForRef = (ref: BuildingDoc["floorRefs"][number]) =>
    resolveFloorDocForLevel({
      building,
      ref,
      getFloorDoc,
      getFloorOverrideDoc: options?.getFloorOverrideDoc,
    });
  const stairShaftSpecs = getBuildingStairShaftSpecs(
    building,
    (floorDocId) => getFloorDoc(floorDocId),
    sorted,
    spacing,
  );
  const stairShaftSkipKeys = new Set(stairShaftSpecs.map((s) => s.planKey));

  const docsForShaftMerge = sorted.map((r) =>
    withoutElevatorsInStairwells(resolveDocForRef(r)),
  );
  const shaftHolesPlateMerged = mergeShaftSlabHolesFromFloorDocs(docsForShaftMerge);
  const shaftElevatorsMerged =
    mergeElevatorShaftSlabHolesFromFloorDocs(docsForShaftMerge);

  const groundRef = sorted.find((r) => r.levelIndex === 1);
  const groundDoc = groundRef ? resolveDocForRef(groundRef) : undefined;
  const elevatorDoorFaceByShaftKey = groundDoc
    ? elevatorDoorFacesFromGroundFloorDoc(groundDoc)
    : undefined;
  for (const ref of sorted) {
    const doc = resolveDocForRef(ref);
    const plateWorldOriginY = (o?.[1] ?? 0) + (ref.levelIndex - 1) * spacing;
    const plate = buildFloorMeshes(doc, {
      stairShaftSkipKeys,
      storyLevelIndex: ref.levelIndex,
      shaftHolesPlateMerged,
      shaftElevatorsMerged,
      plateWorldOriginY,
      elevatorDoorFaceByShaftKey,
      stairWellDef: options?.stairWellDef,
    });
    plate.position.y = (ref.levelIndex - 1) * spacing;
    plate.name = `${plate.name}:L${ref.levelIndex}`;
    plate.userData.mammothPlateLevelIndex = ref.levelIndex;
    root.add(plate);
  }

  if (stairShaftSpecs.length > 0) {
    addBuildingStairShaftColumnsToRoot(root, stairShaftSpecs, options?.stairWellDef);
  }

  return root;
}

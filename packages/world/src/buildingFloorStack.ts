import * as THREE from "three";
import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import {
  buildFloorShortLabelMap,
  shortFloorLabelForRef,
} from "./buildingFloorLabels.js";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import { buildFloorMeshes } from "./floorPlaceholderMeshes.js";
import { elevatorDoorFacesFromGroundFloorDoc } from "./elevatorDoorFacesFromGroundFloorDoc.js";
import {
  addBuildingStairShaftColumnsToRoot,
  addBuildingStairShaftColumnsToRootYielding,
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
import { DEFAULT_EXTERIOR_FACADE_SALT } from "./unitExteriorWindows.js";

export { DEFAULT_EXTERIOR_FACADE_SALT };

/**
 * Vertical spacing between stacked `BuildingFloorRef` plates (meters).
 * Mamutica (~60 m / 19 inhabited stories) ≈ 3.16 m per story (hr.wikipedia).
 */
export const DEFAULT_BUILDING_FLOOR_SPACING_M = 60 / 19;

export type InstantiateBuildingFloorStackOptions = {
  floorSpacingM?: number;
  getFloorOverrideDoc?: GetFloorOverrideDoc;
  stairWellDef?: StairWellDef;
  /** Overrides default deterministic salt for unit exterior windows (see `BuildFloorMeshesOptions`). */
  facadeSalt?: number;
};

export type InstantiateBuildingFloorStackAsyncOptions = InstantiateBuildingFloorStackOptions & {
  /**
   * When set, awaited after each floor plate is added so heavy mesh authoring stays chunked
   * (`yieldAfterEachPlate`) and UI hooks can observe progressive stack assembly (auth backdrop).
   * `plateGroup` is the new direct child under `root` for this storey (never reorder plates —
   * build strictly lowest {@link BuildingFloorRef.levelIndex} first unless callers violate authoring).
   */
  afterEachPlate?: (ctx: {
    root: THREE.Group;
    ref: BuildingDoc["floorRefs"][number];
    plateGroup: THREE.Object3D;
  }) => void | Promise<void>;
  /**
   * When set, awaited after each floor plate is added so long `buildFloorMeshes` work is split
   * across tasks (keeps the tab responsive during initial world build).
   */
  yieldAfterEachPlate?: () => Promise<void>;
};

type BuildingFloorStackBuildContext = {
  root: THREE.Group;
  sorted: BuildingDoc["floorRefs"][number][];
  resolveDocForRef: (ref: BuildingDoc["floorRefs"][number]) => FloorDoc;
  stairShaftSpecs: ReturnType<typeof getBuildingStairShaftSpecs>;
  stairShaftSkipKeys: Set<string>;
  shaftHolesPlateMerged: ReturnType<typeof mergeShaftSlabHolesFromFloorDocs>;
  shaftElevatorsMerged: ReturnType<typeof mergeElevatorShaftSlabHolesFromFloorDocs>;
  elevatorDoorFaceByShaftKey: ReturnType<typeof elevatorDoorFacesFromGroundFloorDoc> | undefined;
  maxLevelIndex: number;
  spacing: number;
  o: readonly [number, number, number] | undefined;
  options: InstantiateBuildingFloorStackOptions | undefined;
  floorShortLabelMap: ReturnType<typeof buildFloorShortLabelMap>;
};

function createBuildingFloorStackBuildContext(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  options: InstantiateBuildingFloorStackOptions | undefined,
): BuildingFloorStackBuildContext {
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
  const maxLevelIndex = sorted[sorted.length - 1]!.levelIndex;

  return {
    root,
    sorted,
    resolveDocForRef,
    stairShaftSpecs,
    stairShaftSkipKeys,
    shaftHolesPlateMerged,
    shaftElevatorsMerged,
    elevatorDoorFaceByShaftKey,
    maxLevelIndex,
    spacing,
    o,
    options,
    floorShortLabelMap: buildFloorShortLabelMap(building),
  };
}

async function createBuildingFloorStackBuildContextYielding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  options: InstantiateBuildingFloorStackOptions | undefined,
  yieldBetween: () => Promise<void>,
): Promise<BuildingFloorStackBuildContext> {
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
  await yieldBetween();

  const stairShaftSpecs = getBuildingStairShaftSpecs(
    building,
    (floorDocId) => getFloorDoc(floorDocId),
    sorted,
    spacing,
  );
  await yieldBetween();
  const stairShaftSkipKeys = new Set(stairShaftSpecs.map((s) => s.planKey));

  const docsForShaftMerge = sorted.map((r) =>
    withoutElevatorsInStairwells(resolveDocForRef(r)),
  );
  await yieldBetween();
  const shaftHolesPlateMerged = mergeShaftSlabHolesFromFloorDocs(docsForShaftMerge);
  await yieldBetween();
  const shaftElevatorsMerged =
    mergeElevatorShaftSlabHolesFromFloorDocs(docsForShaftMerge);
  await yieldBetween();

  const groundRef = sorted.find((r) => r.levelIndex === 1);
  const groundDoc = groundRef ? resolveDocForRef(groundRef) : undefined;
  const elevatorDoorFaceByShaftKey = groundDoc
    ? elevatorDoorFacesFromGroundFloorDoc(groundDoc)
    : undefined;
  const maxLevelIndex = sorted[sorted.length - 1]!.levelIndex;

  return {
    root,
    sorted,
    resolveDocForRef,
    stairShaftSpecs,
    stairShaftSkipKeys,
    shaftHolesPlateMerged,
    shaftElevatorsMerged,
    elevatorDoorFaceByShaftKey,
    maxLevelIndex,
    spacing,
    o,
    options,
    floorShortLabelMap: buildFloorShortLabelMap(building),
  };
}

function addSingleFloorPlateToStack(ctx: BuildingFloorStackBuildContext, ref: BuildingDoc["floorRefs"][number]): void {
  const doc = ctx.resolveDocForRef(ref);
  const o = ctx.o;
  const plateWorldOriginY = (o?.[1] ?? 0) + (ref.levelIndex - 1) * ctx.spacing;
  const plate = buildFloorMeshes(doc, {
    stairShaftSkipKeys: ctx.stairShaftSkipKeys,
    storyLevelIndex: ref.levelIndex,
    storyShortLabel: shortFloorLabelForRef(ref),
    shaftHolesPlateMerged: ctx.shaftHolesPlateMerged,
    shaftElevatorsMerged: ctx.shaftElevatorsMerged,
    plateWorldOriginY,
    elevatorDoorFaceByShaftKey: ctx.elevatorDoorFaceByShaftKey,
    stairWellDef: ctx.options?.stairWellDef,
    facadeSalt: ctx.options?.facadeSalt ?? DEFAULT_EXTERIOR_FACADE_SALT,
    isTopOccupiedFloor: ref.levelIndex === ctx.maxLevelIndex,
  });
  plate.position.y = (ref.levelIndex - 1) * ctx.spacing;
  plate.name = `${plate.name}:L${ref.levelIndex}`;
  plate.userData.mammothPlateLevelIndex = ref.levelIndex;
  ctx.root.add(plate);
}

function finalizeBuildingFloorStackStairColumns(ctx: BuildingFloorStackBuildContext): void {
  if (ctx.stairShaftSpecs.length > 0) {
    addBuildingStairShaftColumnsToRoot(
      ctx.root,
      ctx.stairShaftSpecs,
      ctx.options?.stairWellDef,
      ctx.floorShortLabelMap,
    );
  }
}

async function finalizeBuildingFloorStackStairColumnsYielding(
  ctx: BuildingFloorStackBuildContext,
  yieldBetweenColumns: () => Promise<void>,
): Promise<void> {
  if (ctx.stairShaftSpecs.length === 0) return;
  await addBuildingStairShaftColumnsToRootYielding(
    ctx.root,
    ctx.stairShaftSpecs,
    ctx.options?.stairWellDef,
    yieldBetweenColumns,
    ctx.floorShortLabelMap,
  );
}

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
  const ctx = createBuildingFloorStackBuildContext(building, getFloorDoc, options);
  for (const ref of ctx.sorted) {
    addSingleFloorPlateToStack(ctx, ref);
  }
  finalizeBuildingFloorStackStairColumns(ctx);
  return ctx.root;
}

/**
 * Same as {@link instantiateBuildingFloorStack}, but can yield between plates so heavy mesh
 * authoring does not monopolize the main thread.
 */
export async function instantiateBuildingFloorStackAsync(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  options?: InstantiateBuildingFloorStackAsyncOptions,
): Promise<THREE.Group> {
  const { yieldAfterEachPlate, afterEachPlate, ...rest } = options ?? {};
  const ctx = yieldAfterEachPlate
    ? await createBuildingFloorStackBuildContextYielding(
        building,
        getFloorDoc,
        rest,
        yieldAfterEachPlate,
      )
    : createBuildingFloorStackBuildContext(building, getFloorDoc, rest);
  if (yieldAfterEachPlate) await yieldAfterEachPlate();
  const buildRefs = [...ctx.sorted];
  for (const ref of buildRefs) {
    const childCountBefore = ctx.root.children.length;
    addSingleFloorPlateToStack(ctx, ref);
    const plateGroup = ctx.root.children[childCountBefore];
    if (yieldAfterEachPlate) await yieldAfterEachPlate();
    if (afterEachPlate) {
      if (!plateGroup) {
        throw new Error(`buildingFloorStack: missing plate child after level ${ref.levelIndex}`);
      }
      await afterEachPlate({ root: ctx.root, ref, plateGroup });
    }
  }
  if (yieldAfterEachPlate) {
    await finalizeBuildingFloorStackStairColumnsYielding(ctx, yieldAfterEachPlate);
    await yieldAfterEachPlate();
  } else {
    finalizeBuildingFloorStackStairColumns(ctx);
  }
  return ctx.root;
}

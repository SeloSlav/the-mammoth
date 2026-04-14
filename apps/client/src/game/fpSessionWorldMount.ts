import * as THREE from "three";
import { fpLocomotionConstants } from "@the-mammoth/engine";
import {
  buildCollisionSpatialIndex,
  buildStaticCollisionSceneForBuilding,
  buildCellMeshes,
  buildWalkSurfaceSpatialIndex,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  instantiateBuildingFloorStack,
  parseBuildingDoc,
  parseCellDoc,
  parseFloorDoc,
  walkSurfaceAabbXZFootprint,
  walkSurfaceAABBsForBuilding,
} from "@the-mammoth/world";
import type { BuildingDoc } from "@the-mammoth/schemas";
import buildingDoc from "../../../../content/building/mammoth.json";
import cellDoc from "../../../../content/cells/cell_0_0.json";
import { floorPayloadByDocId } from "./fpSessionContentLoad";

export type FpSessionStaticWorld = {
  building: BuildingDoc;
  buildingRoot: THREE.Group;
  cellRoot: THREE.Group;
  staticCollisionSolids: readonly {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }[];
  staticCollisionIndex: ReturnType<typeof buildCollisionSpatialIndex>;
  sampleWalkTopBase: (worldX: number, worldZ: number, probeTopY: number) => number;
};

export function createFpSessionStaticWorld(): FpSessionStaticWorld {
  const building = parseBuildingDoc(buildingDoc);
  const getFloorDoc = (id: string) => parseFloorDoc(floorPayloadByDocId(id));
  const collisionScene = buildStaticCollisionSceneForBuilding(
    building,
    getFloorDoc,
    { floorSpacingM: DEFAULT_BUILDING_FLOOR_SPACING_M },
  );
  const walkAABBs = walkSurfaceAABBsForBuilding(
    building,
    getFloorDoc,
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const walkFootprint =
    walkSurfaceAabbXZFootprint(walkAABBs) ??
    ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 } as const);
  const walkSpatialIndex = buildWalkSurfaceSpatialIndex(walkAABBs);
  const staticCollisionIndex = buildCollisionSpatialIndex(collisionScene.solids);
  const sampleWalkTopBase = (worldX: number, worldZ: number, probeTopY: number) =>
    walkSpatialIndex.sampleTopYWithExteriorGround(worldX, worldZ, probeTopY, walkFootprint, {
      footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
      stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    });

  const buildingRoot = instantiateBuildingFloorStack(building, getFloorDoc);

  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));

  return {
    building,
    buildingRoot,
    cellRoot,
    staticCollisionSolids: collisionScene.solids,
    staticCollisionIndex,
    sampleWalkTopBase,
  };
}

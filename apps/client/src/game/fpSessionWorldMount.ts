import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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

  // Merge all static geometry within each floor plate into one mesh per material.
  // Reduces draw calls from ~100+/floor to ~13/floor — the single largest render perf win.
  // Floor plate visibility (mammothPlateLevelIndex) is preserved on the group itself.
  mergeStaticFloorGeometries(buildingRoot);

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

// ---------------------------------------------------------------------------
// Static geometry merging
// ---------------------------------------------------------------------------

/**
 * For each floor plate group (direct child of buildingRoot that carries
 * `mammothPlateLevelIndex`), collapse all descendant meshes that share the same
 * material into a single merged `Mesh`.  This reduces per-floor draw calls from
 * ~100+ down to ~13 (one per material variant), dramatically lowering the CPU
 * overhead of `renderer.render()`.
 *
 * The group itself is preserved so the existing floor-plate visibility band system
 * (`syncBuildingFloorPlateVisibility`) continues to work unchanged.
 */
function mergeStaticFloorGeometries(buildingRoot: THREE.Group): void {
  // We need world matrices to compute floor-group-local transforms for each mesh.
  // updateMatrixWorld works even before the group is in a scene.
  buildingRoot.updateMatrixWorld(true);

  for (const child of buildingRoot.children) {
    if (typeof child.userData.mammothPlateLevelIndex !== "number") continue;
    const floorGroup = child as THREE.Group;
    const floorWorldInv = new THREE.Matrix4()
      .copy(floorGroup.matrixWorld)
      .invert();

    // Collect geometries keyed by material UUID.
    const geosByMat = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();

    floorGroup.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const material = obj.material as THREE.Material;
      // Clone the geometry and transform it into floor-group-local space so all
      // geometries for this floor share the same coordinate frame when merged.
      obj.updateWorldMatrix(true, false);
      const geo = (obj.geometry as THREE.BufferGeometry).clone();
      geo.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(floorWorldInv, obj.matrixWorld),
      );
      const key = material.uuid;
      if (!geosByMat.has(key)) {
        geosByMat.set(key, { mat: material, geos: [] });
      }
      geosByMat.get(key)!.geos.push(geo);
    });

    if (geosByMat.size === 0) continue;

    // Remove all existing children from the floor group.
    while (floorGroup.children.length > 0) {
      floorGroup.remove(floorGroup.children[0]!);
    }

    // Add one merged mesh per material.
    for (const { mat, geos } of geosByMat.values()) {
      const merged = mergeGeometries(geos, false);
      // Dispose the per-piece clones — merged holds a copy of the data.
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.frustumCulled = true;
      // Transfer matrix frustum culling will use the floor group's bounding sphere.
      floorGroup.add(mesh);
    }
  }
}

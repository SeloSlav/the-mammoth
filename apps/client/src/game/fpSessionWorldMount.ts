import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fpLocomotionConstants } from "@the-mammoth/engine";
import {
  applyStairOpeningCollisionOverlay,
  applyStairRuntimeBlockerOverlay,
  applyStairRuntimeWalkSuppressMasks,
  buildStairOpeningCollisionOverlayForBuilding,
  buildStairRuntimeOverlayForBuilding,
  buildCollisionSpatialIndex,
  buildCellMeshes,
  buildWalkSurfaceSpatialIndex,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  GENERATED_COLLISION_BLOCKER_AABBS,
  GENERATED_WALK_SURFACE_AABBS,
  instantiateBuildingFloorStack,
  parseBuildingDoc,
  parseCellDoc,
  parseFloorDoc,
  parseStairWellDef,
  sampleRuntimeStairSupportTopY,
  walkSurfaceAabbXZFootprint,
} from "@the-mammoth/world";
import type { BuildingDoc } from "@the-mammoth/schemas";
import buildingDoc from "../../../../content/building/mammoth.json";
import cellDoc from "../../../../content/cells/cell_0_0.json";
import stairWellAuthoringJson from "../../../../content/elevator/stairwell.json";
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
  const stairWellDef = parseStairWellDef(stairWellAuthoringJson);
  const stairOpeningOverlay = buildStairOpeningCollisionOverlayForBuilding(
    building,
    getFloorDoc,
    stairWellDef,
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const stairRuntimeOverlay = buildStairRuntimeOverlayForBuilding(
    building,
    getFloorDoc,
    stairWellDef,
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const blockerAABBs = applyStairRuntimeBlockerOverlay(
    applyStairOpeningCollisionOverlay(
      GENERATED_COLLISION_BLOCKER_AABBS,
      stairOpeningOverlay,
    ),
    stairRuntimeOverlay,
  );
  const walkSupportAABBs = applyStairRuntimeWalkSuppressMasks(
    GENERATED_WALK_SURFACE_AABBS,
    stairRuntimeOverlay,
  );
  const walkFootprint =
    walkSurfaceAabbXZFootprint(walkSupportAABBs) ??
    ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 } as const);
  const walkSpatialIndex = buildWalkSurfaceSpatialIndex(walkSupportAABBs);
  const staticCollisionIndex = buildCollisionSpatialIndex(blockerAABBs);
  const sampleWalkTopBase = (worldX: number, worldZ: number, probeTopY: number) => {
    const bakedTop = walkSpatialIndex.sampleTopYWithExteriorGround(
      worldX,
      worldZ,
      probeTopY,
      walkFootprint,
      {
        footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
        stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
      },
    );
    const stairTop = sampleRuntimeStairSupportTopY(
      stairRuntimeOverlay.supportSurfaces,
      worldX,
      worldZ,
      probeTopY,
      {
        footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
        stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
        probeDy: fpLocomotionConstants.walkProbeDy,
      },
    );
    if (!Number.isFinite(stairTop)) return bakedTop;
    if (!Number.isFinite(bakedTop)) return stairTop;
    return Math.max(bakedTop, stairTop);
  };

  const buildingRoot = instantiateBuildingFloorStack(building, getFloorDoc, {
    stairWellDef,
  });

  // Merge all static geometry within each floor plate into one mesh per material.
  // Reduces draw calls from ~100+/floor to ~13/floor — the single largest render perf win.
  // Floor plate visibility (mammothPlateLevelIndex) is preserved on the group itself.
  mergeStaticFloorGeometries(buildingRoot);

  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));

  return {
    building,
    buildingRoot,
    cellRoot,
    staticCollisionSolids: blockerAABBs,
    staticCollisionIndex,
    sampleWalkTopBase,
  };
}

// ---------------------------------------------------------------------------
// Static geometry merging
// ---------------------------------------------------------------------------

/**
 * For each static geometry group that is a direct child of `buildingRoot`,
 * collapse all descendant meshes that share the same material into a single
 * merged `Mesh`.
 *
 * This covers two categories:
 *
 * 1. **Floor plates** (`mammothPlateLevelIndex` set) — per-floor rooms. Reduces
 *    ~100+ draw calls/floor to ~13 (one per material), for a 19-floor building
 *    that is ~1,900 → 247 draw calls.
 *
 * 2. **Stair shaft columns** (`mammothAlwaysVisible` set) — full-height stairwells
 *    with hundreds of individual tread/landing/railing meshes. After merging,
 *    each shaft reduces from ~500 → ~7 draw calls.
 *
 * The group nodes themselves are preserved so the floor-plate visibility band
 * (`syncBuildingFloorPlateVisibility`) and always-visible logic continue to
 * work unchanged.
 */
function mergeStaticFloorGeometries(buildingRoot: THREE.Group): void {
  // updateMatrixWorld propagates transforms through the full hierarchy even
  // before the root is attached to a scene.
  buildingRoot.updateMatrixWorld(true);

  for (const child of buildingRoot.children) {
    const isFloorPlate = typeof child.userData.mammothPlateLevelIndex === "number";
    const isStairColumn = child.userData.mammothAlwaysVisible === true;
    if (!isFloorPlate && !isStairColumn) continue;

    mergeGroupDescendantsByMaterial(child as THREE.Group);
  }
}

/**
 * Merge all descendant `Mesh` objects inside `group` by material, replacing the
 * group's full subtree with one merged `Mesh` per unique material.
 * All geometry is transformed to group-local space before merging so the
 * replacement meshes sit at local origin.
 */
function mergeGroupDescendantsByMaterial(group: THREE.Group): void {
  const groupWorldInv = new THREE.Matrix4()
    .copy(group.matrixWorld)
    .invert();

  /** Meshes that must stay separate (e.g. canvas-textured stair signs). */
  const preserveMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothSkipFloorGeometryMerge === true) preserveMeshes.push(obj);
  });
  for (const m of preserveMeshes) {
    m.removeFromParent();
  }

  // Collect geometry clones keyed by material UUID.
  const geosByMat = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material as THREE.Material;
    obj.updateWorldMatrix(true, false);
    // Transform to group-local space so all merged verts share the same frame.
    const geo = (obj.geometry as THREE.BufferGeometry).clone();
    geo.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(groupWorldInv, obj.matrixWorld),
    );
    const key = material.uuid;
    if (!geosByMat.has(key)) {
      geosByMat.set(key, { mat: material, geos: [] });
    }
    geosByMat.get(key)!.geos.push(geo);
  });

  if (geosByMat.size === 0) return;

  // Swap out all children for the smaller set of merged meshes.
  while (group.children.length > 0) {
    group.remove(group.children[0]!);
  }

  for (const { mat, geos } of geosByMat.values()) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = true;
    group.add(mesh);
  }

  for (const m of preserveMeshes) {
    group.add(m);
  }
}

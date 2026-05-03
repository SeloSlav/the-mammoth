import * as THREE from "three";
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
  buildExteriorEzTreeCollisionAABBs,
  buildExteriorMegablockTreePlacements,
  ENABLE_EXTERIOR_PROCEDURAL_TREES,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_MAX_SCATTER_M,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_MIN_FACADE_CLEARANCE_M,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
  GENERATED_COLLISION_BLOCKER_AABBS,
  GENERATED_WALK_SURFACE_AABBS,
  getBuildingStairShaftSpecs,
  instantiateBuildingFloorStack,
  instantiateBuildingFloorStackAsync,
  parseBuildingDoc,
  parseCellDoc,
  parseFloorDoc,
  parseStairWellDef,
  sampleRuntimeStairSupportTopY,
  walkSurfaceAabbXZFootprint,
  type BuildingStairShaftSpec,
} from "@the-mammoth/world";
import { buildExteriorProceduralTreeGroup } from "@the-mammoth/world/exterior-procedural-trees.js";
import type { BuildingDoc } from "@the-mammoth/schemas";
import buildingDoc from "../../../../../content/building/mammoth.json";
import cellDoc from "../../../../../content/cells/cell_0_0.json";
import stairWellAuthoringJson from "../../../../../content/elevator/stairwell.json";
import { floorPayloadByDocId } from "./fpSessionContentLoad";
import { mergeStaticFloorGeometries, mergeStaticFloorGeometriesYielding } from "./fpSessionStaticFloorMerge.js";
import { yieldToMain } from "./yieldToMain.js";

/** Stair-shaft core AABB for FP mood lighting; keep darkness inside the actual shaft, not corridors. */
export type FpStairShaftInteriorLightBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const STAIR_SHAFT_LIGHT_XZ_INSET_M = 0.18;
const STAIR_SHAFT_LIGHT_Y_PAD_BOTTOM_M = 0.55;
const STAIR_SHAFT_LIGHT_Y_PAD_TOP_M = 3.5;

function stairShaftInteriorLightBoundsFromSpec(s: BuildingStairShaftSpec): FpStairShaftInteriorLightBounds {
  const hw = Math.max(0.05, s.sx * 0.5 - STAIR_SHAFT_LIGHT_XZ_INSET_M);
  const hd = Math.max(0.05, s.sz * 0.5 - STAIR_SHAFT_LIGHT_XZ_INSET_M);
  const minY = s.bottomY - STAIR_SHAFT_LIGHT_Y_PAD_BOTTOM_M;
  const maxY =
    s.bottomY + s.storeyCount * s.storeySpacing + STAIR_SHAFT_LIGHT_Y_PAD_TOP_M;
  return {
    minX: s.px - hw,
    maxX: s.px + hw,
    minY,
    maxY,
    minZ: s.pz - hd,
    maxZ: s.pz + hd,
  };
}

export type FpSessionStaticWorld = {
  building: BuildingDoc;
  buildingRoot: THREE.Group;
  /** Bounds of the authored building stack only; excludes procedural exterior trees. */
  buildingBodyWorldBounds: THREE.Box3;
  cellRoot: THREE.Group;
  staticCollisionSolids: readonly {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }[];
  staticCollisionIndex: ReturnType<typeof buildCollisionSpatialIndex>;
  sampleWalkTopBase: (worldX: number, worldZ: number, probeTopY: number) => number;
  /** World boxes for stair shafts (+ corridor threshold) — FP dims fill lights when camera is inside. */
  stairShaftInteriorLightBounds: readonly FpStairShaftInteriorLightBounds[];
  /** Stair column specs (ids, segment counts) for client-only features such as stairwell decals. */
  stairShaftSpecs: readonly BuildingStairShaftSpec[];
};

export type FpSessionStaticWorldAsyncOpts = {
  /** Prefer mesh + merge ordering for these `BuildingFloorRef.levelIndex` values (hub = 1). */
  priorityPlateLevelIndices?: readonly number[];
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

  /** Authoritative blocker list (walls + shafts + deterministic exterior tree pillars). Built after meshes merge for footprint parity with server hit-scan codegen. */
  let consolidatedCollisionBlockers = blockerAABBs;
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

  const sortedFloorRefs = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const stairSpecs = getBuildingStairShaftSpecs(
    building,
    getFloorDoc,
    sortedFloorRefs,
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const stairShaftInteriorLightBounds = stairSpecs.map(stairShaftInteriorLightBoundsFromSpec);

  // Merge all static geometry within each floor plate into one mesh per material.
  // Reduces draw calls from ~100+/floor to ~13/floor — the single largest render perf win.
  // Floor plate visibility (mammothPlateLevelIndex) is preserved on the group itself.
  mergeStaticFloorGeometries(buildingRoot);
  buildingRoot.updateMatrixWorld(true);
  const buildingBodyWorldBounds = new THREE.Box3().setFromObject(buildingRoot);

  if (ENABLE_EXTERIOR_PROCEDURAL_TREES) {
    const buildingLocalFootprint = new THREE.Box3()
      .setFromObject(buildingRoot)
      .applyMatrix4(new THREE.Matrix4().copy(buildingRoot.matrixWorld).invert());
    buildingLocalFootprint.min.y = 0;
    buildingLocalFootprint.max.y = 1;
    const localGroundY = buildingRoot.worldToLocal(new THREE.Vector3(0, 0, 0)).y;

    const treeScatterOpts = {
      count: Math.max(0, Math.floor(EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT)),
      seed: EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
      minFacadeClearanceM: EXTERIOR_PROCEDURAL_TREE_DEFAULT_MIN_FACADE_CLEARANCE_M,
      maxScatterDistanceM: EXTERIOR_PROCEDURAL_TREE_DEFAULT_MAX_SCATTER_M,
    };
    const exteriorTreePlacements = buildExteriorMegablockTreePlacements(
      buildingLocalFootprint,
      treeScatterOpts,
    );
    consolidatedCollisionBlockers = [
      ...consolidatedCollisionBlockers,
      ...buildExteriorEzTreeCollisionAABBs(exteriorTreePlacements, localGroundY),
    ];

    buildingRoot.add(
      buildExteriorProceduralTreeGroup(buildingLocalFootprint, {
        groundY: localGroundY,
        seed: EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
      }, exteriorTreePlacements),
    );
  }

  const staticCollisionIndex =
    buildCollisionSpatialIndex(consolidatedCollisionBlockers);

  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));

  return {
    building,
    buildingRoot,
    buildingBodyWorldBounds,
    cellRoot,
    staticCollisionSolids: consolidatedCollisionBlockers,
    staticCollisionIndex,
    sampleWalkTopBase,
    stairShaftInteriorLightBounds,
    stairShaftSpecs: stairSpecs,
  };
}

/**
 * FP-session world build broken across `yieldToMain()` boundaries so login does not incur one
 * ~multi-second uninterrupted main-thread task (`long_task`).
 */
export async function createFpSessionStaticWorldAsync(
  opts?: FpSessionStaticWorldAsyncOpts,
): Promise<FpSessionStaticWorld> {
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
    applyStairOpeningCollisionOverlay(GENERATED_COLLISION_BLOCKER_AABBS, stairOpeningOverlay),
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

  let consolidatedCollisionBlockers = blockerAABBs;
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

  const buildingRoot = await instantiateBuildingFloorStackAsync(building, getFloorDoc, {
    stairWellDef,
    yieldAfterEachPlate: yieldToMain,
    priorityPlateLevelIndices: opts?.priorityPlateLevelIndices,
  });

  const sortedFloorRefs = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const stairSpecs = getBuildingStairShaftSpecs(
    building,
    getFloorDoc,
    sortedFloorRefs,
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const stairShaftInteriorLightBounds = stairSpecs.map(stairShaftInteriorLightBoundsFromSpec);

  await mergeStaticFloorGeometriesYielding(buildingRoot, yieldToMain, {
    priorityPlateLevelIndices: opts?.priorityPlateLevelIndices,
  });
  buildingRoot.updateMatrixWorld(true);
  const buildingBodyWorldBounds = new THREE.Box3().setFromObject(buildingRoot);

  if (ENABLE_EXTERIOR_PROCEDURAL_TREES) {
    const buildingLocalFootprint = new THREE.Box3()
      .setFromObject(buildingRoot)
      .applyMatrix4(new THREE.Matrix4().copy(buildingRoot.matrixWorld).invert());
    buildingLocalFootprint.min.y = 0;
    buildingLocalFootprint.max.y = 1;
    const localGroundY = buildingRoot.worldToLocal(new THREE.Vector3(0, 0, 0)).y;

    const treeScatterOpts = {
      count: Math.max(0, Math.floor(EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT)),
      seed: EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
      minFacadeClearanceM: EXTERIOR_PROCEDURAL_TREE_DEFAULT_MIN_FACADE_CLEARANCE_M,
      maxScatterDistanceM: EXTERIOR_PROCEDURAL_TREE_DEFAULT_MAX_SCATTER_M,
    };
    const exteriorTreePlacements = buildExteriorMegablockTreePlacements(
      buildingLocalFootprint,
      treeScatterOpts,
    );
    consolidatedCollisionBlockers = [
      ...consolidatedCollisionBlockers,
      ...buildExteriorEzTreeCollisionAABBs(exteriorTreePlacements, localGroundY),
    ];

    buildingRoot.add(
      buildExteriorProceduralTreeGroup(
        buildingLocalFootprint,
        {
          groundY: localGroundY,
          seed: EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
        },
        exteriorTreePlacements,
      ),
    );
  }

  await yieldToMain();

  const staticCollisionIndex =
    buildCollisionSpatialIndex(consolidatedCollisionBlockers);

  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));

  return {
    building,
    buildingRoot,
    buildingBodyWorldBounds,
    cellRoot,
    staticCollisionSolids: consolidatedCollisionBlockers,
    staticCollisionIndex,
    sampleWalkTopBase,
    stairShaftInteriorLightBounds,
    stairShaftSpecs: stairSpecs,
  };
}

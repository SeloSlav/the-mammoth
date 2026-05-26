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
  type SampleWalkGroundOpts,
} from "@the-mammoth/world";
import type { BuildingDoc } from "@the-mammoth/schemas";
import buildingDoc from "../../../../../content/building/mammoth.json";
import cellDoc from "../../../../../content/cells/cell_0_0.json";
import stairWellAuthoringJson from "../../../../../content/elevator/stairwell.json";
import { floorPayloadByDocId } from "./fpSessionContentLoad";
import { mergeStaticFloorGeometries, mergeMegablockStaticDirectChildYielding, mergeStaticFloorGeometriesYielding } from "./fpSessionStaticFloorMerge.js";
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

export function sampleMegablockWalkTopBase(
  walkSpatialIndex: ReturnType<typeof buildWalkSurfaceSpatialIndex>,
  walkFootprint: { minX: number; maxX: number; minZ: number; maxZ: number },
  stairSupportSurfaces: Parameters<typeof sampleRuntimeStairSupportTopY>[0],
  worldX: number,
  worldZ: number,
  probeTopY: number,
  sampleOpts?: SampleWalkGroundOpts,
): number {
  const walkSampleOpts: SampleWalkGroundOpts = {
    footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
    stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
    ...sampleOpts,
  };
  const bakedTop = walkSpatialIndex.sampleTopYWithExteriorGround(
    worldX,
    worldZ,
    probeTopY,
    walkFootprint,
    walkSampleOpts,
  );
  const stairTop = sampleRuntimeStairSupportTopY(
    stairSupportSurfaces,
    worldX,
    worldZ,
    probeTopY,
    {
      footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
      stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
      probeDy: fpLocomotionConstants.walkProbeDy,
      descentProbe: sampleOpts?.descentProbe,
      maxSupportDropBelowFeetM: sampleOpts?.maxSupportDropBelowFeetM,
    },
  );
  if (!Number.isFinite(stairTop)) return bakedTop;
  if (!Number.isFinite(bakedTop)) return stairTop;
  return Math.max(bakedTop, stairTop);
}

export type FpSessionStaticWorld = {
  building: BuildingDoc;
  buildingRoot: THREE.Group;
  /** Bounds of the authored building stack only. */
  buildingBodyWorldBounds: THREE.Box3;
  cellRoot: THREE.Group;
  staticCollisionSolids: readonly {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
  }[];
  staticCollisionIndex: ReturnType<typeof buildCollisionSpatialIndex>;
  sampleWalkTopBase: (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    sampleOpts?: SampleWalkGroundOpts,
  ) => number;
  walkSupportAABBs: readonly import("@the-mammoth/world").WalkSurfaceAabb[];
  walkFootprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  stairWalkSupportSurfaces: Parameters<typeof sampleRuntimeStairSupportTopY>[0];
  /** World boxes for stair shafts (+ corridor threshold) — FP dims fill lights when camera is inside. */
  stairShaftInteriorLightBounds: readonly FpStairShaftInteriorLightBounds[];
  /** Stair column specs (ids, segment counts) for client-only features such as stairwell decals. */
  stairShaftSpecs: readonly BuildingStairShaftSpec[];
};

export type MegablockBackdropHooks = {
  /**
   * Called after each storey plate is stacked **and** its static geometry is merged — avoids showing raw
   * placeholders that later disappear when the global merge pass runs.
   */
  onFloorPlateInstantiated?: (ctx: { buildingRoot: THREE.Group }) => void | Promise<void>;
};

export type FpSessionStaticWorldAsyncOpts = {
  /**
   * Lazily resolved so hooks can be registered after {@link primeMegablockStaticWorldMeshBuild} starts
   * (e.g. menu mounts mid-build) without restarting the shared promise.
   */
  getBackdropHooks?: () => MegablockBackdropHooks | null | undefined;
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
  const consolidatedCollisionBlockers = applyStairRuntimeBlockerOverlay(
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

  const sampleWalkTopBase = (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    sampleOpts?: SampleWalkGroundOpts,
  ) =>
    sampleMegablockWalkTopBase(
      walkSpatialIndex,
      walkFootprint,
      stairRuntimeOverlay.supportSurfaces,
      worldX,
      worldZ,
      probeTopY,
      sampleOpts,
    );

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
    walkSupportAABBs,
    walkFootprint,
    stairWalkSupportSurfaces: stairRuntimeOverlay.supportSurfaces,
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
  await yieldToMain();
  const building = parseBuildingDoc(buildingDoc);
  const getFloorDoc = (id: string) => parseFloorDoc(floorPayloadByDocId(id));
  const stairWellDef = parseStairWellDef(stairWellAuthoringJson);
  await yieldToMain();
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
  await yieldToMain();
  const consolidatedCollisionBlockers = applyStairRuntimeBlockerOverlay(
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
  await yieldToMain();

  const sampleWalkTopBase = (
    worldX: number,
    worldZ: number,
    probeTopY: number,
    sampleOpts?: SampleWalkGroundOpts,
  ) =>
    sampleMegablockWalkTopBase(
      walkSpatialIndex,
      walkFootprint,
      stairRuntimeOverlay.supportSurfaces,
      worldX,
      worldZ,
      probeTopY,
      sampleOpts,
    );

  const buildingRoot = await instantiateBuildingFloorStackAsync(building, getFloorDoc, {
    stairWellDef,
    yieldAfterEachPlate: yieldToMain,
    afterEachPlate: async ({ root, plateGroup }) => {
      if (typeof plateGroup.userData.mammothPlateLevelIndex === "number") {
        await mergeMegablockStaticDirectChildYielding(plateGroup, yieldToMain);
      }
      const hooks = opts?.getBackdropHooks?.();
      await hooks?.onFloorPlateInstantiated?.({ buildingRoot: root });
    },
  });

  const sortedFloorRefs = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const stairSpecs = getBuildingStairShaftSpecs(
    building,
    getFloorDoc,
    sortedFloorRefs,
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const stairShaftInteriorLightBounds = stairSpecs.map(stairShaftInteriorLightBoundsFromSpec);

  await yieldToMain();
  await mergeStaticFloorGeometriesYielding(buildingRoot, yieldToMain);
  buildingRoot.updateMatrixWorld(true);
  await yieldToMain();
  const buildingBodyWorldBounds = new THREE.Box3().setFromObject(buildingRoot);

  await yieldToMain();
  const staticCollisionIndex =
    buildCollisionSpatialIndex(consolidatedCollisionBlockers);

  await yieldToMain();

  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));

  await yieldToMain();

  return {
    building,
    buildingRoot,
    buildingBodyWorldBounds,
    cellRoot,
    staticCollisionSolids: consolidatedCollisionBlockers,
    staticCollisionIndex,
    sampleWalkTopBase,
    walkSupportAABBs,
    walkFootprint,
    stairWalkSupportSurfaces: stairRuntimeOverlay.supportSurfaces,
    stairShaftInteriorLightBounds,
    stairShaftSpecs: stairSpecs,
  };
}

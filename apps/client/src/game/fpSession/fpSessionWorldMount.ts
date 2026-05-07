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
  megablockExteriorTreeScatterFrameFromWalkHullWorld,
  parseBuildingDoc,
  parseCellDoc,
  parseFloorDoc,
  parseStairWellDef,
  sampleRuntimeStairSupportTopY,
  walkSurfaceAabbXZFootprint,
  type BuildingStairShaftSpec,
} from "@the-mammoth/world";
import {
  buildExteriorProceduralTreeGroup,
  buildExteriorProceduralTreeGroupYielding,
} from "@the-mammoth/world/exterior-procedural-trees.js";
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

export type MegablockBackdropHooks = {
  /**
   * Called after each storey plate is stacked **and** its static geometry is merged — avoids showing raw
   * placeholders that later disappear when the global merge pass runs.
   */
  onFloorPlateInstantiated?: (ctx: { buildingRoot: THREE.Group }) => void | Promise<void>;
  /**
   * Ez-tree meshing starts as soon as we have a scatter frame (walk-surface XZ hull + `worldOrigin`) —
   * **before** any floor plate is merged; `onForestReady` runs after the grove is parented (once
   * `buildingRoot` exists), often while storeys are still stacking.
   */
  onForestReady?: (ctx: { forestRoot: THREE.Group; buildingRoot: THREE.Group }) => void | Promise<void>;
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
  /** Matches {@link buildExteriorProceduralTreeGroupYielding} root name — detach for stack-only bounds. */
  const exteriorTreeGroveName = "exterior_procedural_tree_grove";

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
  const blockerAABBs = applyStairRuntimeBlockerOverlay(
    applyStairOpeningCollisionOverlay(GENERATED_COLLISION_BLOCKER_AABBS, stairOpeningOverlay),
    stairRuntimeOverlay,
  );
  const walkSupportAABBs = applyStairRuntimeWalkSuppressMasks(
    GENERATED_WALK_SURFACE_AABBS,
    stairRuntimeOverlay,
  );
  const walkScatterHull = walkSurfaceAabbXZFootprint(walkSupportAABBs);
  const walkFootprint =
    walkScatterHull ?? ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 } as const);
  const walkSpatialIndex = buildWalkSurfaceSpatialIndex(walkSupportAABBs);
  await yieldToMain();

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

  let exteriorTreePromise: Promise<THREE.Group> | null = null;
  let forestAttachTask: Promise<void> = Promise.resolve();

  let resolveForestParentRoot!: (root: THREE.Group) => void;
  const forestBuildingRootWhenReady = new Promise<THREE.Group>((r) => {
    resolveForestParentRoot = r;
  });
  let forestParentRootLatched = false;
  const latchMegablockRootForForestParent = (root: THREE.Group) => {
    if (forestParentRootLatched) return;
    forestParentRootLatched = true;
    resolveForestParentRoot(root);
  };

  const beginMegablockExteriorForest = (footprint: THREE.Box3, localGroundY: number) => {
    if (!ENABLE_EXTERIOR_PROCEDURAL_TREES || exteriorTreePromise !== null) return;

    const treeScatterOpts = {
      count: Math.max(0, Math.floor(EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT)),
      seed: EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
      minFacadeClearanceM: EXTERIOR_PROCEDURAL_TREE_DEFAULT_MIN_FACADE_CLEARANCE_M,
      maxScatterDistanceM: EXTERIOR_PROCEDURAL_TREE_DEFAULT_MAX_SCATTER_M,
    };
    const exteriorTreePlacements = buildExteriorMegablockTreePlacements(footprint, treeScatterOpts);
    consolidatedCollisionBlockers = [
      ...consolidatedCollisionBlockers,
      ...buildExteriorEzTreeCollisionAABBs(exteriorTreePlacements, localGroundY),
    ];

    const groveShell = new THREE.Group();
    groveShell.name = exteriorTreeGroveName;
    groveShell.userData.mammothExteriorProceduralTrees = true;

    exteriorTreePromise = buildExteriorProceduralTreeGroupYielding(
      footprint,
      yieldToMain,
      {
        groundY: localGroundY,
        seed: EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
      },
      exteriorTreePlacements,
      groveShell,
    );

    forestAttachTask = (async () => {
      const root = await forestBuildingRootWhenReady;
      /** Parent before mesh work finishes so each merged variant becomes visible as soon as it lands. */
      if (groveShell.parent !== root) root.add(groveShell);
      await yieldToMain();
      await exteriorTreePromise!;
      const planted = groveShell.children.length > 0;
      if (!planted) return;
      const hooks = opts?.getBackdropHooks?.();
      await hooks?.onForestReady?.({ forestRoot: groveShell, buildingRoot: root });
      await yieldToMain();
    })();
  };

  if (walkScatterHull !== null) {
    const { footprintBuildingLocal, localGroundY } = megablockExteriorTreeScatterFrameFromWalkHullWorld(
      building,
      walkScatterHull,
    );
    beginMegablockExteriorForest(footprintBuildingLocal, localGroundY);
  }

  const buildingRoot = await instantiateBuildingFloorStackAsync(building, getFloorDoc, {
    stairWellDef,
    yieldAfterEachPlate: yieldToMain,
    afterEachPlate: async ({ root, plateGroup }) => {
      latchMegablockRootForForestParent(root);
      if (typeof plateGroup.userData.mammothPlateLevelIndex === "number") {
        await mergeMegablockStaticDirectChildYielding(plateGroup, yieldToMain);
      }
      const hooks = opts?.getBackdropHooks?.();
      await hooks?.onFloorPlateInstantiated?.({ buildingRoot: root });
    },
  });

  latchMegablockRootForForestParent(buildingRoot);

  const sortedFloorRefs = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const stairSpecs = getBuildingStairShaftSpecs(
    building,
    getFloorDoc,
    sortedFloorRefs,
    DEFAULT_BUILDING_FLOOR_SPACING_M,
  );
  const stairShaftInteriorLightBounds = stairSpecs.map(stairShaftInteriorLightBoundsFromSpec);

  await yieldToMain();

  if (ENABLE_EXTERIOR_PROCEDURAL_TREES && exteriorTreePromise === null) {
    buildingRoot.updateMatrixWorld(true);
    const buildingLocalFootprint = new THREE.Box3()
      .setFromObject(buildingRoot)
      .applyMatrix4(new THREE.Matrix4().copy(buildingRoot.matrixWorld).invert());
    buildingLocalFootprint.min.y = 0;
    buildingLocalFootprint.max.y = 1;
    const localGroundY = buildingRoot.worldToLocal(new THREE.Vector3(0, 0, 0)).y;
    beginMegablockExteriorForest(buildingLocalFootprint, localGroundY);
  }

  await Promise.all([mergeStaticFloorGeometriesYielding(buildingRoot, yieldToMain), forestAttachTask]);

  const grove = buildingRoot.getObjectByName(exteriorTreeGroveName);
  if (grove) buildingRoot.remove(grove);
  buildingRoot.updateMatrixWorld(true);
  await yieldToMain();
  const buildingBodyWorldBounds = new THREE.Box3().setFromObject(buildingRoot);
  if (grove) buildingRoot.add(grove);

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
    stairShaftInteriorLightBounds,
    stairShaftSpecs: stairSpecs,
  };
}

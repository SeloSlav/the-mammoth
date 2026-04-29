import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fpLocomotionConstants } from "@the-mammoth/engine";
import {
  cloneGeometryForMerge,
  mergeGroupDescendantsByMaterial,
} from "./fpMergeGroupDescendantsByMaterial.js";
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
  parseBuildingDoc,
  parseCellDoc,
  parseFloorDoc,
  parseStairWellDef,
  sampleRuntimeStairSupportTopY,
  walkSurfaceAabbXZFootprint,
  type BuildingStairShaftSpec,
} from "@the-mammoth/world";
import type { BuildingDoc } from "@the-mammoth/schemas";
import buildingDoc from "../../../../../content/building/mammoth.json";
import cellDoc from "../../../../../content/cells/cell_0_0.json";
import stairWellAuthoringJson from "../../../../../content/elevator/stairwell.json";
import { floorPayloadByDocId } from "./fpSessionContentLoad";

/** Scratch for {@link mergeUnitPreservedShellsByPlacedObject} (avoid alloc per mesh). */
const _mergeUnitShellScratch = new THREE.Matrix4();

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

  const cellRoot = buildCellMeshes(parseCellDoc(cellDoc));

  return {
    building,
    buildingRoot,
    cellRoot,
    staticCollisionSolids: blockerAABBs,
    staticCollisionIndex,
    sampleWalkTopBase,
    stairShaftInteriorLightBounds,
    stairShaftSpecs: stairSpecs,
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
 * 2. **Stair shaft columns** (`mammothStairColumnRoot` on the column; each **segment** has
 *    `mammothPlateLevelIndex`) — per-storey segments are merged separately so FP can hide
 *    off-band storeys instead of submitting a full-height vertical stack every frame.
 *
 * The group nodes themselves are preserved so the floor-plate visibility band
 * (`syncBuildingFloorPlateVisibility`) can toggle segment children.
 */
function mergeStaticFloorGeometries(buildingRoot: THREE.Group): void {
  // updateMatrixWorld propagates transforms through the full hierarchy even
  // before the root is attached to a scene.
  buildingRoot.updateMatrixWorld(true);

  for (const child of buildingRoot.children) {
    const isFloorPlate = typeof child.userData.mammothPlateLevelIndex === "number";
    const isStairColumn = child.userData.mammothStairColumnRoot === true;
    if (!isFloorPlate && !isStairColumn) continue;

    /**
     * Tag stair-shaft **interior** geometry (treads, corner landings, railings, inner
     * `shaft_wall_*`, `shaft_floor`, `shaft_ceiling`) as `mammothUnitInterior` before merge so the
     * session-level hide (see `mountFpSession` → `unitInteriorMeshes`) drops ~all non-silhouette
     * stair geometry from the exterior view. The outer `_exterior` skins stay untagged; the merged
     * mesh that holds them keeps rendering because `mergeGroupDescendantsByMaterial` requires
     * **every** source contributor to be tagged before propagating the flag. Tread/landing/railing
     * materials are dedicated to stairs, so their merged meshes end up purely interior and get
     * hidden cleanly from street-level views.
     */
    if (isStairColumn) {
      for (const seg of (child as THREE.Group).children) {
        seg.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (obj.name.includes("_exterior")) return;
          obj.userData.mammothUnitInterior = true;
        });
        mergeGroupDescendantsByMaterial(seg as THREE.Group);
      }
      continue;
    }

    mergeGroupDescendantsByMaterial(child as THREE.Group);
    if (isFloorPlate) mergeUnitPreservedShellsByPlacedObject(child as THREE.Group);
  }
}

/**
 * Second pass after {@link mergeGroupDescendantsByMaterial}: unit hollow shells skip the big merge
 * (shared plaster + disjoint volumes broke a single buffer), but **within one apartment** the
 * pieces share materials and sit in a tight volume — merge by `(placedObjectId, material)` so a
 * corridor full of doors drops from many draws per unit to ~2–4 per unit.
 */
function mergeUnitPreservedShellsByPlacedObject(floorPlateGroup: THREE.Group): void {
  floorPlateGroup.updateMatrixWorld(true);
  const floorInv = new THREE.Matrix4().copy(floorPlateGroup.matrixWorld).invert();

  const placedIds = new Set<string>();
  for (const ch of floorPlateGroup.children) {
    if (!(ch instanceof THREE.Mesh)) continue;
    if (ch.userData.mammothSkipFloorGeometryMerge !== true) continue;
    const pid = ch.userData.mammothPlacedObjectId;
    if (typeof pid === "string") placedIds.add(pid);
  }

  for (const placedObjectId of placedIds) {
    const meshes = floorPlateGroup.children.filter(
      (ch): ch is THREE.Mesh =>
        ch instanceof THREE.Mesh &&
        ch.userData.mammothSkipFloorGeometryMerge === true &&
        ch.userData.mammothPlacedObjectId === placedObjectId,
    );

    const byMat = new Map<string, { mat: THREE.Material; list: THREE.Mesh[] }>();
    for (const m of meshes) {
      if (Array.isArray(m.material)) continue;
      const mat = m.material as THREE.Material;
      const key = mat.uuid;
      let bucket = byMat.get(key);
      if (!bucket) {
        bucket = { mat, list: [] };
        byMat.set(key, bucket);
      }
      bucket.list.push(m);
    }

    for (const { mat, list } of byMat.values()) {
      if (list.length <= 1) continue;
      const geos: THREE.BufferGeometry[] = [];
      for (const m of list) {
        m.updateWorldMatrix(true, false);
        _mergeUnitShellScratch.multiplyMatrices(floorInv, m.matrixWorld);
        const g = cloneGeometryForMerge(
          m.geometry as THREE.BufferGeometry,
          _mergeUnitShellScratch,
        );
        geos.push(g);
      }
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      /** If merge fails, keep originals — otherwise the apartment shell vanishes (only glass remains). */
      if (!merged) continue;
      for (const m of list) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, mat);
      /**
       * Keep each apartment shell as its own cullable volume. Corridor views otherwise submit every
       * unit on the visible floor even though only the current sightline can contribute pixels.
       */
      mesh.frustumCulled = true;
      mesh.userData.mammothPlacedObjectId = placedObjectId;
      /** Only hollow unit shells use this merge path (`mammothPlacedObjectId`). */
      mesh.userData.mammothUnitInterior = true;
      mesh.name = `merged_unit_shell:${placedObjectId}`;
      floorPlateGroup.add(mesh);
    }
  }
}


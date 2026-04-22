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

/** Scratch for {@link mergeGroupDescendantsByMaterial} preserve re-parenting (avoid alloc per mesh). */
const _mergePreserveParentInv = new THREE.Matrix4();
const _mergePreserveLocal = new THREE.Matrix4();
const _mergeUnitShellScratch = new THREE.Matrix4();

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
        const g = (m.geometry as THREE.BufferGeometry).clone();
        _mergeUnitShellScratch.multiplyMatrices(floorInv, m.matrixWorld);
        g.applyMatrix4(_mergeUnitShellScratch);
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
      /** Hollow unit buffers can sphere-cull wrong when the eye sits inside the shell volume. */
      mesh.frustumCulled = false;
      mesh.userData.mammothPlacedObjectId = placedObjectId;
      /** Only hollow unit shells use this merge path (`mammothPlacedObjectId`). */
      mesh.userData.mammothUnitInterior = true;
      mesh.name = `merged_unit_shell:${placedObjectId}`;
      floorPlateGroup.add(mesh);
    }
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

  /** Meshes that must stay separate (e.g. canvas-textured stair signs, apartment unit hollow shells). */
  const preserveMeshes: THREE.Mesh[] = [];
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData.mammothSkipFloorGeometryMerge === true) preserveMeshes.push(obj);
  });

  /**
   * Orphaning with `removeFromParent()` before saving world space breaks re-parenting: with no
   * parent, `matrixWorld` collapses to local-only, so `attach()` / `add()` misalign nested room
   * geometry (e.g. hoistway walls vs cab). Snapshot world matrices while still parented.
   */
  const preserveWorld = new Map<THREE.Mesh, THREE.Matrix4>();
  for (const m of preserveMeshes) {
    m.updateMatrixWorld(true);
    preserveWorld.set(m, m.matrixWorld.clone());
    m.removeFromParent();
  }

  /**
   * Collect geometry clones keyed by material UUID, plus a flag tracking whether **all** source
   * meshes contributing to that material were tagged `mammothUnitInterior = true`. Corridor shell
   * walls/ceilings/floors are tagged before merge, and the resulting merged mesh inherits the flag
   * only if every source had it — so e.g. the root-level concrete slab (untagged) sharing a
   * material with corridor floors (tagged) correctly drops the flag and keeps the slab visible.
   */
  const geosByMat = new Map<
    string,
    { mat: THREE.Material; geos: THREE.BufferGeometry[]; allInterior: boolean }
  >();

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
    const isInterior = obj.userData.mammothUnitInterior === true;
    let bucket = geosByMat.get(key);
    if (!bucket) {
      bucket = { mat: material, geos: [], allInterior: isInterior };
      geosByMat.set(key, bucket);
    } else {
      bucket.allInterior = bucket.allInterior && isInterior;
    }
    bucket.geos.push(geo);
  });

  if (geosByMat.size === 0) {
    if (preserveMeshes.length === 0) return;
    while (group.children.length > 0) {
      group.remove(group.children[0]!);
    }
    reattachPreservedMeshesWithSavedWorld(group, preserveMeshes, preserveWorld);
    return;
  }

  // Swap out all children for the smaller set of merged meshes.
  while (group.children.length > 0) {
    group.remove(group.children[0]!);
  }

  for (const { mat, geos, allInterior } of geosByMat.values()) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, mat);
    /**
     * Keep frustum culling ON. Geometry is already baked into group-local space
     * (`applyMatrix4(groupWorldInv * meshMatrixWorld)` above), and `computeBoundingSphere`
     * runs on the merged result — so the sphere correctly encloses every disjoint shell
     * fragment in the mesh's local frame. When the camera sits inside a hollow interior the
     * sphere contains the camera and trivially intersects the frustum, so walls don't vanish.
     * Without this, 19 storeys of merged floor-plate + stair-column geometry submits every
     * frame regardless of camera direction — a catastrophic fill-rate regression.
     */
    mesh.frustumCulled = true;
    /**
     * Propagate the interior-hide flag only when every source mesh for this material was
     * tagged. Mixed materials (e.g. corridor floor + root slab sharing one material) fall
     * through as non-interior so the slab keeps rendering from outside views.
     */
    if (allInterior) mesh.userData.mammothUnitInterior = true;
    group.add(mesh);
  }

  reattachPreservedMeshesWithSavedWorld(group, preserveMeshes, preserveWorld);
}

function reattachPreservedMeshesWithSavedWorld(
  group: THREE.Group,
  preserveMeshes: THREE.Mesh[],
  preserveWorld: Map<THREE.Mesh, THREE.Matrix4>,
): void {
  group.updateMatrixWorld(true);
  for (const m of preserveMeshes) {
    const world = preserveWorld.get(m);
    if (!world) continue;
    group.add(m);
    _mergePreserveParentInv.copy(group.matrixWorld).invert();
    _mergePreserveLocal.multiplyMatrices(_mergePreserveParentInv, world);
    _mergePreserveLocal.decompose(m.position, m.quaternion, m.scale);
    m.updateMatrix();
    /**
     * Re-enable frustum culling — preserved meshes (canvas-textured stair signs, apartment
     * hollow shells, etc.) each have their own geometry bounding sphere and should be culled
     * when outside the camera frustum, same reasoning as the merged meshes above.
     *
     * Exception: elevator / stair-shaft **thin façade skins** (`addShaftShell` →
     * `shaft_wall_*_exterior*`, ~16 mm thick, `noCollision` overlays). Forcing culling on every
     * preserved mesh can false-negative cull these slivers at long range (sphere vs frustum tests
     * + large world coordinates), so the inner brick-toned shaft wall reads through where the
     * exterior concrete skin should be. Keep them always submitted while their floor plate is
     * visible — draw cost is tiny (a few quads per shaft per storey).
     */
    const isThinShaftFacadeSkin =
      m.name.startsWith("shaft_wall_") && m.name.includes("_exterior");
    m.frustumCulled = !isThinShaftFacadeSkin;
  }
}

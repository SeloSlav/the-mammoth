/**
 * Static apartment props — placements match replicated `ApartmentUnit`:
 * wardrobe (`wardrobe_x/z`), footlocker (`foot_x/z`), bed (`bed_x/y/z` + `bed_yaw`).
 *
 * GLB pivots vary — each clone is snapped so its **world AABB bottom** meets the floor plane.
 * After placement, each unit’s three props are merged into **one mesh per material** per unit
 * (see {@link mergeGroupDescendantsByMaterial}) so draw calls stay bounded while each merged group
 * keeps a tight AABB for frustum culling (merging an entire floor’s units into one mesh made the
 * bounds huge and forced the GPU to draw every apartment on the plate every frame).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { DbConnection } from "../../module_bindings";
import type { ApartmentUnit } from "../../module_bindings/types";
import { mergeGroupDescendantsByMaterial } from "../fpSession/fpMergeGroupDescendantsByMaterial.js";
import {
  clientMayUseApartmentStash,
  type ApartmentStashPrompt,
} from "./fpApartmentGameplay.js";

const WARDROBE_URL = "/static/models/objects/wardrobe-closet.glb";
const FOOTLOCKER_URL = "/static/models/objects/footlocker.glb";
const BED_URL = "/static/models/objects/bed.glb";

/** Keep apartment prop construction below one noticeable frame hitch while the player is already in-world. */
const FURNITURE_REBUILD_FRAME_BUDGET_MS = 3.5;
const FURNITURE_REBUILD_MIN_UNITS_PER_SLICE = 1;
const FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M = 1.5;

/** Authoring GLBs — tuned against the replicated wall-based furniture anchors. */
const WARDROBE_VIS_SCALE = 0.98;
const FOOTLOCKER_VIS_SCALE = 0.56;
const BED_VIS_SCALE = 1.14;

/** Set true to force hull debug in production builds. */
const FP_APARTMENT_UNIT_BOUNDS_DEBUG_FORCE = false;

/** Enable with `?apartmentunitdebug`, `localStorage.setItem("mammothApartmentUnitBoundsDebug","1")`, or {@link FP_APARTMENT_UNIT_BOUNDS_DEBUG_FORCE}. */
export function isApartmentUnitBoundsDebugEnabled(): boolean {
  if (FP_APARTMENT_UNIT_BOUNDS_DEBUG_FORCE) return true;
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage.getItem("mammothApartmentUnitBoundsDebug");
    if (ls === "1" || ls === "on") return true;
    if (new URLSearchParams(window.location.search).has("apartmentunitdebug")) return true;
    return false;
  } catch {
    return false;
  }
}

const FOOTLOCKER_PICK_MAX_RAY_M = 5.5;
const WARDROBE_BOUNDS_INSET_M = 0.48;
const FOOTLOCKER_BOUNDS_INSET_M = 0.42;
/** Keep the actual bed GLB AABB well inside the unit hull so it cannot poke through exterior glass. */
const BED_BOUNDS_INSET_M = 2.95;

const FURNITURE_PLACEMENT_FIELDS = [
  "unitKey",
  "unitId",
  "level",
  "bedX",
  "bedY",
  "bedZ",
  "bedYaw",
  "footX",
  "footY",
  "footZ",
  "wardrobeX",
  "wardrobeZ",
  "boundMinX",
  "boundMaxX",
  "boundMinZ",
  "boundMaxZ",
] as const satisfies readonly (keyof ApartmentUnit)[];

const _stashRaycaster = new THREE.Raycaster();
const _screenCenterNdc = new THREE.Vector2(0, 0);
const _visibleStashPickMeshes: THREE.Object3D[] = [];
const _furnitureBoundsScratch = new THREE.Box3();
const _furnitureSizeScratch = new THREE.Vector3();
const _furnitureCenterScratch = new THREE.Vector3();
const _footlockerPickSizeScratch = new THREE.Vector3();
const _footlockerPickCenterScratch = new THREE.Vector3();
const _furnitureVisibilityViewProjection = new THREE.Matrix4();
const _furnitureVisibilityFrustum = new THREE.Frustum();

export function apartmentFurniturePlacementChanged(
  oldUnit: ApartmentUnit,
  newUnit: ApartmentUnit,
): boolean {
  for (const field of FURNITURE_PLACEMENT_FIELDS) {
    if (oldUnit[field] !== newUnit[field]) return true;
  }
  return false;
}

/** After world rotation + xz placement (y left arbitrary), raise/lowers root so mesh bottoms sit on `floorWorldY`. */
function snapCloneBottomToWorldFloor(root: THREE.Object3D, floorWorldY: number): void {
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = floorWorldY - box.min.y;
  root.updateMatrixWorld(true);
}

function keepCloneInsideUnitXZ(root: THREE.Object3D, unit: ApartmentUnit, insetM: number): void {
  root.updateMatrixWorld(true);
  _furnitureBoundsScratch.setFromObject(root);
  _furnitureBoundsScratch.getSize(_furnitureSizeScratch);
  _furnitureBoundsScratch.getCenter(_furnitureCenterScratch);

  const minX = unit.boundMinX + insetM;
  const maxX = unit.boundMaxX - insetM;
  const minZ = unit.boundMinZ + insetM;
  const maxZ = unit.boundMaxZ - insetM;

  let dx = 0;
  if (_furnitureSizeScratch.x > maxX - minX) {
    dx = (minX + maxX) * 0.5 - _furnitureCenterScratch.x;
  } else if (_furnitureBoundsScratch.min.x < minX) {
    dx = minX - _furnitureBoundsScratch.min.x;
  } else if (_furnitureBoundsScratch.max.x > maxX) {
    dx = maxX - _furnitureBoundsScratch.max.x;
  }

  let dz = 0;
  if (_furnitureSizeScratch.z > maxZ - minZ) {
    dz = (minZ + maxZ) * 0.5 - _furnitureCenterScratch.z;
  } else if (_furnitureBoundsScratch.min.z < minZ) {
    dz = minZ - _furnitureBoundsScratch.min.z;
  } else if (_furnitureBoundsScratch.max.z > maxZ) {
    dz = maxZ - _furnitureBoundsScratch.max.z;
  }

  if (dx !== 0 || dz !== 0) {
    root.position.x += dx;
    root.position.z += dz;
    root.updateMatrixWorld(true);
  }
}

function clonePropScene(template: THREE.Object3D, levelIdx: number): THREE.Object3D {
  const root = template.clone(true);
  /** Tag for stripping stale meshes from {@link collectFpSessionUnitInteriorShellMeshes} caches on rebuild. */
  root.userData.mammothApartmentFurnitureProp = true;
  root.userData.mammothPlateLevelIndex = levelIdx;
  root.userData.mammothUnitInterior = true;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.userData.mammothPlateLevelIndex = levelIdx;
      o.userData.mammothUnitInterior = true;
    }
  });
  return root;
}

export type MountFpApartmentFurnitureResult = {
  dispose: () => void;
  syncVisibility: (camera: THREE.PerspectiveCamera) => void;
  getStashPrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => ApartmentStashPrompt | null;
};

type ApartmentFurnitureTemplates = {
  wardrobe: THREE.Object3D;
  footlocker: THREE.Object3D;
  bed: THREE.Object3D;
};

type ApartmentFurnitureBuildState = {
  rows: ApartmentUnit[];
  nextIndex: number;
  byLevel: Map<number, THREE.Group>;
  unitGroups: THREE.Group[];
  stashPickMeshes: THREE.Mesh[];
};

function objectAndAncestorsVisible(obj: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
    if (!cur.visible) return false;
  }
  return true;
}

export async function mountFpApartmentFurniture(opts: {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  /** Runs after every rebuild so FP can refresh `unitInteriorMeshes` visibility targets. */
  onRebuilt?: () => void;
  /**
   * Semi-transparent magenta box per unit using replicated `bound_*` (authoritative hull).
   * Enable via {@link isApartmentUnitBoundsDebugEnabled}.
   */
  showUnitBoundsDebug?: boolean;
}): Promise<MountFpApartmentFurnitureResult> {
  const loader = new GLTFLoader();
  const managed: THREE.Object3D[] = [];
  const unitFurnitureGroups: THREE.Group[] = [];
  const stashPickMeshes: THREE.Mesh[] = [];
  const stashPickGeometry = new THREE.BoxGeometry(1, 1, 1);
  const unitBoundsDebugGeometry = opts.showUnitBoundsDebug ? new THREE.BoxGeometry(1, 1, 1) : null;
  const unitBoundsDebugMaterial =
    opts.showUnitBoundsDebug && unitBoundsDebugGeometry
      ? new THREE.MeshBasicMaterial({
          color: 0xff44cc,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      : null;
  const stashPickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  stashPickMaterial.colorWrite = false;

  let templates: ApartmentFurnitureTemplates | null = null;
  let disposed = false;
  let rebuildScheduled = false;
  let rebuildRunning = false;
  let rebuildRequested = false;
  let activeBuild: ApartmentFurnitureBuildState | null = null;
  let rebuildRaf = 0;

  const disposeGeneratedGeometry = (root: THREE.Object3D) => {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.geometry === stashPickGeometry || o.geometry === unitBoundsDebugGeometry) return;
      o.geometry.dispose();
    });
  };

  const clearManaged = () => {
    for (const o of managed) {
      opts.buildingRoot.remove(o);
      disposeGeneratedGeometry(o);
    }
    managed.length = 0;
    unitFurnitureGroups.length = 0;
    stashPickMeshes.length = 0;
  };

  const disposeBuildState = (build: ApartmentFurnitureBuildState | null) => {
    if (!build) return;
    for (const g of build.byLevel.values()) {
      disposeGeneratedGeometry(g);
    }
    build.byLevel.clear();
    build.unitGroups.length = 0;
    build.stashPickMeshes.length = 0;
  };

  const floorGroupFor = (
    byLevel: Map<number, THREE.Group>,
    levelIdx: number,
  ): THREE.Group => {
    let g = byLevel.get(levelIdx);
    if (!g) {
      g = new THREE.Group();
      g.name = `apartment_furniture_plate_${levelIdx}`;
      g.userData.mammothPlateLevelIndex = levelIdx;
      g.userData.mammothApartmentFurnitureProp = true;
      byLevel.set(levelIdx, g);
    }
    return g;
  };

  const createBuildState = (): ApartmentFurnitureBuildState => ({
    rows: [...opts.conn.db.apartment_unit].filter((row): row is ApartmentUnit => {
      const u = row as ApartmentUnit;
      return u.unitId.startsWith("unit_e_") || u.unitId.startsWith("unit_w_");
    }),
    nextIndex: 0,
    byLevel: new Map<number, THREE.Group>(),
    unitGroups: [],
    stashPickMeshes: [],
  });

  const buildUnitFurniture = (
    build: ApartmentFurnitureBuildState,
    u: ApartmentUnit,
    readyTemplates: ApartmentFurnitureTemplates,
  ) => {
    /** Matches server floor slab (`mn[1]` / `foot_y`). */
    const floorY = u.footY;
    const levelIdx = u.level;
    const plate = floorGroupFor(build.byLevel, levelIdx);
    const furnitureYaw = u.bedYaw;

    const unitGroup = new THREE.Group();
    unitGroup.name = `apartment_furniture_${u.unitKey}`;
    unitGroup.userData.mammothApartmentFurnitureProp = true;
    unitGroup.userData.mammothPlateLevelIndex = levelIdx;

    const w = clonePropScene(readyTemplates.wardrobe, levelIdx);
    w.scale.setScalar(WARDROBE_VIS_SCALE);
    w.position.set(u.wardrobeX, 0, u.wardrobeZ);
    w.rotation.y = furnitureYaw;
    snapCloneBottomToWorldFloor(w, floorY);
    keepCloneInsideUnitXZ(w, u, WARDROBE_BOUNDS_INSET_M);
    unitGroup.add(w);

    const f = clonePropScene(readyTemplates.footlocker, levelIdx);
    f.scale.setScalar(FOOTLOCKER_VIS_SCALE);
    f.position.set(u.footX, 0, u.footZ);
    f.rotation.y = furnitureYaw;
    snapCloneBottomToWorldFloor(f, floorY);
    keepCloneInsideUnitXZ(f, u, FOOTLOCKER_BOUNDS_INSET_M);
    f.updateMatrixWorld(true);
    const footlockerBounds = new THREE.Box3().setFromObject(f);
    const footlockerPick = new THREE.Mesh(stashPickGeometry, stashPickMaterial);
    footlockerBounds.getSize(_footlockerPickSizeScratch);
    footlockerBounds.getCenter(_footlockerPickCenterScratch);
    footlockerPick.name = `apartment_footlocker_pick:${u.unitKey}`;
    footlockerPick.position.copy(_footlockerPickCenterScratch);
    footlockerPick.scale.set(
      Math.max(0.35, _footlockerPickSizeScratch.x),
      Math.max(0.25, _footlockerPickSizeScratch.y),
      Math.max(0.35, _footlockerPickSizeScratch.z),
    );
    footlockerPick.userData.mammothApartmentStashPickUnitKey = u.unitKey;
    footlockerPick.userData.mammothSkipFloorGeometryMerge = true;
    footlockerPick.userData.mammothApartmentFurnitureProp = true;
    footlockerPick.userData.mammothPlateLevelIndex = levelIdx;
    footlockerPick.userData.mammothUnitInterior = true;
    unitGroup.add(f);
    unitGroup.add(footlockerPick);
    build.stashPickMeshes.push(footlockerPick);

    const b = clonePropScene(readyTemplates.bed, levelIdx);
    b.scale.setScalar(BED_VIS_SCALE);
    b.position.set(u.bedX, 0, u.bedZ);
    b.rotation.y = u.bedYaw;
    snapCloneBottomToWorldFloor(b, u.bedY);
    keepCloneInsideUnitXZ(b, u, BED_BOUNDS_INSET_M);
    unitGroup.add(b);

    unitGroup.updateMatrixWorld(true);
    mergeGroupDescendantsByMaterial(unitGroup);
    unitGroup.updateMatrixWorld(true);
    const unitFurnitureBounds = new THREE.Box3().setFromObject(unitGroup);
    unitFurnitureBounds.expandByScalar(FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M);
    unitGroup.userData.mammothApartmentFurnitureWorldBounds = unitFurnitureBounds;

    if (unitBoundsDebugGeometry && unitBoundsDebugMaterial) {
      const hull = new THREE.Mesh(unitBoundsDebugGeometry, unitBoundsDebugMaterial);
      hull.name = `apartment_unit_bounds_debug:${u.unitKey}`;
      hull.userData.mammothApartmentUnitBoundsDebug = true;
      hull.userData.mammothApartmentFurnitureProp = true;
      hull.userData.mammothUnitInterior = true;
      hull.userData.mammothPlateLevelIndex = levelIdx;
      hull.renderOrder = -1;
      const sx = u.boundMaxX - u.boundMinX;
      const sy = Math.max(0.02, u.boundMaxY - u.boundMinY);
      const sz = u.boundMaxZ - u.boundMinZ;
      hull.scale.set(sx, sy, sz);
      hull.position.set(
        (u.boundMinX + u.boundMaxX) * 0.5,
        (u.boundMinY + u.boundMaxY) * 0.5,
        (u.boundMinZ + u.boundMaxZ) * 0.5,
      );
      hull.frustumCulled = false;
      unitGroup.add(hull);
    }

    for (const m of unitGroup.children) {
      if (m instanceof THREE.Mesh) {
        m.castShadow = false;
        m.receiveShadow = false;
      }
    }

    plate.add(unitGroup);
    build.unitGroups.push(unitGroup);
  };

  const finishBuild = (build: ApartmentFurnitureBuildState) => {
    for (const g of build.byLevel.values()) {
      if (g.children.length === 0) continue;
      g.updateMatrixWorld(true);
      opts.buildingRoot.add(g);
      managed.push(g);
    }

    opts.buildingRoot.updateMatrixWorld(true);
    unitFurnitureGroups.length = 0;
    unitFurnitureGroups.push(...build.unitGroups);
    stashPickMeshes.length = 0;
    stashPickMeshes.push(...build.stashPickMeshes);
    opts.onRebuilt?.();
  };

  const runRebuildSlice = () => {
    rebuildRaf = 0;
    if (disposed || !templates || !activeBuild) {
      disposeBuildState(activeBuild);
      rebuildRunning = false;
      activeBuild = null;
      return;
    }

    if (rebuildRequested) {
      disposeBuildState(activeBuild);
      activeBuild = createBuildState();
      rebuildRequested = false;
    }

    const build = activeBuild;
    const sliceStart = performance.now();
    let processed = 0;

    while (build.nextIndex < build.rows.length) {
      buildUnitFurniture(build, build.rows[build.nextIndex]!, templates);
      build.nextIndex += 1;
      processed += 1;
      if (
        processed >= FURNITURE_REBUILD_MIN_UNITS_PER_SLICE &&
        performance.now() - sliceStart >= FURNITURE_REBUILD_FRAME_BUDGET_MS
      ) {
        break;
      }
    }

    if (build.nextIndex >= build.rows.length) {
      finishBuild(build);
      activeBuild = null;
      rebuildRunning = false;
      if (rebuildRequested) scheduleRebuild();
      return;
    }

    rebuildRaf = requestAnimationFrame(runRebuildSlice);
  };

  const beginRebuild = () => {
    if (disposed || !templates) return;
    rebuildRunning = true;
    rebuildRequested = false;
    clearManaged();
    activeBuild = createBuildState();
    rebuildRaf = requestAnimationFrame(runRebuildSlice);
  };

  const scheduleRebuild = () => {
    if (disposed) return;
    rebuildRequested = true;
    if (!templates || rebuildScheduled || rebuildRunning) return;
    rebuildScheduled = true;
    requestAnimationFrame(() => {
      if (disposed) return;
      rebuildScheduled = false;
      beginRebuild();
    });
  };

  void Promise.all([
    loader.loadAsync(WARDROBE_URL),
    loader.loadAsync(FOOTLOCKER_URL),
    loader.loadAsync(BED_URL),
  ])
    .then(([wardrobeGltf, footGltf, bedGltf]) => {
      if (disposed) return;
      templates = {
        wardrobe: wardrobeGltf.scene,
        footlocker: footGltf.scene,
        bed: bedGltf.scene,
      };
      scheduleRebuild();
    })
    .catch((err) => {
      console.warn("[mountFpApartmentFurniture] failed to load furniture GLBs", err);
    });

  const bumpApartmentUnit = () => scheduleRebuild();
  const bumpApartmentUnitIfPlacementChanged = (
    _ctx: unknown,
    oldUnit: ApartmentUnit,
    newUnit: ApartmentUnit,
  ) => {
    if (apartmentFurniturePlacementChanged(oldUnit, newUnit)) {
      scheduleRebuild();
    }
  };

  opts.conn.db.apartment_unit.onInsert(bumpApartmentUnit);
  opts.conn.db.apartment_unit.onUpdate(bumpApartmentUnitIfPlacementChanged);
  opts.conn.db.apartment_unit.onDelete(bumpApartmentUnit);

  return {
    syncVisibility: (camera) => {
      if (unitFurnitureGroups.length === 0) return;
      camera.updateMatrixWorld();
      _furnitureVisibilityViewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      _furnitureVisibilityFrustum.setFromProjectionMatrix(_furnitureVisibilityViewProjection);
      for (let i = 0; i < unitFurnitureGroups.length; i++) {
        const g = unitFurnitureGroups[i]!;
        const bounds = g.userData.mammothApartmentFurnitureWorldBounds;
        g.visible = bounds instanceof THREE.Box3
          ? _furnitureVisibilityFrustum.intersectsBox(bounds)
          : true;
      }
    },
    getStashPrompt: (playerPos, camera) => {
      if (!opts.conn.identity || stashPickMeshes.length === 0) return null;
      _visibleStashPickMeshes.length = 0;
      for (const m of stashPickMeshes) {
        if (objectAndAncestorsVisible(m)) _visibleStashPickMeshes.push(m);
      }
      if (_visibleStashPickMeshes.length === 0) return null;
      _stashRaycaster.setFromCamera(_screenCenterNdc, camera);
      _stashRaycaster.far = FOOTLOCKER_PICK_MAX_RAY_M;
      const hits = _stashRaycaster.intersectObjects(_visibleStashPickMeshes, false);
      const seen = new Set<string>();
      for (const hit of hits) {
        const unitKey = hit.object.userData.mammothApartmentStashPickUnitKey;
        if (typeof unitKey !== "string" || seen.has(unitKey)) continue;
        seen.add(unitKey);
        if (clientMayUseApartmentStash(opts.conn, opts.conn.identity, unitKey, playerPos)) {
          return { kind: "apartment_stash", unitKey };
        }
      }
      return null;
    },
    dispose: () => {
      disposed = true;
      if (rebuildRaf !== 0) {
        cancelAnimationFrame(rebuildRaf);
        rebuildRaf = 0;
      }
      opts.conn.db.apartment_unit.removeOnInsert(bumpApartmentUnit);
      opts.conn.db.apartment_unit.removeOnUpdate(bumpApartmentUnitIfPlacementChanged);
      opts.conn.db.apartment_unit.removeOnDelete(bumpApartmentUnit);
      clearManaged();
      disposeBuildState(activeBuild);
      activeBuild = null;
      stashPickGeometry.dispose();
      stashPickMaterial.dispose();
      unitBoundsDebugGeometry?.dispose();
      unitBoundsDebugMaterial?.dispose();
    },
  };
}

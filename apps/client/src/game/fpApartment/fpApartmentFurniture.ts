/**
 * Static apartment props — placements match replicated `ApartmentUnit`:
 * wardrobe (`wardrobe_x/z`), footlocker (`foot_x/z`), stove (`stove_x/z`), bed (`bed_x/y/z` + `bed_yaw`).
 *
 * GLB pivots vary — each clone is snapped so its **world AABB bottom** meets the floor plane.
 * After placement, each unit’s props are merged into **one mesh per material** per unit
 * (see {@link mergeGroupDescendantsByMaterial}) so draw calls stay bounded while each merged group
 * keeps a tight AABB for frustum culling (merging an entire floor’s units into one mesh made the
 * bounds huge and forced the GPU to draw every apartment on the plate every frame).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
  ownedApartmentPlacedItemAuthoringAssetVisScale,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../../module_bindings";
import type { ApartmentUnit } from "../../module_bindings/types";
import { mergeGroupDescendantsByMaterialYielding } from "../fpSession/fpMergeGroupDescendantsByMaterial.js";
import { FP_INTERACTION_PICK_LAYER } from "../fpSession/fpSessionConstants.js";
import { tagResidentialUnitInteriorMeshesUnder } from "./fpResidentialUnitInteriorLayer.js";
import { yieldToMain } from "../fpSession/yieldToMain.js";
import {
  apartmentUnitOwnerEqual,
  clientMayUseApartmentStash,
  residentInteriorPropsVisibleForViewer,
  type ApartmentStashPrompt,
} from "./fpApartmentGameplay.js";
import {
  apartmentStashKey,
  apartmentStashLabel,
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
} from "./fpApartmentStashKey.js";
import {
  loadOwnedApartmentBuiltinsDocFromContent,
  resolveApartmentFurniturePose,
} from "./fpOwnedApartmentBuiltinsFromContent.js";

const WARDROBE_URL = "/static/models/objects/wardrobe-closet.glb";
const FOOTLOCKER_URL = "/static/models/objects/footlocker.glb";
const BED_URL = "/static/models/objects/bed.glb";
const STOVE_URL = "/static/models/objects/stove.glb";

/** Max synchronous CPU per scheduler tick **between whole units** (each unit also yields internally). */
const FURNITURE_REBUILD_FRAME_BUDGET_MS = 3.5;
const FURNITURE_REBUILD_MIN_UNITS_PER_SLICE = 1;
const FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M = 1.5;

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
const STOVE_BOUNDS_INSET_M = 0.42;
/**
 * Replication seed path only: replicated `bed_x/z/y` anchors can graze exterior glass; pull the live
 * mesh inward before merge. **Not** used for {@link loadOwnedApartmentBuiltinsDocFromContent} poses
 * — those should preserve the exact authoring edge reach from the editor.
 */
const BED_BOUNDS_INSET_M = 2.95;
/**
 * When disk JSON supplies fractions, preserve the authored placement exactly so props can reach the
 * same strict-hull edge seen in the editor, including window faces.
 */
const AUTHORING_FURNITURE_BOUNDARY_SLACK_M = 0;

const FURNITURE_PLACEMENT_FIELDS = [
  "unitKey",
  "unitId",
  "level",
  "state",
  "owner",
  "bedX",
  "bedY",
  "bedZ",
  "bedYaw",
  "footX",
  "footY",
  "footZ",
  "wardrobeX",
  "wardrobeZ",
  "stoveX",
  "stoveZ",
  "boundMinX",
  "boundMaxX",
  "boundMinZ",
  "boundMaxZ",
] as const satisfies readonly (keyof ApartmentUnit)[];

const _stashRaycaster = new THREE.Raycaster();
const _screenCenterNdc = new THREE.Vector2(0, 0);
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
    if (field === "owner") {
      if (!apartmentUnitOwnerEqual(oldUnit.owner, newUnit.owner)) return true;
      continue;
    }
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

type UnitXZClampOptions = {
  insetM: number;
  fractionMin?: number;
  fractionMax?: number;
};

function keepCloneInsideUnitXZ(
  root: THREE.Object3D,
  unit: ApartmentUnit,
  opts: UnitXZClampOptions,
): void {
  root.updateMatrixWorld(true);
  _furnitureBoundsScratch.setFromObject(root);
  _furnitureBoundsScratch.getSize(_furnitureSizeScratch);
  _furnitureBoundsScratch.getCenter(_furnitureCenterScratch);

  const spanX = unit.boundMaxX - unit.boundMinX;
  const spanZ = unit.boundMaxZ - unit.boundMinZ;
  const fractionMin = opts.fractionMin ?? 0;
  const fractionMax = opts.fractionMax ?? 1;
  const minX = unit.boundMinX + spanX * fractionMin + opts.insetM;
  const maxX = unit.boundMinX + spanX * fractionMax - opts.insetM;
  const minZ = unit.boundMinZ + spanZ * fractionMin + opts.insetM;
  const maxZ = unit.boundMinZ + spanZ * fractionMax - opts.insetM;

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

function xzClampOptionsForFurnitureClamp(
  useAuthoringClamp: boolean,
  seededInsetM: number,
): UnitXZClampOptions {
  if (useAuthoringClamp) {
    return {
      insetM: AUTHORING_FURNITURE_BOUNDARY_SLACK_M,
      fractionMin: OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
      fractionMax: OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
    };
  }
  return { insetM: seededInsetM };
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
  syncVisibility: (
    camera: THREE.PerspectiveCamera,
    allowDemandBuild?: boolean,
    containingUnitKey?: string | null,
  ) => void;
  /**
   * Center-screen ray vs invisible footlocker / wardrobe / stove picks — returns stash prompt when the viewer
   * owns the unit and {@link clientMayUseApartmentStash} passes (same replicated stash).
   */
  getStashPrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => ApartmentStashPrompt | null;
  /** `unitKey` of unclaimed wardrobe under reticle, or `null` — claim HUD keys off this + {@link getApartmentSystemPrompt}. */
  getWardrobeClaimLookAtUnitKey: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => string | null;
};

type ApartmentFurnitureTemplates = {
  wardrobe: THREE.Object3D;
  footlocker: THREE.Object3D;
  stove: THREE.Object3D;
  bed: THREE.Object3D;
};

type ApartmentFurnitureLevelState = {
  group: THREE.Group;
  unitGroups: THREE.Group[];
  stashPickMeshes: THREE.Mesh[];
  wardrobePickMeshes: THREE.Mesh[];
};

type ApartmentFurnitureLevelBuildJob = {
  level: number;
  rows: ApartmentUnit[];
  nextIndex: number;
  group: THREE.Group;
  unitGroups: THREE.Group[];
  stashPickMeshes: THREE.Mesh[];
  wardrobePickMeshes: THREE.Mesh[];
};

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
  const builtinsFromContent = await loadOwnedApartmentBuiltinsDocFromContent();

  const managed: THREE.Object3D[] = [];
  const unitFurnitureGroups: THREE.Group[] = [];
  const stashPickMeshes: THREE.Mesh[] = [];
  const wardrobePickMeshes: THREE.Mesh[] = [];
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
  let templatesLoading = false;
  let templatesLoadFailed = false;
  let disposed = false;
  let buildRaf = 0;
  /** True while a slice callback is running async work — prevents overlapping demand-build schedules from {@link syncVisibility}. */
  let furnitureBuildPending = false;
  /** Incremented when pending/in-flight builds must abort (dispose, cancel demand build, full reset). */
  let furnitureBuildEpoch = 0;
  let activeBuildJob: ApartmentFurnitureLevelBuildJob | null = null;
  let rowsByLevel = new Map<number, ApartmentUnit[]>();
  const builtLevels = new Map<number, ApartmentFurnitureLevelState>();
  const emptyBuiltLevels = new Set<number>();
  const queuedLevels: number[] = [];
  const queuedLevelSet = new Set<number>();
  const visibleLevelScratch = new Set<number>();

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
    wardrobePickMeshes.length = 0;
    builtLevels.clear();
    emptyBuiltLevels.clear();
  };

  const disposeBuildJob = (job: ApartmentFurnitureLevelBuildJob | null) => {
    if (!job) return;
    disposeGeneratedGeometry(job.group);
    job.unitGroups.length = 0;
    job.stashPickMeshes.length = 0;
    job.wardrobePickMeshes.length = 0;
  };

  const createFloorGroup = (levelIdx: number): THREE.Group => {
    const g = new THREE.Group();
    g.name = `apartment_furniture_plate_${levelIdx}`;
    g.userData.mammothPlateLevelIndex = levelIdx;
    g.userData.mammothApartmentFurnitureProp = true;
    return g;
  };

  const indexRowsByLevel = (): Map<number, ApartmentUnit[]> => {
    const next = new Map<number, ApartmentUnit[]>();
    for (const row of opts.conn.db.apartment_unit) {
      const u = row as ApartmentUnit;
      if (!u.unitId.startsWith("unit_")) continue;
      const arr = next.get(u.level);
      if (arr) {
        arr.push(u);
      } else {
        next.set(u.level, [u]);
      }
    }
    return next;
  };

  const furnitureBuildNeedsContinue = (): boolean => {
    if (disposed || !templates) return false;
    if (queuedLevels.length > 0) return true;
    const job = activeBuildJob;
    return job !== null && job.nextIndex < job.rows.length;
  };

  const bumpFurnitureBuildEpoch = () => {
    furnitureBuildEpoch += 1;
  };

  async function buildUnitFurnitureAsync(
    build: ApartmentFurnitureLevelBuildJob,
    u: ApartmentUnit,
    readyTemplates: ApartmentFurnitureTemplates,
    epoch: number,
  ): Promise<void> {
    if (disposed || furnitureBuildEpoch !== epoch) return;
    const levelIdx = u.level;
    const plate = build.group;

    if (!residentInteriorPropsVisibleForViewer(opts.conn, u)) {
      const unitGroup = new THREE.Group();
      unitGroup.name = `apartment_furniture_shell:${u.unitKey}`;
      unitGroup.userData.mammothApartmentFurnitureProp = true;
      unitGroup.userData.mammothApartmentUnitKey = u.unitKey;
      unitGroup.userData.mammothPlateLevelIndex = levelIdx;
      plate.add(unitGroup);
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
      tagResidentialUnitInteriorMeshesUnder(unitGroup);
      build.unitGroups.push(unitGroup);
      return;
    }

    {
      /** Legacy replicated furniture visuals are retired; placed decor owns all apartment contents. */
      const unitGroup = new THREE.Group();
      unitGroup.name = `apartment_furniture_delegated_decor:${u.unitKey}`;
      unitGroup.userData.mammothApartmentFurnitureProp = true;
      unitGroup.userData.mammothApartmentUnitKey = u.unitKey;
      unitGroup.userData.mammothPlateLevelIndex = levelIdx;
      plate.add(unitGroup);
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
      tagResidentialUnitInteriorMeshesUnder(unitGroup);
      build.unitGroups.push(unitGroup);
      return;
    }

    /** Built-ins JSON fractions only affect this spawn path — meshes are built only for the viewer's claimed unit. */
    const pose = resolveApartmentFurniturePose(u, builtinsFromContent);
    const useAuthoringClamp = builtinsFromContent != null;

    const unitGroup = new THREE.Group();
    unitGroup.name = `apartment_furniture_${u.unitKey}`;
    unitGroup.userData.mammothApartmentFurnitureProp = true;
    unitGroup.userData.mammothApartmentUnitKey = u.unitKey;
    unitGroup.userData.mammothPlateLevelIndex = levelIdx;
    plate.add(unitGroup);

    const w = clonePropScene(readyTemplates.wardrobe, levelIdx);
    w.scale.setScalar(
      ownedApartmentPlacedItemAuthoringAssetVisScale("wardrobe") * pose.wardrobe.uniformScale,
    );
    w.position.set(pose.wardrobe.x, 0, pose.wardrobe.z);
    w.rotation.y = pose.wardrobe.yaw;
    snapCloneBottomToWorldFloor(w, pose.wardrobe.snapFloorY);
    keepCloneInsideUnitXZ(
      w,
      u,
      xzClampOptionsForFurnitureClamp(useAuthoringClamp, WARDROBE_BOUNDS_INSET_M),
    );
    w.updateMatrixWorld(true);
    const wardrobeBounds = new THREE.Box3().setFromObject(w);
    const wardrobePick = new THREE.Mesh(stashPickGeometry, stashPickMaterial);
    wardrobeBounds.getSize(_footlockerPickSizeScratch);
    wardrobeBounds.getCenter(_footlockerPickCenterScratch);
    wardrobePick.name = `apartment_wardrobe_pick:${u.unitKey}`;
    wardrobePick.position.copy(_footlockerPickCenterScratch);
    wardrobePick.scale.set(
      Math.max(0.35, _footlockerPickSizeScratch.x),
      Math.max(0.25, _footlockerPickSizeScratch.y),
      Math.max(0.35, _footlockerPickSizeScratch.z),
    );
    wardrobePick.userData.mammothApartmentWardrobePickUnitKey = u.unitKey;
    wardrobePick.userData.mammothApartmentStashPickUnitKey = u.unitKey;
    wardrobePick.userData.mammothApartmentStashKey = apartmentStashKey(
      u.unitKey,
      APARTMENT_STASH_KIND_WARDROBE,
    );
    wardrobePick.userData.mammothApartmentStashKind = APARTMENT_STASH_KIND_WARDROBE;
    wardrobePick.userData.mammothSkipFloorGeometryMerge = true;
    wardrobePick.userData.mammothApartmentFurnitureProp = true;
    wardrobePick.userData.mammothPlateLevelIndex = levelIdx;
    wardrobePick.layers.set(FP_INTERACTION_PICK_LAYER);
    unitGroup.add(w);
    unitGroup.add(wardrobePick);
    build.wardrobePickMeshes.push(wardrobePick);
    build.stashPickMeshes.push(wardrobePick);

    await yieldToMain();
    if (disposed || furnitureBuildEpoch !== epoch) return;

    const f = clonePropScene(readyTemplates.footlocker, levelIdx);
    f.scale.setScalar(
      ownedApartmentPlacedItemAuthoringAssetVisScale("footlocker") * pose.footlocker.uniformScale,
    );
    f.position.set(pose.footlocker.x, 0, pose.footlocker.z);
    f.rotation.y = pose.footlocker.yaw;
    snapCloneBottomToWorldFloor(f, pose.footlocker.snapFloorY);
    keepCloneInsideUnitXZ(
      f,
      u,
      xzClampOptionsForFurnitureClamp(useAuthoringClamp, FOOTLOCKER_BOUNDS_INSET_M),
    );
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
    footlockerPick.userData.mammothApartmentStashKey = apartmentStashKey(
      u.unitKey,
      APARTMENT_STASH_KIND_FOOTLOCKER,
    );
    footlockerPick.userData.mammothApartmentStashKind = APARTMENT_STASH_KIND_FOOTLOCKER;
    footlockerPick.userData.mammothSkipFloorGeometryMerge = true;
    footlockerPick.userData.mammothApartmentFurnitureProp = true;
    footlockerPick.userData.mammothPlateLevelIndex = levelIdx;
    footlockerPick.layers.set(FP_INTERACTION_PICK_LAYER);
    unitGroup.add(f);
    unitGroup.add(footlockerPick);
    build.stashPickMeshes.push(footlockerPick);

    await yieldToMain();
    if (disposed || furnitureBuildEpoch !== epoch) return;

    const st = clonePropScene(readyTemplates.stove, levelIdx);
    st.scale.setScalar(
      ownedApartmentPlacedItemAuthoringAssetVisScale("stove") * pose.stove.uniformScale,
    );
    st.position.set(pose.stove.x, 0, pose.stove.z);
    st.rotation.y = pose.stove.yaw;
    snapCloneBottomToWorldFloor(st, pose.stove.snapFloorY);
    keepCloneInsideUnitXZ(
      st,
      u,
      xzClampOptionsForFurnitureClamp(useAuthoringClamp, STOVE_BOUNDS_INSET_M),
    );
    st.updateMatrixWorld(true);
    const stoveBounds = new THREE.Box3().setFromObject(st);
    const stovePick = new THREE.Mesh(stashPickGeometry, stashPickMaterial);
    stoveBounds.getSize(_footlockerPickSizeScratch);
    stoveBounds.getCenter(_footlockerPickCenterScratch);
    stovePick.name = `apartment_stove_pick:${u.unitKey}`;
    stovePick.position.copy(_footlockerPickCenterScratch);
    stovePick.scale.set(
      Math.max(0.35, _footlockerPickSizeScratch.x),
      Math.max(0.25, _footlockerPickSizeScratch.y),
      Math.max(0.35, _footlockerPickSizeScratch.z),
    );
    stovePick.userData.mammothApartmentStashPickUnitKey = u.unitKey;
    stovePick.userData.mammothApartmentStashKey = apartmentStashKey(
      u.unitKey,
      APARTMENT_STASH_KIND_STOVE,
    );
    stovePick.userData.mammothApartmentStashKind = APARTMENT_STASH_KIND_STOVE;
    stovePick.userData.mammothSkipFloorGeometryMerge = true;
    stovePick.userData.mammothApartmentFurnitureProp = true;
    stovePick.userData.mammothPlateLevelIndex = levelIdx;
    stovePick.layers.set(FP_INTERACTION_PICK_LAYER);
    unitGroup.add(st);
    unitGroup.add(stovePick);
    build.stashPickMeshes.push(stovePick);

    await yieldToMain();
    if (disposed || furnitureBuildEpoch !== epoch) return;

    const b = clonePropScene(readyTemplates.bed, levelIdx);
    b.scale.setScalar(
      ownedApartmentPlacedItemAuthoringAssetVisScale("bed") * pose.bed.uniformScale,
    );
    b.position.set(pose.bed.x, 0, pose.bed.z);
    b.rotation.y = pose.bed.yaw;
    snapCloneBottomToWorldFloor(b, pose.bed.y);
    keepCloneInsideUnitXZ(
      b,
      u,
      xzClampOptionsForFurnitureClamp(useAuthoringClamp, BED_BOUNDS_INSET_M),
    );
    unitGroup.add(b);

    await yieldToMain();
    if (disposed || furnitureBuildEpoch !== epoch) return;

    unitGroup.updateMatrixWorld(true);
    await mergeGroupDescendantsByMaterialYielding(unitGroup, yieldToMain);

    await yieldToMain();
    if (disposed || furnitureBuildEpoch !== epoch) return;

    unitGroup.updateMatrixWorld(true);
    const unitFurnitureBounds = new THREE.Box3().setFromObject(unitGroup);
    unitFurnitureBounds.expandByScalar(FURNITURE_VISIBILITY_FRUSTUM_MARGIN_M);
    unitGroup.userData.mammothApartmentFurnitureWorldBounds = unitFurnitureBounds;

    if (unitBoundsDebugGeometry && unitBoundsDebugMaterial) {
      const hull = new THREE.Mesh(unitBoundsDebugGeometry!, unitBoundsDebugMaterial!);
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
        m.userData.mammothApartmentUnitKey = u.unitKey;
        m.castShadow = false;
        m.receiveShadow = false;
      }
    }
    tagResidentialUnitInteriorMeshesUnder(unitGroup);

    build.unitGroups.push(unitGroup);
  }

  const finishLevelBuild = (build: ApartmentFurnitureLevelBuildJob) => {
    build.group.updateMatrixWorld(true);
    opts.buildingRoot.add(build.group);
    managed.push(build.group);
    builtLevels.set(build.level, {
      group: build.group,
      unitGroups: build.unitGroups,
      stashPickMeshes: build.stashPickMeshes,
      wardrobePickMeshes: build.wardrobePickMeshes,
    });
    opts.buildingRoot.updateMatrixWorld(true);
    unitFurnitureGroups.push(...build.unitGroups);
    stashPickMeshes.push(...build.stashPickMeshes);
    wardrobePickMeshes.push(...build.wardrobePickMeshes);
    opts.onRebuilt?.();
  };

  const startNextBuildJob = (): ApartmentFurnitureLevelBuildJob | null => {
    while (queuedLevels.length > 0) {
      const level = queuedLevels.shift()!;
      queuedLevelSet.delete(level);
      if (builtLevels.has(level) || emptyBuiltLevels.has(level)) continue;
      const rows = rowsByLevel.get(level) ?? [];
      if (rows.length === 0) {
        emptyBuiltLevels.add(level);
        continue;
      }
      return {
        level,
        rows,
        nextIndex: 0,
        group: createFloorGroup(level),
        unitGroups: [],
        stashPickMeshes: [],
        wardrobePickMeshes: [],
      };
    }
    return null;
  };

  const scheduleBuildSlice = () => {
    if (disposed || !templates || furnitureBuildPending || buildRaf !== 0) return;
    buildRaf = requestAnimationFrame(() => {
      buildRaf = 0;
      furnitureBuildPending = true;
      void runBuildSliceAsync().finally(() => {
        furnitureBuildPending = false;
        if (furnitureBuildNeedsContinue()) scheduleBuildSlice();
      });
    });
  };

  const ensureTemplatesLoading = () => {
    if (templates || templatesLoading || templatesLoadFailed) return;
    templatesLoading = true;
    void Promise.all([
      loader.loadAsync(WARDROBE_URL),
      loader.loadAsync(FOOTLOCKER_URL),
      loader.loadAsync(STOVE_URL),
      loader.loadAsync(BED_URL),
    ])
      .then(([wardrobeGltf, footGltf, stoveGltf, bedGltf]) => {
        templatesLoading = false;
        if (disposed) return;
        templates = {
          wardrobe: wardrobeGltf.scene,
          footlocker: footGltf.scene,
          stove: stoveGltf.scene,
          bed: bedGltf.scene,
        };
        rowsByLevel = indexRowsByLevel();
        scheduleBuildSlice();
      })
      .catch((err) => {
        templatesLoading = false;
        templatesLoadFailed = true;
        console.warn("[mountFpApartmentFurniture] failed to load furniture GLBs", err);
      });
  };

  async function runBuildSliceAsync(): Promise<void> {
    if (disposed || !templates) {
      disposeBuildJob(activeBuildJob);
      activeBuildJob = null;
      return;
    }

    if (!activeBuildJob) {
      activeBuildJob = startNextBuildJob();
    }
    const build = activeBuildJob;
    if (!build) return;

    const epoch = furnitureBuildEpoch;
    const sliceStart = performance.now();
    let processed = 0;

    while (build.nextIndex < build.rows.length) {
      if (disposed || furnitureBuildEpoch !== epoch) return;
      await buildUnitFurnitureAsync(build, build.rows[build.nextIndex]!, templates, epoch);
      if (disposed || furnitureBuildEpoch !== epoch) return;
      build.nextIndex += 1;
      processed += 1;
      if (
        processed >= FURNITURE_REBUILD_MIN_UNITS_PER_SLICE &&
        performance.now() - sliceStart >= FURNITURE_REBUILD_FRAME_BUDGET_MS
      ) {
        break;
      }
    }

    if (disposed || furnitureBuildEpoch !== epoch) return;

    if (build.nextIndex >= build.rows.length) {
      finishLevelBuild(build);
      activeBuildJob = null;
    }
  }

  const requestLevelBuild = (level: number) => {
    if (!templates || builtLevels.has(level) || emptyBuiltLevels.has(level)) return;
    if (activeBuildJob?.level === level || queuedLevelSet.has(level)) return;
    queuedLevelSet.add(level);
    queuedLevels.push(level);
    scheduleBuildSlice();
  };

  const resetBuiltFurniture = () => {
    bumpFurnitureBuildEpoch();
    if (buildRaf !== 0) {
      cancelAnimationFrame(buildRaf);
      buildRaf = 0;
    }
    disposeBuildJob(activeBuildJob);
    activeBuildJob = null;
    queuedLevels.length = 0;
    queuedLevelSet.clear();
    clearManaged();
    rowsByLevel = indexRowsByLevel();
    opts.onRebuilt?.();
  };

  const cancelPendingDemandBuild = () => {
    bumpFurnitureBuildEpoch();
    if (buildRaf !== 0) {
      cancelAnimationFrame(buildRaf);
      buildRaf = 0;
    }
    disposeBuildJob(activeBuildJob);
    activeBuildJob = null;
    queuedLevels.length = 0;
    queuedLevelSet.clear();
  };

  const bumpApartmentUnit = () => resetBuiltFurniture();
  const bumpApartmentUnitIfPlacementChanged = (
    _ctx: unknown,
    oldUnit: ApartmentUnit,
    newUnit: ApartmentUnit,
  ) => {
    if (apartmentFurniturePlacementChanged(oldUnit, newUnit)) {
      resetBuiltFurniture();
    }
  };

  opts.conn.db.apartment_unit.onInsert(bumpApartmentUnit);
  opts.conn.db.apartment_unit.onUpdate(bumpApartmentUnitIfPlacementChanged);
  opts.conn.db.apartment_unit.onDelete(bumpApartmentUnit);

  return {
    syncVisibility: (camera, allowDemandBuild = true, containingUnitKey = null) => {
      if (!allowDemandBuild) {
        cancelPendingDemandBuild();
      }
      if (allowDemandBuild) {
        ensureTemplatesLoading();
        visibleLevelScratch.clear();
        for (const ch of opts.buildingRoot.children) {
          if (ch.userData.mammothApartmentFurnitureProp === true) continue;
          const li = ch.userData.mammothPlateLevelIndex;
          if (typeof li === "number" && ch.visible) visibleLevelScratch.add(li);
        }
        for (const level of visibleLevelScratch) requestLevelBuild(level);
      }
      if (unitFurnitureGroups.length === 0) return;
      camera.updateMatrixWorld();
      _furnitureVisibilityViewProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      _furnitureVisibilityFrustum.setFromProjectionMatrix(_furnitureVisibilityViewProjection);
      for (let i = 0; i < unitFurnitureGroups.length; i++) {
        const g = unitFurnitureGroups[i]!;
        if (!allowDemandBuild) {
          g.visible = false;
          continue;
        }
        const isContainingUnit =
          containingUnitKey !== null &&
          g.userData.mammothApartmentUnitKey === containingUnitKey;
        if (containingUnitKey !== null && !isContainingUnit) {
          g.visible = false;
          continue;
        }
        if (isContainingUnit) {
          g.visible = true;
          g.traverse((obj) => {
            if (obj instanceof THREE.Mesh) obj.frustumCulled = false;
          });
          continue;
        }
        const bounds = g.userData.mammothApartmentFurnitureWorldBounds;
        g.visible = bounds instanceof THREE.Box3
          ? _furnitureVisibilityFrustum.intersectsBox(bounds)
          : true;
      }
    },
    getStashPrompt: (playerPos, camera) => {
      if (!opts.conn.identity || stashPickMeshes.length === 0) return null;
      _stashRaycaster.layers.set(FP_INTERACTION_PICK_LAYER);
      _stashRaycaster.setFromCamera(_screenCenterNdc, camera);
      _stashRaycaster.far = FOOTLOCKER_PICK_MAX_RAY_M;
      /**
       * Do not gate gameplay picks on ancestor `.visible`: unit furniture groups can be temporarily
       * render-culled while the player is still inside / beside the stash, which makes the E prompt
       * feel "stuck". Range + unit-hull checks in `clientMayUseApartmentStash` remain authoritative.
       */
      const hits = _stashRaycaster.intersectObjects(stashPickMeshes, false);
      const seen = new Set<string>();
      for (const hit of hits) {
        const stashKey = hit.object.userData.mammothApartmentStashKey;
        const unitKey = hit.object.userData.mammothApartmentStashPickUnitKey;
        const stashKind = hit.object.userData.mammothApartmentStashKind;
        if (typeof stashKey !== "string" || typeof unitKey !== "string" || seen.has(stashKey)) continue;
        if (
          stashKind !== APARTMENT_STASH_KIND_FOOTLOCKER &&
          stashKind !== APARTMENT_STASH_KIND_WARDROBE &&
          stashKind !== APARTMENT_STASH_KIND_STOVE
        ) {
          continue;
        }
        seen.add(stashKey);
        if (clientMayUseApartmentStash(opts.conn, opts.conn.identity, stashKey, playerPos)) {
          return {
            kind: "apartment_stash",
            stashKey,
            unitKey,
            stashKind,
            stashLabel: apartmentStashLabel(stashKind),
          };
        }
      }
      return null;
    },
    getWardrobeClaimLookAtUnitKey: (_playerPos, camera) => {
      if (wardrobePickMeshes.length === 0) return null;
      _stashRaycaster.layers.set(FP_INTERACTION_PICK_LAYER);
      _stashRaycaster.setFromCamera(_screenCenterNdc, camera);
      _stashRaycaster.far = FOOTLOCKER_PICK_MAX_RAY_M;
      const hits = _stashRaycaster.intersectObjects(wardrobePickMeshes, false);
      for (const hit of hits) {
        const unitKey = hit.object.userData.mammothApartmentWardrobePickUnitKey;
        if (typeof unitKey === "string" && unitKey.length > 0) return unitKey;
      }
      return null;
    },
    dispose: () => {
      disposed = true;
      bumpFurnitureBuildEpoch();
      if (buildRaf !== 0) {
        cancelAnimationFrame(buildRaf);
        buildRaf = 0;
      }
      opts.conn.db.apartment_unit.removeOnInsert(bumpApartmentUnit);
      opts.conn.db.apartment_unit.removeOnUpdate(bumpApartmentUnitIfPlacementChanged);
      opts.conn.db.apartment_unit.removeOnDelete(bumpApartmentUnit);
      clearManaged();
      disposeBuildJob(activeBuildJob);
      activeBuildJob = null;
      stashPickGeometry.dispose();
      stashPickMaterial.dispose();
      unitBoundsDebugGeometry?.dispose();
      unitBoundsDebugMaterial?.dispose();
    },
  };
}

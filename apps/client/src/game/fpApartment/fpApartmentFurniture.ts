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

/** Authoring GLBs — tuned against the replicated wall-based furniture anchors. */
const WARDROBE_VIS_SCALE = 0.98;
const FOOTLOCKER_VIS_SCALE = 0.56;
const BED_VIS_SCALE = 1.14;
const FOOTLOCKER_PICK_MAX_RAY_M = 5.5;
const WARDROBE_BOUNDS_INSET_M = 0.48;
const FOOTLOCKER_BOUNDS_INSET_M = 0.42;
const BED_BOUNDS_INSET_M = 0.95;

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
  getStashPrompt: (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ) => ApartmentStashPrompt | null;
};

export async function mountFpApartmentFurniture(opts: {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  /** Runs after every rebuild so FP can refresh `unitInteriorMeshes` visibility targets. */
  onRebuilt?: () => void;
}): Promise<MountFpApartmentFurnitureResult> {
  const loader = new GLTFLoader();
  const [wardrobeGltf, footGltf, bedGltf] = await Promise.all([
    loader.loadAsync(WARDROBE_URL),
    loader.loadAsync(FOOTLOCKER_URL),
    loader.loadAsync(BED_URL),
  ]);

  const wardrobeTemplate = wardrobeGltf.scene;
  const footlockerTemplate = footGltf.scene;
  const bedTemplate = bedGltf.scene;

  const managed: THREE.Object3D[] = [];
  const stashPickMeshes: THREE.Mesh[] = [];
  const stashPickGeometry = new THREE.BoxGeometry(1, 1, 1);
  const stashPickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  stashPickMaterial.colorWrite = false;

  let rebuildScheduled = false;
  const scheduleRebuild = () => {
    if (rebuildScheduled) return;
    rebuildScheduled = true;
    requestAnimationFrame(() => {
      rebuildScheduled = false;
      rebuild();
    });
  };

  const rebuild = () => {
    for (const o of managed) {
      opts.buildingRoot.remove(o);
    }
    managed.length = 0;
    stashPickMeshes.length = 0;

    const byLevel = new Map<number, THREE.Group>();

    const floorGroupFor = (levelIdx: number): THREE.Group => {
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

    for (const row of opts.conn.db.apartment_unit) {
      const u = row as ApartmentUnit;
      if (!(u.unitId.startsWith("unit_e_") || u.unitId.startsWith("unit_w_"))) continue;

      /** Matches server floor slab (`mn[1]` / `foot_y`). */
      const floorY = u.footY;
      const levelIdx = u.level;
      const plate = floorGroupFor(levelIdx);
      const furnitureYaw = u.bedYaw;

      const unitGroup = new THREE.Group();
      unitGroup.name = `apartment_furniture_${u.unitKey}`;
      unitGroup.userData.mammothApartmentFurnitureProp = true;
      unitGroup.userData.mammothPlateLevelIndex = levelIdx;

      const w = clonePropScene(wardrobeTemplate, levelIdx);
      w.scale.setScalar(WARDROBE_VIS_SCALE);
      w.position.set(u.wardrobeX, 0, u.wardrobeZ);
      w.rotation.y = furnitureYaw;
      snapCloneBottomToWorldFloor(w, floorY);
      keepCloneInsideUnitXZ(w, u, WARDROBE_BOUNDS_INSET_M);
      unitGroup.add(w);

      const f = clonePropScene(footlockerTemplate, levelIdx);
      f.scale.setScalar(FOOTLOCKER_VIS_SCALE);
      f.position.set(u.footX, 0, u.footZ);
      f.rotation.y = furnitureYaw;
      snapCloneBottomToWorldFloor(f, floorY);
      keepCloneInsideUnitXZ(f, u, FOOTLOCKER_BOUNDS_INSET_M);
      f.updateMatrixWorld(true);
      const footlockerBounds = new THREE.Box3().setFromObject(f);
      const footlockerPick = new THREE.Mesh(stashPickGeometry, stashPickMaterial);
      const footlockerPickSize = new THREE.Vector3();
      const footlockerPickCenter = new THREE.Vector3();
      footlockerBounds.getSize(footlockerPickSize);
      footlockerBounds.getCenter(footlockerPickCenter);
      footlockerPick.name = `apartment_footlocker_pick:${u.unitKey}`;
      footlockerPick.position.copy(footlockerPickCenter);
      footlockerPick.scale.set(
        Math.max(0.35, footlockerPickSize.x),
        Math.max(0.25, footlockerPickSize.y),
        Math.max(0.35, footlockerPickSize.z),
      );
      footlockerPick.userData.mammothApartmentStashPickUnitKey = u.unitKey;
      footlockerPick.userData.mammothSkipFloorGeometryMerge = true;
      footlockerPick.userData.mammothApartmentFurnitureProp = true;
      footlockerPick.userData.mammothPlateLevelIndex = levelIdx;
      footlockerPick.userData.mammothUnitInterior = true;
      unitGroup.add(f);
      unitGroup.add(footlockerPick);
      stashPickMeshes.push(footlockerPick);

      const b = clonePropScene(bedTemplate, levelIdx);
      b.scale.setScalar(BED_VIS_SCALE);
      b.position.set(u.bedX, 0, u.bedZ);
      b.rotation.y = u.bedYaw;
      snapCloneBottomToWorldFloor(b, u.bedY);
      keepCloneInsideUnitXZ(b, u, BED_BOUNDS_INSET_M);
      unitGroup.add(b);

      unitGroup.updateMatrixWorld(true);
      mergeGroupDescendantsByMaterial(unitGroup);
      for (const m of unitGroup.children) {
        if (m instanceof THREE.Mesh) {
          m.castShadow = false;
          m.receiveShadow = false;
        }
      }

      plate.add(unitGroup);
    }

    for (const g of byLevel.values()) {
      if (g.children.length === 0) continue;
      g.updateMatrixWorld(true);
      opts.buildingRoot.add(g);
      managed.push(g);
    }

    opts.buildingRoot.updateMatrixWorld(true);
    opts.onRebuilt?.();
  };

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

  rebuild();

  return {
    getStashPrompt: (playerPos, camera) => {
      if (!opts.conn.identity || stashPickMeshes.length === 0) return null;
      _visibleStashPickMeshes.length = 0;
      for (const m of stashPickMeshes) {
        if (m.visible) _visibleStashPickMeshes.push(m);
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
      opts.conn.db.apartment_unit.removeOnInsert(bumpApartmentUnit);
      opts.conn.db.apartment_unit.removeOnUpdate(bumpApartmentUnitIfPlacementChanged);
      opts.conn.db.apartment_unit.removeOnDelete(bumpApartmentUnit);
      for (const o of managed) {
        opts.buildingRoot.remove(o);
      }
      managed.length = 0;
      stashPickMeshes.length = 0;
      stashPickGeometry.dispose();
      stashPickMaterial.dispose();
    },
  };
}

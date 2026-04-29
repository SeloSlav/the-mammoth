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
import { yawTowardRoomCenterXZ, type ApartmentInteriorBounds } from "@the-mammoth/game";
import type { DbConnection } from "../../module_bindings";
import type { ApartmentUnit } from "../../module_bindings/types";
import { mergeGroupDescendantsByMaterial } from "../fpSession/fpMergeGroupDescendantsByMaterial.js";

const WARDROBE_URL = "/static/models/objects/wardrobe-closet.glb";
const FOOTLOCKER_URL = "/static/models/objects/footlocker.glb";
const BED_URL = "/static/models/objects/bed.glb";

/** Authoring GLBs — wardrobe/bed read larger than gameplay anchors; footlocker slightly reduced. */
const WARDROBE_VIS_SCALE = 0.98;
const FOOTLOCKER_VIS_SCALE = 0.72;
const BED_VIS_SCALE = 0.98;

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

export function apartmentFurniturePlacementChanged(
  oldUnit: ApartmentUnit,
  newUnit: ApartmentUnit,
): boolean {
  for (const field of FURNITURE_PLACEMENT_FIELDS) {
    if (oldUnit[field] !== newUnit[field]) return true;
  }
  return false;
}

function boundsFromUnit(u: ApartmentUnit): ApartmentInteriorBounds {
  return {
    boundMinX: u.boundMinX,
    boundMaxX: u.boundMaxX,
    boundMinZ: u.boundMinZ,
    boundMaxZ: u.boundMaxZ,
  };
}

/** After world rotation + xz placement (y left arbitrary), raise/lowers root so mesh bottoms sit on `floorWorldY`. */
function snapCloneBottomToWorldFloor(root: THREE.Object3D, floorWorldY: number): void {
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = floorWorldY - box.min.y;
  root.updateMatrixWorld(true);
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

      const bounds = boundsFromUnit(u);
      /** Matches server floor slab (`mn[1]` / `foot_y`). */
      const floorY = u.footY;
      const levelIdx = u.level;
      const plate = floorGroupFor(levelIdx);

      const yawW = yawTowardRoomCenterXZ(u.wardrobeX, u.wardrobeZ, bounds);
      const yawF = yawTowardRoomCenterXZ(u.footX, u.footZ, bounds);

      const unitGroup = new THREE.Group();
      unitGroup.name = `apartment_furniture_${u.unitKey}`;
      unitGroup.userData.mammothApartmentFurnitureProp = true;
      unitGroup.userData.mammothPlateLevelIndex = levelIdx;

      const w = clonePropScene(wardrobeTemplate, levelIdx);
      w.scale.setScalar(WARDROBE_VIS_SCALE);
      w.position.set(u.wardrobeX, 0, u.wardrobeZ);
      w.rotation.y = yawW;
      snapCloneBottomToWorldFloor(w, floorY);
      unitGroup.add(w);

      const f = clonePropScene(footlockerTemplate, levelIdx);
      f.scale.setScalar(FOOTLOCKER_VIS_SCALE);
      f.position.set(u.footX, 0, u.footZ);
      f.rotation.y = yawF;
      snapCloneBottomToWorldFloor(f, floorY);
      unitGroup.add(f);

      const b = clonePropScene(bedTemplate, levelIdx);
      b.scale.setScalar(BED_VIS_SCALE);
      b.position.set(u.bedX, 0, u.bedZ);
      b.rotation.y = u.bedYaw;
      snapCloneBottomToWorldFloor(b, u.bedY);
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
    dispose: () => {
      opts.conn.db.apartment_unit.removeOnInsert(bumpApartmentUnit);
      opts.conn.db.apartment_unit.removeOnUpdate(bumpApartmentUnitIfPlacementChanged);
      opts.conn.db.apartment_unit.removeOnDelete(bumpApartmentUnit);
      for (const o of managed) {
        opts.buildingRoot.remove(o);
      }
      managed.length = 0;
    },
  };
}

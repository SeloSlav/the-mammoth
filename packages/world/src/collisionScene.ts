import * as THREE from "three";
import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  instantiateBuildingFloorStack,
} from "./buildingFloorStack.js";
import type { GetFloorOverrideDoc } from "./resolvedFloorDoc.js";

export type CollisionAabb = {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
};

export type CollisionScene = {
  solids: readonly CollisionAabb[];
  walkables: readonly CollisionAabb[];
};

function box3ToCollisionAabb(b: THREE.Box3): CollisionAabb {
  return {
    min: [b.min.x, b.min.y, b.min.z],
    max: [b.max.x, b.max.y, b.max.z],
  };
}

export function collisionAabbXZFootprint(
  aabbs: readonly CollisionAabb[],
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (aabbs.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of aabbs) {
    minX = Math.min(minX, b.min[0]);
    maxX = Math.max(maxX, b.max[0]);
    minZ = Math.min(minZ, b.min[2]);
    maxZ = Math.max(maxZ, b.max[2]);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minZ, maxZ };
}

/**
 * Collects axis-aligned world-space collision AABBs from visible box meshes in a scene graph.
 *
 * This intentionally treats the authored placeholder/build meshes as the collision source for
 * static world geometry, so rendering and blocking come from the same world-building rules.
 */
export function collectCollisionAabbsFromObject3D(
  root: THREE.Object3D,
  opts?: {
    ignoreInvisible?: boolean;
    minVolume?: number;
  },
): CollisionAabb[] {
  const ignoreInvisible = opts?.ignoreInvisible ?? true;
  const minVolume = opts?.minVolume ?? 1e-6;
  const out: CollisionAabb[] = [];
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    // Invisible `mammothCollisionHull` boxes are baked for FP static collision only; they are
    // stripped before client mesh merging (see `fpSessionWorldMount.mergeGroupDescendantsByMaterial`).
    if (ignoreInvisible && !obj.visible && obj.userData.mammothCollisionHull !== true) return;
    if (obj.userData.mammothNoCollision === true) return;
    if (!(obj.geometry instanceof THREE.BoxGeometry)) return;
    if (obj.geometry.boundingBox == null) {
      obj.geometry.computeBoundingBox();
    }
    const bb = obj.geometry.boundingBox;
    if (bb == null) return;
    box.copy(bb).applyMatrix4(obj.matrixWorld);
    const sx = box.max.x - box.min.x;
    const sy = box.max.y - box.min.y;
    const sz = box.max.z - box.min.z;
    if (sx * sy * sz < minVolume) return;
    out.push(box3ToCollisionAabb(box));
  });
  return out;
}

export function createCollisionSceneFromStaticSolids(
  solids: readonly CollisionAabb[],
): CollisionScene {
  return {
    solids: [...solids],
    walkables: [...solids],
  };
}

export function buildStaticCollisionSceneForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  options?: {
    floorSpacingM?: number;
    ignoreInvisible?: boolean;
    getFloorOverrideDoc?: GetFloorOverrideDoc;
    stairWellDef?: StairWellDef;
  },
): CollisionScene {
  const floorSpacingM = options?.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const root = instantiateBuildingFloorStack(building, getFloorDoc, {
    floorSpacingM,
    getFloorOverrideDoc: options?.getFloorOverrideDoc,
    stairWellDef: options?.stairWellDef,
  });
  const solids = collectCollisionAabbsFromObject3D(root, {
    ignoreInvisible: options?.ignoreInvisible,
  });
  return createCollisionSceneFromStaticSolids(solids);
}

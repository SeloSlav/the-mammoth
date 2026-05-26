import * as THREE from "three";
import { fpLocomotionConstants } from "@the-mammoth/engine";
import {
  combatSimArenaBoundsFromUnitFootprint,
  combatSimArenaCollisionAabbs,
  combatSimArenaObstacleAabbs,
  COMBAT_SIM_FALLBACK_HALF_EXTENT_M,
  COMBAT_SIM_WALL_HEIGHT_M,
  type CombatSimArenaBounds,
} from "@the-mammoth/game";
import {
  buildCollisionSpatialIndex,
  buildWalkSurfaceSpatialIndex,
  floorPlaceholderMeshMaterials,
  parseBuildingDoc,
  type CollisionAabb,
} from "@the-mammoth/world";
import buildingDoc from "../../../../../content/building/mammoth.json";
import type { DbConnection } from "../../module_bindings";
import type { FpSessionStaticWorld } from "../fpSession/fpSessionWorldMount.js";
import { findOwnedApartmentUnitForIdentity } from "./combatSimEnter.js";

/** Matches shell interior concrete tiling (~2.75 m per UV unit at repeat 0.3). */
const COMBAT_SIM_CONCRETE_TILE_SPAN_M = 2.75 / 0.3;

function cloneTiledConcreteFloorMaterial(
  widthM: number,
  depthM: number,
): THREE.MeshStandardMaterial {
  const base = floorPlaceholderMeshMaterials.corridorFloor;
  const mat = base.clone();
  const repeatX = widthM / COMBAT_SIM_CONCRETE_TILE_SPAN_M;
  const repeatZ = depthM / COMBAT_SIM_CONCRETE_TILE_SPAN_M;
  for (const key of ["map", "normalMap", "roughnessMap"] as const) {
    const src = base[key];
    if (!src) continue;
    const cloned = src.clone();
    cloned.wrapS = THREE.RepeatWrapping;
    cloned.wrapT = THREE.RepeatWrapping;
    cloned.repeat.set(repeatX, repeatZ);
    cloned.needsUpdate = true;
    mat[key] = cloned;
  }
  return mat;
}

function mountCombatSimObstacleMeshes(
  root: THREE.Group,
  bounds: CombatSimArenaBounds,
): void {
  const obstacleMat = new THREE.MeshStandardMaterial({
    color: 0x8a8f96,
    roughness: 0.92,
    metalness: 0.02,
  });
  const obstacles = combatSimArenaObstacleAabbs(bounds);
  for (let i = 0; i < obstacles.length; i++) {
    const aabb = obstacles[i]!;
    const sx = aabb.max[0] - aabb.min[0];
    const sy = aabb.max[1] - aabb.min[1];
    const sz = aabb.max[2] - aabb.min[2];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), obstacleMat);
    mesh.name = `combat_sim_obstacle:${i}`;
    mesh.position.set(
      (aabb.min[0] + aabb.max[0]) * 0.5,
      (aabb.min[1] + aabb.max[1]) * 0.5,
      (aabb.min[2] + aabb.max[2]) * 0.5,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

/**
 * Arena-only `FpSessionStaticWorld` for `combatSimMode`.
 *
 * Implements the same `FpSessionStaticWorld` interface as the megablock mount so `mountFpSession`
 * needs no fork — only a different static world source (concrete pad + perimeter walls vs full building).
 *
 * @see mountCombatSimSession.ts
 */
export function createCombatSimStaticWorld(conn: DbConnection): FpSessionStaticWorld {
  const unit = findOwnedApartmentUnitForIdentity(conn);
  const footY = unit?.footY ?? 0;

  const bounds = combatSimArenaBoundsFromUnitFootprint({
    boundMinX: unit?.boundMinX ?? -COMBAT_SIM_FALLBACK_HALF_EXTENT_M,
    boundMaxX: unit?.boundMaxX ?? COMBAT_SIM_FALLBACK_HALF_EXTENT_M,
    boundMinZ: unit?.boundMinZ ?? -COMBAT_SIM_FALLBACK_HALF_EXTENT_M,
    boundMaxZ: unit?.boundMaxZ ?? COMBAT_SIM_FALLBACK_HALF_EXTENT_M,
    footY,
  });

  const { minX, maxX, minZ, maxZ } = bounds;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const wallY1 = footY + COMBAT_SIM_WALL_HEIGHT_M;

  const building = parseBuildingDoc(buildingDoc);
  const buildingRoot = new THREE.Group();
  buildingRoot.name = "combat_sim_arena_root";

  const planeSegW = Math.min(32, Math.max(4, Math.ceil(width / 4)));
  const planeSegD = Math.min(32, Math.max(4, Math.ceil(depth / 4)));
  const planeGeo = new THREE.PlaneGeometry(width, depth, planeSegW, planeSegD);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = cloneTiledConcreteFloorMaterial(width, depth);
  planeMat.color.setHex(0xffffff);
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.name = "combat_sim_ground_plane";
  plane.position.set(cx, footY, cz);
  plane.receiveShadow = true;
  plane.castShadow = false;
  buildingRoot.add(plane);

  mountCombatSimObstacleMeshes(buildingRoot, bounds);

  const arenaFill = new THREE.HemisphereLight(0xd8e4f4, 0x4a5058, 0.62);
  arenaFill.name = "combat_sim_arena_fill";
  arenaFill.position.set(cx, footY + 6, cz);
  buildingRoot.add(arenaFill);

  const arenaSun = new THREE.DirectionalLight(0xfff5eb, 0.38);
  arenaSun.name = "combat_sim_arena_sun";
  arenaSun.position.set(cx + 18, footY + 22, cz + 12);
  arenaSun.target.position.set(cx, footY, cz);
  buildingRoot.add(arenaSun);
  buildingRoot.add(arenaSun.target);

  const cellRoot = new THREE.Group();
  cellRoot.name = "combat_sim_cell_root";

  const staticCollisionSolids: CollisionAabb[] = combatSimArenaCollisionAabbs(bounds).map((aabb) => ({
    min: aabb.min,
    max: aabb.max,
  }));
  const staticCollisionIndex = buildCollisionSpatialIndex(staticCollisionSolids);

  const walkFootprint = { minX, maxX, minZ, maxZ };
  const floorWalk = staticCollisionSolids[0]!;
  const walkSpatialIndex = buildWalkSurfaceSpatialIndex([floorWalk]);
  const sampleWalkTopBase = (worldX: number, worldZ: number, probeTopY: number) =>
    walkSpatialIndex.sampleTopYWithExteriorGround(
      worldX,
      worldZ,
      probeTopY,
      walkFootprint,
      {
        footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,
        stepUpMargin: fpLocomotionConstants.walkStepUpMargin,
      },
    );

  const buildingBodyWorldBounds = new THREE.Box3(
    new THREE.Vector3(minX, footY, minZ),
    new THREE.Vector3(maxX, wallY1, maxZ),
  );

  return {
    building,
    buildingRoot,
    buildingBodyWorldBounds,
    cellRoot,
    staticCollisionSolids,
    staticCollisionIndex,
    sampleWalkTopBase,
    stairShaftInteriorLightBounds: [],
    stairShaftSpecs: [],
  };
}

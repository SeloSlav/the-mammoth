import * as THREE from "three";

import { fpLocomotionConstants } from "@the-mammoth/engine";

import {

  combatSimArenaCollisionAabbs,

  combatSimArenaDeckSlabAabbs,

  combatSimArenaLowWallAabbs,

  combatSimArenaObstacleAabbs,

  combatSimArenaPerimeterWallAabbs,

  combatSimArenaRampCollisionAabbs,

  combatSimArenaStepCollisionAabbs,

  combatSimArenaWalkSurfaceAabbs,

  combatSimSessionArenaBounds,

  COMBAT_SIM_WALL_HEIGHT_M,

  type CollisionAabbLike,

  type CombatSimArenaBounds,

} from "@the-mammoth/game";

import {

  buildCollisionSpatialIndex,

  buildWalkSurfaceSpatialIndex,

  floorPlaceholderMeshMaterials,

  parseBuildingDoc,

  type CollisionAabb,

  type SampleWalkGroundOpts,

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



function mountCombatSimAabbMeshes(

  root: THREE.Group,

  aabbs: readonly CollisionAabbLike[],

  material: THREE.MeshStandardMaterial,

  namePrefix: string,

): void {

  for (let i = 0; i < aabbs.length; i++) {

    const aabb = aabbs[i]!;

    const sx = aabb.max[0] - aabb.min[0];

    const sy = aabb.max[1] - aabb.min[1];

    const sz = aabb.max[2] - aabb.min[2];

    if (sx < 1e-4 || sy < 1e-4 || sz < 1e-4) continue;

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);

    mesh.name = `${namePrefix}:${i}`;

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



function mountCombatSimArenaGeometry(

  root: THREE.Group,

  bounds: CombatSimArenaBounds,

): void {

  const obstacleMat = new THREE.MeshStandardMaterial({

    color: 0x7a8088,

    roughness: 0.92,

    metalness: 0.03,

  });

  const stairMat = new THREE.MeshStandardMaterial({

    color: 0xa39e98,

    roughness: 0.88,

    metalness: 0.02,

  });

  const rampMat = new THREE.MeshStandardMaterial({

    color: 0x959088,

    roughness: 0.9,

    metalness: 0.015,

  });

  const deckMat = new THREE.MeshStandardMaterial({

    color: 0x6a7580,

    roughness: 0.78,

    metalness: 0.12,

  });

  const lowWallMat = new THREE.MeshStandardMaterial({

    color: 0x848a92,

    roughness: 0.94,

    metalness: 0.02,

  });

  const perimeterMat = new THREE.MeshStandardMaterial({

    color: 0x5c6168,

    roughness: 0.96,

    metalness: 0.01,

  });



  mountCombatSimAabbMeshes(root, combatSimArenaObstacleAabbs(bounds), obstacleMat, "combat_sim_obstacle");

  mountCombatSimAabbMeshes(root, combatSimArenaStepCollisionAabbs(bounds), stairMat, "combat_sim_stair");

  mountCombatSimAabbMeshes(root, combatSimArenaRampCollisionAabbs(bounds), rampMat, "combat_sim_ramp");

  mountCombatSimAabbMeshes(root, combatSimArenaDeckSlabAabbs(bounds), deckMat, "combat_sim_deck");

  mountCombatSimAabbMeshes(root, combatSimArenaLowWallAabbs(bounds), lowWallMat, "combat_sim_low_wall");

  mountCombatSimAabbMeshes(root, combatSimArenaPerimeterWallAabbs(bounds), perimeterMat, "combat_sim_wall");

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



  const bounds = combatSimSessionArenaBounds({

    boundMinX: unit?.boundMinX ?? 0,

    boundMaxX: unit?.boundMaxX ?? 0,

    boundMinZ: unit?.boundMinZ ?? 0,

    boundMaxZ: unit?.boundMaxZ ?? 0,

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



  const planeSegW = Math.min(48, Math.max(8, Math.ceil(width / 4)));

  const planeSegD = Math.min(48, Math.max(8, Math.ceil(depth / 4)));

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



  mountCombatSimArenaGeometry(buildingRoot, bounds);



  const arenaFill = new THREE.HemisphereLight(0xd8e4f4, 0x4a5058, 0.62);

  arenaFill.name = "combat_sim_arena_fill";

  arenaFill.position.set(cx, footY + 6, cz);

  buildingRoot.add(arenaFill);



  const arenaSun = new THREE.DirectionalLight(0xfff5eb, 0.42);

  arenaSun.name = "combat_sim_arena_sun";

  arenaSun.position.set(cx + width * 0.25, footY + 28, cz + depth * 0.18);

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

  const walkSurfaces = combatSimArenaWalkSurfaceAabbs(bounds).map((aabb) => ({

    min: aabb.min,

    max: aabb.max,

  }));

  const walkSpatialIndex = buildWalkSurfaceSpatialIndex(walkSurfaces);

  const sampleWalkTopBase = (

    worldX: number,

    worldZ: number,

    probeTopY: number,

    sampleOpts?: SampleWalkGroundOpts,

  ) =>

    walkSpatialIndex.sampleTopYWithExteriorGround(

      worldX,

      worldZ,

      probeTopY,

      walkFootprint,

      {

        footRadiusXZ: fpLocomotionConstants.walkFootRadiusXZ,

        stepUpMargin: fpLocomotionConstants.walkStepUpMargin,

        maxSupportDropBelowFeetM: fpLocomotionConstants.walkMaxSupportDropM,

        ...sampleOpts,

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

    walkSupportAABBs: walkSurfaces,

    walkFootprint,

    stairWalkSupportSurfaces: [],

    stairShaftInteriorLightBounds: [],

    stairShaftSpecs: [],

  };

}



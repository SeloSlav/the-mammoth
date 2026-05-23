import * as THREE from "three";
import { fpLocomotionConstants } from "@the-mammoth/engine";
import {
  buildCollisionSpatialIndex,
  buildWalkSurfaceSpatialIndex,
  parseBuildingDoc,
  type CollisionAabb,
} from "@the-mammoth/world";
import buildingDoc from "../../../../../content/building/mammoth.json";
import type { DbConnection } from "../../module_bindings";
import type { FpSessionStaticWorld } from "../fpSession/fpSessionWorldMount.js";
import { findOwnedApartmentUnitForIdentity } from "./combatSimEnter.js";

const COMBAT_SIM_ARENA_PAD_M = 6;
const COMBAT_SIM_FALLBACK_HALF_EXTENT_M = 14;
const COMBAT_SIM_WALL_HEIGHT_M = 4;
const COMBAT_SIM_WALL_THICKNESS_M = 0.35;

/**
 * Minimal FP static world for combat sim: flat arena plane at the claimed unit's foot Y,
 * invisible boundary walls, no megablock building mesh.
 */
export function createCombatSimStaticWorld(conn: DbConnection): FpSessionStaticWorld {
  const unit = findOwnedApartmentUnitForIdentity(conn);
  const footY = unit?.footY ?? 0;

  const minX =
    (unit?.boundMinX ?? -COMBAT_SIM_FALLBACK_HALF_EXTENT_M) - COMBAT_SIM_ARENA_PAD_M;
  const maxX =
    (unit?.boundMaxX ?? COMBAT_SIM_FALLBACK_HALF_EXTENT_M) + COMBAT_SIM_ARENA_PAD_M;
  const minZ =
    (unit?.boundMinZ ?? -COMBAT_SIM_FALLBACK_HALF_EXTENT_M) - COMBAT_SIM_ARENA_PAD_M;
  const maxZ =
    (unit?.boundMaxZ ?? COMBAT_SIM_FALLBACK_HALF_EXTENT_M) + COMBAT_SIM_ARENA_PAD_M;

  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const width = maxX - minX;
  const depth = maxZ - minZ;

  const building = parseBuildingDoc(buildingDoc);
  const buildingRoot = new THREE.Group();
  buildingRoot.name = "combat_sim_arena_root";

  const planeGeo = new THREE.PlaneGeometry(width, depth);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshStandardMaterial({
    color: 0x8a8f94,
    roughness: 0.92,
    metalness: 0.02,
  });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.name = "combat_sim_ground_plane";
  plane.position.set(cx, footY, cz);
  plane.receiveShadow = true;
  plane.castShadow = false;
  buildingRoot.add(plane);

  const cellRoot = new THREE.Group();
  cellRoot.name = "combat_sim_cell_root";

  const floorWalk: CollisionAabb = {
    min: [minX, footY - 0.12, minZ],
    max: [maxX, footY, maxZ],
  };
  const wallY1 = footY + COMBAT_SIM_WALL_HEIGHT_M;
  const t = COMBAT_SIM_WALL_THICKNESS_M;
  const walls: CollisionAabb[] = [
    { min: [minX, footY, minZ], max: [minX + t, wallY1, maxZ] },
    { min: [maxX - t, footY, minZ], max: [maxX, wallY1, maxZ] },
    { min: [minX, footY, minZ], max: [maxX, wallY1, minZ + t] },
    { min: [minX, footY, maxZ - t], max: [maxX, wallY1, maxZ] },
  ];
  const staticCollisionSolids = [floorWalk, ...walls];
  const staticCollisionIndex = buildCollisionSpatialIndex(staticCollisionSolids);

  const walkFootprint = { minX, maxX, minZ, maxZ };
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

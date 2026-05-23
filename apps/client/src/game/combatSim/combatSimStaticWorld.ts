import * as THREE from "three";
import { fpLocomotionConstants } from "@the-mammoth/engine";
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

const COMBAT_SIM_ARENA_PAD_M = 6;
const COMBAT_SIM_FALLBACK_HALF_EXTENT_M = 14;
const COMBAT_SIM_WALL_HEIGHT_M = 4;
const COMBAT_SIM_WALL_THICKNESS_M = 0.35;
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

/**
 * Arena-only `FpSessionStaticWorld` for `combatSimMode` — same interface as the megablock mount,
 * without loading building geometry. Gameplay still runs through `mountFpSession`.
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

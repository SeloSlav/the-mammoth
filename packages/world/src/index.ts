import * as THREE from "three";
import {
  BuildingDocSchema,
  CellDocSchema,
  ElevatorCabDefSchema,
  FloorDocSchema,
  FloorOverrideDocSchema,
  InteriorDocSchema,
  LandingKitDefSchema,
  PrefabDefSchema,
  StairWellDefSchema,
  type BuildingDoc,
  type CellDoc,
  type CellPlacement,
  type DecalInstance,
  type ElevatorCabDef,
  type FloorDoc,
  type FloorOverrideDoc,
  type InteriorDoc,
  type LandingKitDef,
  type PrefabDef,
  type StairWellDef,
} from "@the-mammoth/schemas";
import { buildFloorMeshes } from "./floorPlaceholderMeshes.js";
import {
  elevatorDoorFacesFromGroundFloorDoc,
  readElevatorDoorFaceOverride,
  type BuildFloorMeshesOptions,
} from "./elevatorDoorFacesFromGroundFloorDoc.js";

export { buildFloorMeshes, elevatorDoorFacesFromGroundFloorDoc, readElevatorDoorFaceOverride };
export type { BuildFloorMeshesOptions };
export {
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  instantiateBuildingFloorStack,
  type InstantiateBuildingFloorStackOptions,
} from "./buildingFloorStack.js";
export {
  buildStaticCollisionSceneForBuilding,
  collectCollisionAabbsFromObject3D,
  collisionAabbXZFootprint,
  createCollisionSceneFromStaticSolids,
  type CollisionAabb,
  type CollisionScene,
} from "./collisionScene.js";
export {
  addBuildingStairShaftColumnsToRoot,
  getBuildingStairShaftSpecs,
  shaftPlanKey,
  TYPICAL_FLOOR_DOC_ID,
  type BuildingStairShaftSpec,
} from "./buildingStairShafts.js";
export {
  sampleWalkGroundTopY,
  sampleWalkGroundTopYWithExteriorGround,
  walkSurfaceAabbXZFootprint,
  walkSurfaceAABBsForBuilding,
  walkSurfaceAABBsForFloorDoc,
  WALK_FALLBACK_FLOOR_TOP_Y,
  type ExteriorWalkGroundOpts,
  type SampleWalkGroundOpts,
  type WalkSurfaceAabb,
  type WalkSurfaceXzFootprint,
} from "./walkSurfaceAABBs.js";
export {
  buildWalkSurfaceSpatialIndex,
  type WalkSurfaceSpatialIndex,
} from "./walkSurfaceSpatialIndex.js";
export {
  buildCollisionSpatialIndex,
  type CollisionSpatialIndex,
} from "./collisionSpatialIndex.js";
export { estimateStoreyFromFeetY } from "./buildingStory.js";
export { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
export {
  collectElevatorSlabHoles,
  mergeElevatorShaftSlabHolesFromFloorDocs,
  mergeShaftSlabHolesFromFloorDocs,
  punchElevatorHolesInShellRects,
} from "./shaftPlanformClip.js";
export { FP_OUTDOOR_GROUND_VISUAL_Y } from "./fpOutdoorGroundVisualY.js";
export {
  applyFloorOverrideDoc,
  defaultFloorOverrideDocId,
  resolveFloorDocForLevel,
  resolveFloorOverrideDocId,
  type GetFloorOverrideDoc,
} from "./resolvedFloorDoc.js";
export {
  elevatorCabGameplayHalfExtentsM,
  elevatorHoistwayInnerHalfExtents,
  elevatorSupportFeetWorldY,
  FP_LOCOMOTION_SKIN,
  listElevatorShaftLayouts,
  maxBuildingLevelIndex,
  type ElevatorShaftLayout,
} from "./elevatorShaftLayout.js";
export {
  ELEVATOR_LANDING_CALL_CENTER_Y_OFFSET_M,
  resolveLandingHailLevel,
} from "./elevatorLandingHailLevel.js";
export {
  CLOSED_CAB_OUTSIDE_SLAB_IN,
  CLOSED_CAB_OUTSIDE_SLAB_OUT,
  CLOSED_CAB_OUTSIDE_WIDTH_PAD,
  EXTERIOR_COLLISION_L0,
  EXTERIOR_COLLISION_L1,
  EXTERIOR_COLLISION_LZ_PAD,
  EXTERIOR_DOOR_ANIM_SPEED,
  EXTERIOR_DOOR_COLLISION_OPEN_THRESH,
  EXTERIOR_DOOR_H_M,
  EXTERIOR_DOOR_SOLID_SLAB_MAX_SWING,
  EXTERIOR_DOOR_SWING_MAX_RAD,
  EXTERIOR_DOOR_HINGE_OUTSET,
  EXTERIOR_DOOR_PANEL_HALF_THICK,
  EXTERIOR_DOOR_W_M,
  EXTERIOR_INTERACT_L0,
  EXTERIOR_INTERACT_L1,
  EXTERIOR_INTERACT_LZ_PAD,
  EXTERIOR_INTERACT_WORLD_RADIUS_M,
  EXTERIOR_INTERACT_WORLD_Y_HALF_M,
  EXTERIOR_STRIP_Y0,
  EXTERIOR_STRIP_Y1,
  LANDING_FRONT_PASSAGE_HALF_W_M,
  LANDING_FRONT_WALL_PUSH_OUT,
  LANDING_FRONT_WALL_SLAB_IN,
  LANDING_FRONT_WALL_SLAB_OUT,
  LANDING_PASSAGE_DOCK_Y_TOL_M,
} from "./elevatorCollisionTuning.js";
export {
  addOppositeCorridorKatSignMeshes,
  landingKatSignTextForStory,
  oppositeCardinalFace,
} from "./elevatorLandingKatSign.js";
export {
  applyCabMaterialSlot,
  applyLandingFrameSlot,
  applyLandingGlassSlot,
  parseAuthorColorHex,
} from "./elevatorVisualMaterialUtils.js";
export {
  applyElevatorCabPartTransforms,
  buildElevatorCabCarPreviewRoot,
} from "./elevatorCabPreview.js";
export {
  glassOpeningFromProxyMesh,
  LANDING_DOOR_GLASS_PART_ID,
  LANDING_DOOR_OPENING_PROXY_ID,
  populateExteriorLandingDoorSwing,
  resolveGlassOpening,
} from "./exteriorLandingDoorSwing.js";
export {
  applyLandingKitPartTransforms,
  buildLandingDoorPreviewRoot,
  rebuildLandingDoorPreviewSwing,
} from "./landingDoorPreview.js";
export {
  applyStairWellPartTransforms,
  buildStairWellPreviewRoot,
  STAIR_WELL_EDITOR_PART_IDS,
  type BuildStairWellPreviewRootArgs,
  type StairWellAuthoringScope,
  type StairWellEditorPartId,
} from "./stairElevatorPlaceholders.js";

export function parseFloorDoc(raw: unknown): FloorDoc {
  return FloorDocSchema.parse(raw);
}

export function parseCellDoc(raw: unknown): CellDoc {
  return CellDocSchema.parse(raw);
}

export function parseFloorOverrideDoc(raw: unknown): FloorOverrideDoc {
  return FloorOverrideDocSchema.parse(raw);
}

export function parseInteriorDoc(raw: unknown): InteriorDoc {
  return InteriorDocSchema.parse(raw);
}

export function parseBuildingDoc(raw: unknown): BuildingDoc {
  return BuildingDocSchema.parse(raw);
}

export function parsePrefabDef(raw: unknown): PrefabDef {
  return PrefabDefSchema.parse(raw);
}

export function parseElevatorCabDef(raw: unknown): ElevatorCabDef {
  return ElevatorCabDefSchema.parse(raw);
}

export function parseLandingKitDef(raw: unknown): LandingKitDef {
  return LandingKitDefSchema.parse(raw);
}

export function parseStairWellDef(raw: unknown): StairWellDef {
  return StairWellDefSchema.parse(raw);
}

function addPlacementMeshes(
  root: THREE.Group,
  placements: readonly CellPlacement[],
  material: THREE.MeshStandardMaterial,
  streamDocId?: string,
): void {
  for (const p of placements) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = p.entityId;
    mesh.userData.placedObjectId = p.entityId;
    if (streamDocId) mesh.userData.streamDocId = streamDocId;
    mesh.position.set(p.position[0], p.position[1], p.position[2]);
    if (p.rotation)
      mesh.quaternion.set(
        p.rotation[0],
        p.rotation[1],
        p.rotation[2],
        p.rotation[3],
      );
    if (p.scale) mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
    root.add(mesh);
  }
}

function addDecalMeshes(
  root: THREE.Group,
  decals: readonly DecalInstance[],
  decalMat: THREE.MeshStandardMaterial,
): void {
  for (const decal of decals) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMat);
    plane.name = `decal:${decal.id}`;
    plane.position.set(decal.position[0], decal.position[1], decal.position[2]);
    plane.rotation.x = -Math.PI / 2;
    if (decal.rotation) plane.rotation.z = decal.rotation[1] ?? 0;
    if (decal.scale)
      plane.scale.set(decal.scale[0], decal.scale[2], decal.scale[1]);
    root.add(plane);
  }
}

/** Placeholder geometry for one exterior cell (placements + markers for portals/decals). */
export function buildCellMeshes(doc: CellDoc): THREE.Group {
  const root = new THREE.Group();
  root.name = `cell:${doc.id}`;
  const propMat = new THREE.MeshStandardMaterial({
    color: 0xedf1f6,
    roughness: 0.88,
    metalness: 0.02,
  });
  const portalMat = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    emissive: 0x332200,
  });
  const decalMat = new THREE.MeshStandardMaterial({
    color: 0x3d3d44,
    transparent: true,
    opacity: 0.85,
  });

  addPlacementMeshes(root, doc.placements, propMat, doc.id);

  for (const portal of doc.portals) {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 2, 0.15),
      portalMat,
    );
    marker.name = `portal:${portal.id}`;
    marker.position.set(
      portal.position[0],
      portal.position[1] + 1,
      portal.position[2],
    );
    root.add(marker);
  }

  addDecalMeshes(root, doc.decals, decalMat);

  return root;
}

/** Placeholder geometry for one interior document (same placement shape as cells). */
export function buildInteriorMeshes(doc: InteriorDoc): THREE.Group {
  const root = new THREE.Group();
  root.name = `interior:${doc.id}`;
  const propMat = new THREE.MeshStandardMaterial({ color: 0x8e7a9a });
  const exitMat = new THREE.MeshStandardMaterial({
    color: 0x4a9f6c,
    emissive: 0x0a1a0a,
  });
  const decalMat = new THREE.MeshStandardMaterial({
    color: 0x3d3d44,
    transparent: true,
    opacity: 0.85,
  });

  addPlacementMeshes(root, doc.placements, propMat, doc.id);

  for (const portal of doc.portals) {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 2, 0.2),
      exitMat,
    );
    marker.name = `exit:${portal.id}`;
    marker.position.set(
      portal.position[0],
      portal.position[1] + 1,
      portal.position[2],
    );
    root.add(marker);
  }

  addDecalMeshes(root, doc.decals, decalMat);

  return root;
}

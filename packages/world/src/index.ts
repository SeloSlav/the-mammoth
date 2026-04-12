import * as THREE from "three";
import {
  BuildingDocSchema,
  CellDocSchema,
  FloorDocSchema,
  InteriorDocSchema,
  type BuildingDoc,
  type CellDoc,
  type CellPlacement,
  type DecalInstance,
  type FloorDoc,
  type InteriorDoc,
} from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import {
  buildFloorMeshes,
  elevatorDoorFacesFromGroundFloorDoc,
} from "./floorPlaceholderMeshes.js";
import {
  addBuildingStairShaftColumnsToRoot,
  getBuildingStairShaftSpecs,
} from "./buildingStairShafts.js";
import {
  mergeElevatorShaftSlabHolesFromFloorDocs,
  mergeShaftSlabHolesFromFloorDocs,
} from "./shaftPlanformClip.js";

export { buildFloorMeshes, elevatorDoorFacesFromGroundFloorDoc };
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
export { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
export {
  collectElevatorSlabHoles,
  mergeElevatorShaftSlabHolesFromFloorDocs,
  mergeShaftSlabHolesFromFloorDocs,
  punchElevatorHolesInShellRects,
} from "./shaftPlanformClip.js";
export { FP_OUTDOOR_GROUND_VISUAL_Y } from "./fpOutdoorGroundVisualY.js";

/**
 * Vertical spacing between stacked `BuildingFloorRef` plates (meters).
 * Mamutica (~60 m / 19 inhabited stories) ≈ 3.16 m per story (hr.wikipedia).
 */
export const DEFAULT_BUILDING_FLOOR_SPACING_M = 60 / 19;

export type InstantiateBuildingFloorStackOptions = {
  floorSpacingM?: number;
};

export function parseFloorDoc(raw: unknown): FloorDoc {
  return FloorDocSchema.parse(raw);
}

export function parseCellDoc(raw: unknown): CellDoc {
  return CellDocSchema.parse(raw);
}

export function parseInteriorDoc(raw: unknown): InteriorDoc {
  return InteriorDocSchema.parse(raw);
}

export function parseBuildingDoc(raw: unknown): BuildingDoc {
  return BuildingDocSchema.parse(raw);
}

/**
 * Stacks authored floor plates from a `BuildingDoc` into one group (placeholder boxes).
 * `getFloorDoc` must return the `FloorDoc` for each referenced `floorDocId`.
 * Vertical position uses 1-based `BuildingFloorRef.levelIndex` (story 1 sits at y=0).
 */
export function instantiateBuildingFloorStack(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  options?: InstantiateBuildingFloorStackOptions,
): THREE.Group {
  const spacing = options?.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const root = new THREE.Group();
  root.name = `building:${building.id}`;
  const o = building.worldOrigin;
  if (o) root.position.set(o[0], o[1], o[2]);

  const sorted = [...building.floorRefs].sort(
    (a, b) => a.levelIndex - b.levelIndex,
  );
  const stairShaftSpecs = getBuildingStairShaftSpecs(
    building,
    getFloorDoc,
    sorted,
    spacing,
  );
  const stairShaftSkipKeys = new Set(stairShaftSpecs.map((s) => s.planKey));

  const docsForShaftMerge = sorted.map((r) =>
    withoutElevatorsInStairwells(getFloorDoc(r.floorDocId)),
  );
  const shaftHolesPlateMerged = mergeShaftSlabHolesFromFloorDocs(docsForShaftMerge);
  const shaftElevatorsMerged =
    mergeElevatorShaftSlabHolesFromFloorDocs(docsForShaftMerge);

  const groundRef = sorted.find((r) => r.levelIndex === 1);
  const elevatorDoorFaceByShaftKey = groundRef
    ? elevatorDoorFacesFromGroundFloorDoc(getFloorDoc(groundRef.floorDocId))
    : undefined;

  for (const ref of sorted) {
    const doc = getFloorDoc(ref.floorDocId);
    const plateWorldOriginY = (o?.[1] ?? 0) + (ref.levelIndex - 1) * spacing;
    const plate = buildFloorMeshes(doc, {
      stairShaftSkipKeys,
      storyLevelIndex: ref.levelIndex,
      shaftHolesPlateMerged,
      shaftElevatorsMerged,
      plateWorldOriginY,
      elevatorDoorFaceByShaftKey,
    });
    plate.position.y = (ref.levelIndex - 1) * spacing;
    plate.name = `${plate.name}:L${ref.levelIndex}`;
    root.add(plate);
  }

  if (stairShaftSpecs.length > 0) {
    addBuildingStairShaftColumnsToRoot(root, stairShaftSpecs);
  }

  return root;
}

function addPlacementMeshes(
  root: THREE.Group,
  placements: readonly CellPlacement[],
  material: THREE.MeshStandardMaterial,
): void {
  for (const p of placements) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = p.entityId;
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
  const propMat = new THREE.MeshStandardMaterial({ color: 0x6b8cae });
  const portalMat = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    emissive: 0x332200,
  });
  const decalMat = new THREE.MeshStandardMaterial({
    color: 0x3d3d44,
    transparent: true,
    opacity: 0.85,
  });

  addPlacementMeshes(root, doc.placements, propMat);

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

  addPlacementMeshes(root, doc.placements, propMat);

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

import * as THREE from "three";
import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import {
  getBuildingStairShaftSpecs,
  shaftStackSy,
  STOREY_SPACING_M,
} from "./buildingStairShafts.js";
import {
  addStairWellPlaceholder,
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
} from "./stairElevatorPlaceholders.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { shaftDoorTowardPointFromFloorCorridors } from "./shaftCorridorFlush.js";
import { shortFloorLabelForRef } from "./buildingFloorLabels.js";
import { stairwellLitterScatterSeed } from "./stairwellCigaretteLitter.js";
import type { CollisionAabb } from "./collisionScene.js";
import type { PlateStairCorridorDoorPunch } from "./floorPlaceholderDoorPunchTypes.js";
import { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
import { addHollowRoomShell } from "./hollowRoomShell.js";
import {
  corridorShellHolesFromAdjacentUnitEntries,
  corridorShellHolesFromStairPunches,
  corridorShellWallHoleCount,
  mergeCorridorShellWallHoles,
  resolveCorridorShaftDoorContacts,
  stairCorridorSignPlacementsFromPunches,
} from "./floorCorridorPlateSignage.js";

export type StairOpeningCollisionOverlay = {
  suppressMasks: readonly CollisionAabb[];
  replacementBlockers: readonly CollisionAabb[];
};

function collectNamedBoxCollisionAabbs(
  root: THREE.Object3D,
  namePrefixes: readonly string[],
): CollisionAabb[] {
  const out: CollisionAabb[] = [];
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const g = obj.geometry;
    const boxLike =
      g instanceof THREE.BoxGeometry ||
      obj.userData.mammothAxisAlignedCollisionBox === true;
    if (!boxLike) return;
    if (!namePrefixes.some((prefix) => obj.name.startsWith(prefix))) return;
    if (g.boundingBox == null) g.computeBoundingBox();
    const bb = g.boundingBox;
    if (!bb) return;
    box.copy(bb).applyMatrix4(obj.matrixWorld);
    out.push({
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    });
  });
  return out;
}

function wallPrefixesForFaces(
  baseName: "shaft_wall" | "shell_wall",
  faces: Iterable<CardinalFace>,
): string[] {
  return [...new Set([...faces])].map((face) => `${baseName}_${face}`);
}

function buildShaftWallMask(
  worldX: number,
  worldY: number,
  worldZ: number,
  sx: number,
  sy: number,
  sz: number,
  face: CardinalFace,
): CollisionAabb {
  const wt = 0.11;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const y0 = worldY + (-hy + wt);
  const y1 = y0 + innerWallH;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  if (face === "e") {
    return {
      min: [worldX + hx - wt, y0, worldZ - vlenZ * 0.5],
      max: [worldX + hx, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "w") {
    return {
      min: [worldX - hx, y0, worldZ - vlenZ * 0.5],
      max: [worldX - hx + wt, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "n") {
    return {
      min: [worldX - vlenX * 0.5, y0, worldZ + hz - wt],
      max: [worldX + vlenX * 0.5, y1, worldZ + hz],
    };
  }
  return {
    min: [worldX - vlenX * 0.5, y0, worldZ - hz],
    max: [worldX + vlenX * 0.5, y1, worldZ - hz + wt],
  };
}

function buildCorridorWallMask(
  worldX: number,
  worldY: number,
  worldZ: number,
  sx: number,
  sy: number,
  sz: number,
  face: CardinalFace,
): CollisionAabb {
  const wt = 0.11;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const y0 = worldY - vh * 0.5;
  const y1 = worldY + vh * 0.5;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  if (face === "e") {
    return {
      min: [worldX + hx - wt, y0, worldZ - vlenZ * 0.5],
      max: [worldX + hx, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "w") {
    return {
      min: [worldX - hx, y0, worldZ - vlenZ * 0.5],
      max: [worldX - hx + wt, y1, worldZ + vlenZ * 0.5],
    };
  }
  if (face === "n") {
    return {
      min: [worldX - vlenX * 0.5, y0, worldZ + hz - wt],
      max: [worldX + vlenX * 0.5, y1, worldZ + hz],
    };
  }
  return {
    min: [worldX - vlenX * 0.5, y0, worldZ - hz],
    max: [worldX + vlenX * 0.5, y1, worldZ - hz + wt],
  };
}

export function stairOpeningAabbOverlaps(a: CollisionAabb, b: CollisionAabb): boolean {
  return !(
    a.max[0] <= b.min[0] ||
    a.min[0] >= b.max[0] ||
    a.max[1] <= b.min[1] ||
    a.min[1] >= b.max[1] ||
    a.max[2] <= b.min[2] ||
    a.min[2] >= b.max[2]
  );
}

export function applyStairOpeningCollisionOverlay(
  base: readonly CollisionAabb[],
  overlay: StairOpeningCollisionOverlay,
): CollisionAabb[] {
  const kept = base.filter(
    (aabb) =>
      !overlay.suppressMasks.some((mask) => stairOpeningAabbOverlaps(aabb, mask)),
  );
  return [...kept, ...overlay.replacementBlockers];
}

export function buildStairOpeningCollisionOverlayForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  stairWellDef: StairWellDef | undefined,
  floorSpacingM: number,
): StairOpeningCollisionOverlay {
  const suppressMasks: CollisionAabb[] = [];
  const replacementBlockers: CollisionAabb[] = [];
  const worldOrigin = building.worldOrigin ?? [0, 0, 0];
  const sorted = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const stairShaftSpecs = getBuildingStairShaftSpecs(
    building,
    getFloorDoc,
    sorted,
    floorSpacingM,
  );
  for (const spec of stairShaftSpecs) {
    for (let i = 0; i < spec.storeyCount; i++) {
      const isTopStorey = i === spec.storeyCount - 1;
      const authoringScope = i === 0 ? "ground" : "typical";
      const sySeg = shaftStackSy(spec.syPlate, spec.storeySpacing);
      const resolvedDoor = resolveStairWellGroundDoor({
        sx: spec.sx,
        sy: sySeg,
        sz: spec.sz,
        context: spec.entryDoorContexts[i],
        def: stairWellDef,
        authoringScope,
      });
      const supplementalDoors = resolveStairWellSupplementalDoors({
        sx: spec.sx,
        sy: sySeg,
        sz: spec.sz,
        context: spec.entryDoorContexts[i],
        def: stairWellDef,
        authoringScope,
        primaryDoor: resolvedDoor,
      });
      const affectedFaces = new Set<CardinalFace>();
      if (resolvedDoor) affectedFaces.add(resolvedDoor.face);
      for (const door of supplementalDoors) affectedFaces.add(door.face);
      if (affectedFaces.size === 0) continue;
      const segment = new THREE.Group();
      segment.position.set(
        worldOrigin[0] + spec.px,
        worldOrigin[1] +
          spec.bottomY +
          STOREY_SPACING_M * 0.5 +
          i * spec.storeySpacing,
        worldOrigin[2] + spec.pz,
      );
      addStairWellPlaceholder(segment, spec.sx, sySeg, spec.sz, {
        omitGroundStoreyCornerLandings: i === 0,
        def: stairWellDef,
        authoringScope,
        groundDoor: resolvedDoor?.groundDoor,
        supplementalDoors,
        includeCeiling: isTopStorey,
        omitTreads: isTopStorey,
        omitTopLanding: isTopStorey,
        shaftExteriorFaces: spec.exteriorShaftFaces,
        interiorWallUvAlternated: (spec.minLevelIndex + i - 1) % 2 === 1,
        segmentScatterSeed: stairwellLitterScatterSeed(spec.planKey, i),
        omitStairwellCigaretteLitter: true,
      });
      replacementBlockers.push(
        ...collectNamedBoxCollisionAabbs(
          segment,
          wallPrefixesForFaces("shaft_wall", affectedFaces),
        ),
      );
      for (const face of affectedFaces) {
        suppressMasks.push(
          buildShaftWallMask(
            segment.position.x,
            segment.position.y,
            segment.position.z,
            spec.sx,
            sySeg,
            spec.sz,
            face,
          ),
        );
      }
    }
  }
  for (const ref of sorted) {
    const floor = withoutElevatorsInStairwells(getFloorDoc(ref.floorDocId));
    let plateCx = 0;
    let plateCz = 0;
    for (const obj of floor.objects) {
      plateCx += obj.position[0];
      plateCz += obj.position[2];
    }
    if (floor.objects.length > 0) {
      plateCx /= floor.objects.length;
      plateCz /= floor.objects.length;
    }
    const stairAuthoringScope = ref.levelIndex === 1 ? "ground" : "typical";
    const stairDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
    for (const obj of floor.objects) {
      const pid = obj.prefabId.toLowerCase();
      if (!pid.includes("stair_well") && !pid.includes("stairwell")) continue;
      const sx = obj.scale?.[0] ?? 1;
      const sy = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;
      const stairDoorContext = {
        towardPlateXZ: shaftDoorTowardPointFromFloorCorridors(
          obj.position[0],
          obj.position[2],
          floor,
          plateCx,
          plateCz,
        ),
        shaftPlateXZ: [obj.position[0], obj.position[2]] as const,
      };
      const resolvedDoor = resolveStairWellGroundDoor({
        sx,
        sy,
        sz,
        context: stairDoorContext,
        def: stairWellDef,
        authoringScope: stairAuthoringScope,
      });
      if (!resolvedDoor) continue;
      const doors = [
        resolvedDoor,
        ...resolveStairWellSupplementalDoors({
          sx,
          sy,
          sz,
          context: stairDoorContext,
          def: stairWellDef,
          authoringScope: stairAuthoringScope,
          primaryDoor: resolvedDoor,
        }),
      ];
      for (const door of doors) {
        stairDoorPunchesPlate.push({
          stairFace: door.groundDoor.face ?? "e",
          tangentLocal: door.groundDoor.tangentOffsetAlongWall ?? 0,
          doorHalfW: door.doorHalfW,
          y0Local: door.y0Local,
          y1Local: door.y1Local,
          spx: obj.position[0],
          spz: obj.position[2],
          spy: obj.position[1],
          shx: sx * 0.5,
          shz: sz * 0.5,
        });
      }
    }
    for (const obj of floor.objects) {
      const kind = classifyPrefab(obj.prefabId);
      if (kind !== "corridor" || obj.rotation) continue;
      const sx = obj.scale?.[0] ?? 1;
      const sy = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;
      const stairContacts = resolveCorridorShaftDoorContacts(
        obj,
        sx,
        sy,
        sz,
        kind,
        stairDoorPunchesPlate,
      );
      if (stairContacts.length === 0) continue;
      const affectedFaces = new Set<CardinalFace>(
        stairContacts.map((contact) => contact.corridorWall),
      );
      const unitAdjacentCorridorHoles = corridorShellHolesFromAdjacentUnitEntries(
        obj,
        sx,
        sy,
        sz,
        floor,
      );
      const corridorWallHoles = mergeCorridorShellWallHoles(
        corridorShellHolesFromStairPunches(
          obj,
          sx,
          sy,
          sz,
          kind,
          stairDoorPunchesPlate,
        ),
        unitAdjacentCorridorHoles,
      );
      const stairSignPlacements = stairCorridorSignPlacementsFromPunches(
        obj,
        sx,
        sy,
        sz,
        stairDoorPunchesPlate,
      );
      const corridor = new THREE.Group();
      corridor.position.set(
        worldOrigin[0] + obj.position[0],
        worldOrigin[1] + (ref.levelIndex - 1) * floorSpacingM + obj.position[1],
        worldOrigin[2] + obj.position[2],
      );
      addHollowRoomShell(corridor, sx, sy, sz, kind, {
        shaftHolesPlate: [],
        roomPx: obj.position[0],
        roomPz: obj.position[2],
        skipShaftCutouts: false,
        storyLevelIndex: ref.levelIndex,
        storyShortLabel: shortFloorLabelForRef(ref),
        corridorWallHoles,
        stairSignPlacements,
        useAuthoringCorridorCeiling:
          ref.levelIndex === 1 ||
          ref.levelIndex === 99 ||
          corridorShellWallHoleCount(unitAdjacentCorridorHoles) > 0,
      });
      replacementBlockers.push(
        ...collectNamedBoxCollisionAabbs(
          corridor,
          wallPrefixesForFaces("shell_wall", affectedFaces),
        ),
      );
      for (const face of affectedFaces) {
        suppressMasks.push(
          buildCorridorWallMask(
            corridor.position.x,
            corridor.position.y,
            corridor.position.z,
            sx,
            sy,
            sz,
            face,
          ),
        );
      }
    }
  }
  return { suppressMasks, replacementBlockers };
}

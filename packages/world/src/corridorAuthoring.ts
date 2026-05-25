import type { BuildingDoc, FloorDoc, OwnedApartmentBuiltinsDoc, OwnedApartmentPlacedItem } from "@the-mammoth/schemas";
import { DEFAULT_BUILDING_FLOOR_SPACING_M } from "./buildingFloorStack.js";
import {
  buildFloorShortLabelMap,
  shortFloorLabelForLevel,
} from "./buildingFloorLabels.js";
import { TYPICAL_FLOOR_DOC_ID } from "./buildingStairShafts.js";
import { UNIT_SHELL_WALL_THICKNESS_M } from "./unitExteriorWindows.js";

/** Gameplay floor 19 = authored stack `levelIndex` 20. */
export const FLOOR_19_GAMEPLAY_LEVEL_INDEX = 20;
export const FLOOR_19_CORRIDOR_OBJECT_ID = "corridor_main";

export type AuthoringCorridorPreviewFloorOption = {
  levelIndex: number;
  floorDocId: string;
  corridorKey: string;
  label: string;
  gameplayFloorNumber: number;
  hasPersistedBuiltins: boolean;
};

export function authoringCorridorPreviewKey(
  floorDocId: string,
  levelIndex: number,
  corridorObjectId = FLOOR_19_CORRIDOR_OBJECT_ID,
): string {
  return `${floorDocId}|${levelIndex}|${corridorObjectId}`;
}

/** Stack levels whose floor doc contains `corridor_main` (or override id). */
export function listAuthoringCorridorPreviewFloors(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc | undefined,
  opts?: { corridorObjectId?: string; persistedLevelIndex?: number },
): AuthoringCorridorPreviewFloorOption[] {
  const corridorObjectId = opts?.corridorObjectId ?? FLOOR_19_CORRIDOR_OBJECT_ID;
  const persistedLevelIndex = opts?.persistedLevelIndex ?? FLOOR_19_GAMEPLAY_LEVEL_INDEX;
  const labels = buildFloorShortLabelMap(building);
  return [...building.floorRefs]
    .sort((a, b) => a.levelIndex - b.levelIndex)
    .flatMap((ref) => {
      const floor = getFloorDoc(ref.floorDocId);
      if (!floor?.objects.some((obj) => obj.id === corridorObjectId)) return [];
      const gameplayFloorNumber = Math.max(1, ref.levelIndex - 1);
      const shortLabel = shortFloorLabelForLevel(ref.levelIndex, labels);
      const floorHeading =
        shortLabel !== String(ref.levelIndex)
          ? `Floor ${gameplayFloorNumber} (${shortLabel})`
          : `Floor ${gameplayFloorNumber}`;
      return [
        {
          levelIndex: ref.levelIndex,
          floorDocId: ref.floorDocId,
          corridorKey: authoringCorridorPreviewKey(ref.floorDocId, ref.levelIndex, corridorObjectId),
          label: floorHeading,
          gameplayFloorNumber,
          hasPersistedBuiltins: ref.levelIndex === persistedLevelIndex,
        },
      ];
    });
}

export type CorridorAuthoringFootprint = {
  corridorObjectId: string;
  /** Plate-local walk floor Y (feet / `dy` origin). */
  floorY: number;
  /** Interior ceiling inner Y in plate-local space (decor clamp). */
  ceilingInnerY: number;
  strictMinX: number;
  strictMinZ: number;
  spanX: number;
  spanZ: number;
  prefabOriginX: number;
  prefabOriginZ: number;
  prefabFootprintSx: number;
  prefabFootprintSz: number;
};

export type CorridorDecorPose = {
  id: string;
  modelRelPath: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  uniformScale: number;
  verticalScaleMul: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
};

function corridorObjectFromTypicalFloor(
  floorDoc: FloorDoc | undefined,
  corridorObjectId = FLOOR_19_CORRIDOR_OBJECT_ID,
) {
  if (!floorDoc || floorDoc.id !== TYPICAL_FLOOR_DOC_ID) return null;
  return floorDoc.objects.find((obj) => obj.id === corridorObjectId) ?? null;
}

/** Strict interior XZ hull for corridor fraction authoring (plate-local). */
export function resolveFloor19CorridorAuthoringFootprint(
  floorDoc: FloorDoc | undefined,
): CorridorAuthoringFootprint | null {
  const corridor = corridorObjectFromTypicalFloor(floorDoc);
  if (!corridor?.scale) return null;

  const sx = corridor.scale[0] ?? 3.85;
  const sy = corridor.scale[1] ?? 3.05;
  const sz = corridor.scale[2] ?? 159.5;
  const cx = corridor.position[0] ?? 0;
  const cz = corridor.position[2] ?? 0;
  const cy = corridor.position[1] ?? 1.605;

  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const hy = sy * 0.5;
  const halfInnerX = Math.max(0.5, sx * 0.5 - wt);
  const halfInnerZ = Math.max(1, sz * 0.5 - wt);

  const strictMinX = cx - halfInnerX;
  const strictMaxX = cx + halfInnerX;
  const strictMinZ = cz - halfInnerZ;
  const strictMaxZ = cz + halfInnerZ;
  const spanX = strictMaxX - strictMinX;
  const spanZ = strictMaxZ - strictMinZ;

  const floorY = cy - hy + wt;
  const ceilingInnerY = cy + hy - wt;

  return {
    corridorObjectId: corridor.id,
    floorY,
    ceilingInnerY,
    strictMinX,
    strictMinZ,
    spanX,
    spanZ,
    prefabOriginX: cx - sx * 0.5,
    prefabOriginZ: cz - sz * 0.5,
    prefabFootprintSx: sx,
    prefabFootprintSz: sz,
  };
}

export function corridorPlateLocalPositionFromFractions(
  footprint: CorridorAuthoringFootprint,
  fx: number,
  fz: number,
  dy: number,
): { x: number; y: number; z: number } {
  return {
    x: footprint.strictMinX + fx * footprint.spanX,
    y: footprint.floorY + dy,
    z: footprint.strictMinZ + fz * footprint.spanZ,
  };
}

export function corridorFractionsFromPlateLocalPosition(
  footprint: CorridorAuthoringFootprint,
  x: number,
  z: number,
): { fx: number; fz: number } {
  return {
    fx: footprint.spanX > 1e-6 ? (x - footprint.strictMinX) / footprint.spanX : 0.5,
    fz: footprint.spanZ > 1e-6 ? (z - footprint.strictMinZ) / footprint.spanZ : 0.5,
  };
}

/** World-space poses for corridor decor on gameplay floor 19 (`levelIndex` 20). */
export function resolveFloor19CorridorDecorPoses(
  doc: OwnedApartmentBuiltinsDoc | null | undefined,
  opts?: {
    levelIndex?: number;
    floorSpacingM?: number;
    footprint?: CorridorAuthoringFootprint | null;
  },
): CorridorDecorPose[] {
  if (!doc || doc.placedItems.length === 0) return [];
  const footprint = opts?.footprint ?? null;
  if (!footprint) return [];

  const levelIndex = opts?.levelIndex ?? FLOOR_19_GAMEPLAY_LEVEL_INDEX;
  const spacing = opts?.floorSpacingM ?? DEFAULT_BUILDING_FLOOR_SPACING_M;
  const plateWorldY = (levelIndex - 1) * spacing;

  return doc.placedItems.map((item) => poseFromPlacedItem(item, footprint, plateWorldY));
}

function poseFromPlacedItem(
  item: OwnedApartmentPlacedItem,
  footprint: CorridorAuthoringFootprint,
  plateWorldY: number,
): CorridorDecorPose {
  const local = corridorPlateLocalPositionFromFractions(
    footprint,
    item.fx,
    item.fz,
    item.dy,
  );
  return {
    id: item.id,
    modelRelPath: item.modelRelPath,
    x: local.x,
    y: plateWorldY + local.y,
    z: local.z,
    yaw: item.yawRad,
    pitch: item.pitchRad,
    roll: item.rollRad ?? 0,
    uniformScale: item.uniformScale,
    verticalScaleMul: item.verticalScaleMul ?? 1,
    scaleX: item.scaleX,
    scaleY: item.scaleY,
    scaleZ: item.scaleZ,
  };
}

/** Seed fractions for evenly spaced ceiling fixtures along the corridor centerline. */
export function seedFloor19CorridorCeilingLightPlacedItems(args: {
  modelRelPath: string;
  startZM: number;
  endZM: number;
  spacingM: number;
  uniformScale: number;
  dy: number;
  footprint: CorridorAuthoringFootprint;
}): OwnedApartmentPlacedItem[] {
  const centerX = args.footprint.strictMinX + args.footprint.spanX * 0.5;
  const items: OwnedApartmentPlacedItem[] = [];
  let index = 0;
  for (let z = args.startZM; z <= args.endZM + 1e-6; z += args.spacingM) {
    const { fx, fz } = corridorFractionsFromPlateLocalPosition(args.footprint, centerX, z);
    items.push({
      id: `floor19_corridor_light_${index.toString().padStart(2, "0")}`,
      modelRelPath: args.modelRelPath,
      fx: Number(fx.toFixed(6)),
      fz: Number(fz.toFixed(6)),
      dy: args.dy,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: args.uniformScale,
      verticalScaleMul: 1,
      ignoreSupportSurfaces: true,
      itemKind: "plain",
    });
    index += 1;
  }
  return items;
}

import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import type { CorridorShellWallHoles } from "./floorPlaceholderMeshTypes.js";
import { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
import {
  corridorShellHolesFromAdjacentUnitEntries,
  mergeCorridorShellWallHoles,
} from "./floorCorridorPlateSignage.js";
import { exteriorFacesForPlacedObjectInFloor } from "./exteriorFaceExposure.js";
import { manualCorridorShellHoleExtrasForFloor } from "./manualApartmentDoorExtras.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { UNIT_SHELL_WALL_THICKNESS_M } from "./unitExteriorWindows.js";
import { FLOOR_19_CORRIDOR_OBJECT_ID } from "./corridorAuthoring.js";

export type CorridorEditorShellPlan = {
  hx: number;
  hz: number;
  yLo: number;
  yHi: number;
  interiorSx: number;
  sy: number;
  sz: number;
  corridorWallHoles: CorridorShellWallHoles | undefined;
  exteriorFaces: readonly CardinalFace[];
  storyLevelIndex: number;
};

function corridorPlacedObject(
  floor: FloorDoc,
  corridorObjectId: string,
): PlacedObject | null {
  return floor.objects.find((obj) => obj.id === corridorObjectId) ?? null;
}

/** Game-derived corridor hollow-shell plan for editor preview (walls + door cutouts). */
export function planCorridorEditorShellForPlacedObject(opts: {
  floor: FloorDoc;
  corridor: PlacedObject;
  storyLevelIndex: number;
}): CorridorEditorShellPlan | null {
  const { corridor, floor, storyLevelIndex } = opts;
  if (classifyPrefab(corridor.prefabId) !== "corridor") return null;
  if (corridor.rotation?.some((v) => Math.abs(v) > 1e-12)) return null;

  const sx = corridor.scale?.[0] ?? 1;
  const sy = corridor.scale?.[1] ?? 1;
  const sz = corridor.scale?.[2] ?? 1;
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const vh = Math.max(sy - 2 * wt, 0.05);
  const yLo = -vh * 0.5;
  const yHi = vh * 0.5;

  const unitAdjacent = corridorShellHolesFromAdjacentUnitEntries(
    corridor,
    sx,
    sy,
    sz,
    floor,
  );
  const manual = manualCorridorShellHoleExtrasForFloor(floor, corridor, sx, sy, sz);
  const corridorWallHoles = mergeCorridorShellWallHoles(unitAdjacent, manual);

  return {
    hx,
    hz,
    yLo,
    yHi,
    interiorSx: sx,
    sy,
    sz,
    corridorWallHoles,
    exteriorFaces: exteriorFacesForPlacedObjectInFloor(floor, corridor),
    storyLevelIndex,
  };
}

export function resolveCorridorEditorShellForAuthoring(opts: {
  floor: FloorDoc;
  corridorObjectId?: string;
  storyLevelIndex: number;
}): { corridor: PlacedObject; plan: CorridorEditorShellPlan } | null {
  const corridorObjectId = opts.corridorObjectId ?? FLOOR_19_CORRIDOR_OBJECT_ID;
  const corridor = corridorPlacedObject(opts.floor, corridorObjectId);
  if (!corridor) return null;
  const plan = planCorridorEditorShellForPlacedObject({
    floor: opts.floor,
    corridor,
    storyLevelIndex: opts.storyLevelIndex,
  });
  if (!plan) return null;
  return { corridor, plan };
}

export function corridorEditorShellWallHoleCount(
  holes: CorridorShellWallHoles | undefined,
): number {
  if (!holes) return 0;
  return (
    (holes.e?.length ?? 0) +
    (holes.w?.length ?? 0) +
    (holes.n?.length ?? 0) +
    (holes.s?.length ?? 0)
  );
}

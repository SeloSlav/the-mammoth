import type { BuildingDoc, BuildingFloorRef } from "@the-mammoth/schemas";

export type FloorShortLabelMap = ReadonlyMap<number, string>;

function fallbackShortLabel(levelIndex: number): string {
  return String(levelIndex);
}

export function shortFloorLabelForRef(ref: Pick<BuildingFloorRef, "levelIndex" | "shortLabel">): string {
  const authored = ref.shortLabel?.trim();
  return authored && authored.length > 0 ? authored : fallbackShortLabel(ref.levelIndex);
}

export function buildFloorShortLabelMap(building: Pick<BuildingDoc, "floorRefs">): Map<number, string> {
  const out = new Map<number, string>();
  for (const ref of building.floorRefs) {
    out.set(ref.levelIndex, shortFloorLabelForRef(ref));
  }
  return out;
}

export function shortFloorLabelForLevel(
  levelIndex: number,
  floorLabels?: FloorShortLabelMap,
): string {
  return floorLabels?.get(levelIndex) ?? fallbackShortLabel(levelIndex);
}

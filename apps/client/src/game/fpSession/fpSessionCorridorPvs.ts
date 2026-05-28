/**
 * Per-frame corridor PVS snapshot for FP session visibility (doors + unit id lookup).
 */
import {
  buildOpenDoorUnitKeysByLevel,
  estimateStoreyFromFeetY,
  resolveCorridorPvsVisibleUnits,
  type BuildingCorridorPvsDoorEntry,
  type CorridorPvsVisibleUnits,
} from "@the-mammoth/world";
import { residentUnitKeyFromParts } from "../fpApartment/fpApartmentGameplay.js";

export type FpSessionCorridorPvsSnapshot = {
  openDoorUnitKeysByLevel: Map<number, Set<string>>;
  visible: CorridorPvsVisibleUnits;
};

export type FpSessionCorridorPvsContext = {
  buildingWorldOriginY: number;
  floorSpacingM: number;
  maxLevel: number;
  unitIdForKey: (unitKey: string) => string | null;
  collectDoorEntries: () => readonly BuildingCorridorPvsDoorEntry[];
};

export function createFpSessionCorridorPvsContext(
  ctx: FpSessionCorridorPvsContext,
): {
  resolveSnapshot: (input: {
    feetY: number;
    cameraX: number;
    cameraZ: number;
    viewDirX: number;
    viewDirZ: number;
    insideResidentialUnit: boolean;
    insideApartmentInteriorLightingZone: boolean;
    containingUnitKey: string | null;
    retainedUnitKey: string | null;
  }) => FpSessionCorridorPvsSnapshot;
} {
  return {
    resolveSnapshot(input) {
      const playerLevel = estimateStoreyFromFeetY(input.feetY, {
        buildingWorldOriginY: ctx.buildingWorldOriginY,
        floorSpacingM: ctx.floorSpacingM,
        maxLevel: ctx.maxLevel,
      });
      const openDoorUnitKeysByLevel = buildOpenDoorUnitKeysByLevel(ctx.collectDoorEntries(), {
        cameraX: input.cameraX,
        cameraZ: input.cameraZ,
        viewDirX: input.viewDirX,
        viewDirZ: input.viewDirZ,
      });
      const visible = resolveCorridorPvsVisibleUnits({
        playerLevel,
        insideResidentialUnit: input.insideResidentialUnit,
        insideApartmentInteriorLightingZone: input.insideApartmentInteriorLightingZone,
        containingUnitKey: input.containingUnitKey,
        retainedUnitKey: input.retainedUnitKey,
        openDoorUnitKeysByLevel,
        unitIdForKey: ctx.unitIdForKey,
      });
      return { openDoorUnitKeysByLevel, visible };
    },
  };
}

/** Build a door PVS entry from apartment door slot fields (client doors mount). */
export function buildingCorridorPvsDoorEntryFromApartmentSlot(input: {
  floorDocId: string;
  level: number;
  templateId: string;
  open01: number;
}): BuildingCorridorPvsDoorEntry | null {
  if (!input.templateId.includes("unit_")) return null;
  const unitId = input.templateId.split("|")[0] ?? "";
  if (!unitId.startsWith("unit_")) return null;
  return {
    unitKey: residentUnitKeyFromParts(input.floorDocId, input.level, input.templateId),
    unitId,
    level: input.level,
    open01: input.open01,
    isResidentialUnitDoor: true,
  };
}

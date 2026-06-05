/**
 * Per-frame corridor PVS snapshot for FP session visibility (doors + unit id lookup).
 */
import {
  APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M,
  buildOpenDoorUnitKeysByLevel,
  buildStoreyRadiusVisibleUnitKeys,
  estimateStoreyFromFeetY,
  resolveCorridorPvsVisibleUnits,
  type BuildingCorridorPvsDoorEntry,
  type BuildingStoreyUnitBoundsEntry,
  type CorridorPvsVisibleUnits,
} from "@the-mammoth/world";
import { residentUnitKeyFromParts } from "../fpApartment/fpApartmentGameplay.js";

/**
 * Reuse a PVS snapshot while the camera remains in this XZ volume. Query radii are expanded by the
 * same amount, so the cached set is conservative throughout the volume and cannot reveal late.
 */
export const FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M = 0.75;

export type FpSessionCorridorPvsSnapshot = {
  openDoorUnitKeysByLevel: Map<number, Set<string>>;
  visible: CorridorPvsVisibleUnits;
};

export type FpSessionCorridorPvsContext = {
  buildingWorldOriginY: number;
  floorSpacingM: number;
  maxLevel: number;
  unitIdForKey: (unitKey: string) => string | null;
  getDoorEntriesRevision: () => number;
  getStoreyUnitBoundsRevision: () => number;
  collectDoorEntries: () => readonly BuildingCorridorPvsDoorEntry[];
  /** Replicated apartment hulls — drives same-storey interior peek radius. */
  collectStoreyUnitBounds: () => readonly BuildingStoreyUnitBoundsEntry[];
};

function groupCorridorPvsEntriesByLevel<T extends { level: number }>(
  entries: readonly T[],
): Map<number, T[]> {
  const byLevel = new Map<number, T[]>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    let levelEntries = byLevel.get(entry.level);
    if (!levelEntries) {
      levelEntries = [];
      byLevel.set(entry.level, levelEntries);
    }
    levelEntries.push(entry);
  }
  return byLevel;
}

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
  let cachedDoorEntriesRevision = Number.NaN;
  let cachedDoorEntriesByLevel = new Map<number, BuildingCorridorPvsDoorEntry[]>();
  let cachedStoreyUnitBoundsRevision = Number.NaN;
  let cachedStoreyUnitBoundsByLevel = new Map<number, BuildingStoreyUnitBoundsEntry[]>();
  let cachedSnapshot: FpSessionCorridorPvsSnapshot | null = null;
  let cachedSnapshotDoorRevision = Number.NaN;
  let cachedSnapshotStoreyUnitBoundsRevision = Number.NaN;
  let cachedPlayerLevel = -1;
  let cachedCameraX = Number.NaN;
  let cachedCameraZ = Number.NaN;
  let cachedInsideResidentialUnit = false;
  let cachedInsideApartmentInteriorLightingZone = false;
  let cachedContainingUnitKey: string | null = null;
  let cachedRetainedUnitKey: string | null = null;
  const cacheRadiusSq =
    FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M * FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M;

  return {
    resolveSnapshot(input) {
      const playerLevel = estimateStoreyFromFeetY(input.feetY, {
        buildingWorldOriginY: ctx.buildingWorldOriginY,
        floorSpacingM: ctx.floorSpacingM,
        maxLevel: ctx.maxLevel,
      });
      const doorRevision = ctx.getDoorEntriesRevision();
      const storeyUnitBoundsRevision = ctx.getStoreyUnitBoundsRevision();
      const cameraDx = input.cameraX - cachedCameraX;
      const cameraDz = input.cameraZ - cachedCameraZ;
      if (
        cachedSnapshot !== null &&
        doorRevision === cachedSnapshotDoorRevision &&
        storeyUnitBoundsRevision === cachedSnapshotStoreyUnitBoundsRevision &&
        playerLevel === cachedPlayerLevel &&
        input.insideResidentialUnit === cachedInsideResidentialUnit &&
        input.insideApartmentInteriorLightingZone ===
          cachedInsideApartmentInteriorLightingZone &&
        input.containingUnitKey === cachedContainingUnitKey &&
        input.retainedUnitKey === cachedRetainedUnitKey &&
        cameraDx * cameraDx + cameraDz * cameraDz <= cacheRadiusSq
      ) {
        return cachedSnapshot;
      }

      if (doorRevision !== cachedDoorEntriesRevision) {
        cachedDoorEntriesByLevel = groupCorridorPvsEntriesByLevel(ctx.collectDoorEntries());
        cachedDoorEntriesRevision = doorRevision;
      }
      if (storeyUnitBoundsRevision !== cachedStoreyUnitBoundsRevision) {
        cachedStoreyUnitBoundsByLevel = groupCorridorPvsEntriesByLevel(
          ctx.collectStoreyUnitBounds(),
        );
        cachedStoreyUnitBoundsRevision = storeyUnitBoundsRevision;
      }

      const openDoorUnitKeysByLevel = buildOpenDoorUnitKeysByLevel(
        cachedDoorEntriesByLevel.get(playerLevel) ?? [],
        {
          cameraX: input.cameraX,
          cameraZ: input.cameraZ,
          viewDirX: input.viewDirX,
          viewDirZ: input.viewDirZ,
          maxDistM:
            APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M +
            FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M,
        },
      );
      const storeyRadiusVisibleUnitKeys = buildStoreyRadiusVisibleUnitKeys(
        cachedStoreyUnitBoundsByLevel.get(playerLevel) ?? [],
        {
          storeyLevel: playerLevel,
          cameraX: input.cameraX,
          cameraZ: input.cameraZ,
          maxDistM:
            APARTMENT_DOOR_PVS_INTERIOR_PEEK_MAX_DIST_M +
            FP_SESSION_CORRIDOR_PVS_CACHE_RADIUS_M,
        },
      );
      const visible = resolveCorridorPvsVisibleUnits({
        playerLevel,
        insideResidentialUnit: input.insideResidentialUnit,
        insideApartmentInteriorLightingZone: input.insideApartmentInteriorLightingZone,
        containingUnitKey: input.containingUnitKey,
        retainedUnitKey: input.retainedUnitKey,
        openDoorUnitKeysByLevel,
        storeyRadiusVisibleUnitKeys,
        unitIdForKey: ctx.unitIdForKey,
      });
      cachedSnapshot = { openDoorUnitKeysByLevel, visible };
      cachedSnapshotDoorRevision = doorRevision;
      cachedSnapshotStoreyUnitBoundsRevision = storeyUnitBoundsRevision;
      cachedPlayerLevel = playerLevel;
      cachedCameraX = input.cameraX;
      cachedCameraZ = input.cameraZ;
      cachedInsideResidentialUnit = input.insideResidentialUnit;
      cachedInsideApartmentInteriorLightingZone =
        input.insideApartmentInteriorLightingZone;
      cachedContainingUnitKey = input.containingUnitKey;
      cachedRetainedUnitKey = input.retainedUnitKey;
      return cachedSnapshot;
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

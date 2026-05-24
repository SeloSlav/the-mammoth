import type { OwnedApartmentPlacedItem } from "./ownedApartmentBuiltins.js";

/** Procedural shutter catalog path — geometry is built in code (`@the-mammoth/world`). */
export const OWNED_APARTMENT_MODEL_WINDOW_SHUTTER =
  "static/models/objects/window-shutter.glb" as const;

/** Gameplay display floors (PR excluded) that receive standard façade shutters. */
export const APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MIN = 13 as const;
export const APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MAX = 19 as const;

/** Authored reference unit: floor 19 east 3 (`owned_apartment_builtins.json`). */
export const APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES = [
  {
    id: "mammoth_standard_window_shutter_0",
    fx: 0.9774696707105718,
    fz: 0.1754260738235218,
    dy: 1.7568053722194503,
    yawRad: -Math.PI / 2,
    uniformScale: 1.686652591805788,
  },
  {
    id: "mammoth_standard_window_shutter_1",
    fx: 0.9774696707105714,
    fz: 0.6749804574576809,
    dy: 1.7569815645250846,
    yawRad: -Math.PI / 2,
    uniformScale: 1.686652591805788,
  },
] as const;

const EAST_REFERENCE_WINDOW_SHUTTER_TEMPLATES = APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES;

export function isOwnedApartmentWindowShutterModelRelPath(modelRelPath: string): boolean {
  const norm = modelRelPath.trim().replace(/^\/+/u, "").toLowerCase();
  return norm.endsWith("window-shutter.glb");
}

/** Building `levelIndex` → gameplay floor label (`mammoth.json` shortLabel). */
export function apartmentStoryLevelIndexToDisplayFloor(storyLevelIndex: number): number {
  return Math.max(1, storyLevelIndex - 1);
}

export function parseApartmentUnitKeyParts(
  unitKey: string,
): { floorDocId: string; storyLevelIndex: number; unitId: string } | null {
  const segments = unitKey.trim().split("|");
  if (segments.length !== 3) return null;
  const [floorDocId, levelStr, unitId] = segments;
  if (!floorDocId || !unitId) return null;
  const storyLevelIndex = Number.parseInt(levelStr!, 10);
  if (!Number.isFinite(storyLevelIndex)) return null;
  return { floorDocId, storyLevelIndex, unitId };
}

export function apartmentUnitQualifiesForStandardWindowShutters(unitKey: string): boolean {
  const parts = parseApartmentUnitKeyParts(unitKey);
  if (!parts) return false;
  if (!parts.unitId.startsWith("unit_e_") && !parts.unitId.startsWith("unit_w_")) {
    return false;
  }
  const displayFloor = apartmentStoryLevelIndexToDisplayFloor(parts.storyLevelIndex);
  return (
    displayFloor >= APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MIN &&
    displayFloor <= APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MAX
  );
}

/** Mirror east-authored shutter fractions/yaw onto west-balcony units. */
export function adaptStandardWindowShutterPlacementForUnit(
  template: (typeof EAST_REFERENCE_WINDOW_SHUTTER_TEMPLATES)[number],
  unitId: string,
): OwnedApartmentPlacedItem {
  const isWest = unitId.startsWith("unit_w_");
  return {
    id: template.id,
    modelRelPath: OWNED_APARTMENT_MODEL_WINDOW_SHUTTER,
    // West `fx` is finalized with unit bounds in `@the-mammoth/world` — keep east reference here.
    fx: template.fx,
    fz: template.fz,
    dy: template.dy,
    yawRad: isWest ? -template.yawRad : template.yawRad,
    pitchRad: 0,
    rollRad: 0,
    uniformScale: template.uniformScale,
    verticalScaleMul: 1,
    ignoreSupportSurfaces: false,
    itemKind: "plain",
  };
}

export function standardApartmentWindowShutterPlacedItemsForUnit(
  unitId: string,
): OwnedApartmentPlacedItem[] {
  if (!unitId.startsWith("unit_e_") && !unitId.startsWith("unit_w_")) return [];
  return EAST_REFERENCE_WINDOW_SHUTTER_TEMPLATES.map((template) =>
    adaptStandardWindowShutterPlacementForUnit(template, unitId),
  );
}

/**
 * Replace any authored shutter rows with the canonical east-reference pair, mirrored for west units.
 * Non-qualifying units keep their layout unchanged.
 */
export function mergeStandardApartmentWindowShuttersIntoPlacedItems(
  unitKey: string,
  unitId: string,
  placedItems: readonly OwnedApartmentPlacedItem[],
): OwnedApartmentPlacedItem[] {
  if (!apartmentUnitQualifiesForStandardWindowShutters(unitKey)) {
    return [...placedItems];
  }
  const withoutShutters = placedItems.filter(
    (item) => !isOwnedApartmentWindowShutterModelRelPath(item.modelRelPath),
  );
  return [
    ...withoutShutters,
    ...standardApartmentWindowShutterPlacedItemsForUnit(unitId),
  ];
}

export function eastReferenceFxForStandardWindowShutterId(shutterId: string): number | null {
  const row = APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES.find((t) => t.id === shutterId);
  return row?.fx ?? null;
}

import type { OwnedApartmentPlacedItem } from "./ownedApartmentBuiltins.js";

/** Procedural shutter catalog path — geometry is built in code (`@the-mammoth/world`). */
export const OWNED_APARTMENT_MODEL_WINDOW_SHUTTER =
  "static/models/objects/window-shutter.glb" as const;

/** Gameplay display floors (PR excluded) that receive standard façade shutters. */
export const APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MIN = 13 as const;
export const APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MAX = 19 as const;

/**
 * Abandoned extraction band (elevator "16" and below): façade keeps window holes only — glass
 * panes and shutters are omitted (`docs/building-floors.md`).
 */
export const BLOWN_OUT_FACADE_MAX_DISPLAY_FLOOR = 16 as const;

/** True when unit façade glass meshes / standard shutters should spawn for this plate. */
export function unitExteriorGlassMeshesEnabledForStoryLevel(storyLevelIndex: number): boolean {
  if (storyLevelIndex === 99) return true;
  if (storyLevelIndex <= 1) return false;
  return (
    apartmentStoryLevelIndexToDisplayFloor(storyLevelIndex) > BLOWN_OUT_FACADE_MAX_DISPLAY_FLOOR
  );
}

/** True when apartment unit shells use the abandoned PATINA hardwood-fungus floor (display ≤ 16). */
export function apartmentUnitAbandonedHardwoodFloorForStoryLevel(storyLevelIndex: number): boolean {
  if (storyLevelIndex === 99) return false;
  return (
    apartmentStoryLevelIndexToDisplayFloor(storyLevelIndex) <= BLOWN_OUT_FACADE_MAX_DISPLAY_FLOOR
  );
}

/** PR / ground podium plate (`mammoth.json` levelIndex 1). */
export const APARTMENT_PR_STORY_LEVEL_INDEX = 1 as const;

/**
 * Abandoned extraction band: display floors 1–16 on typical plates (storyLevelIndex 2–17).
 * PR (story 1) is excluded — podium keeps stair / manual doors only.
 */
export function apartmentStoryLevelIsExtractionBand(storyLevelIndex: number): boolean {
  if (storyLevelIndex === 99) return false;
  if (storyLevelIndex === APARTMENT_PR_STORY_LEVEL_INDEX) return false;
  return (
    apartmentStoryLevelIndexToDisplayFloor(storyLevelIndex) <= BLOWN_OUT_FACADE_MAX_DISPLAY_FLOOR
  );
}

/**
 * Residential `unit_e_*` / `unit_w_*` corridor swing doors — omitted on extraction-band storeys
 * (fungus-rotted entries). PR podium and lived-in band (display 17+) keep doors.
 */
export function apartmentUnitEntryDoorsEnabledForStoryLevel(storyLevelIndex: number): boolean {
  if (storyLevelIndex === APARTMENT_PR_STORY_LEVEL_INDEX) return true;
  return !apartmentStoryLevelIsExtractionBand(storyLevelIndex);
}

/** Smashed-window extraction storeys use the corridor interior lighting rig even inside units. */
export function apartmentExtractionBandUsesHallwayLighting(storyLevelIndex: number): boolean {
  return apartmentStoryLevelIsExtractionBand(storyLevelIndex);
}

export type StandardWindowShutterTemplate = Pick<
  OwnedApartmentPlacedItem,
  | "id"
  | "fx"
  | "fz"
  | "dy"
  | "yawRad"
  | "pitchRad"
  | "rollRad"
  | "uniformScale"
  | "verticalScaleMul"
  | "scaleX"
  | "scaleY"
  | "scaleZ"
>;

/** Fallback reference unit: floor 19 east 3 (`owned_apartment_builtins.json`). */
export const APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES = [
  {
    id: "mammoth_standard_window_shutter_0",
    fx: 0.9774696707105714,
    fz: 0.16169746083300776,
    dy: 1.601049521076354,
    yawRad: -Math.PI / 2,
    pitchRad: 0,
    rollRad: 0,
    uniformScale: 1.7485030380530002,
    verticalScaleMul: 0.8024663311843774,
    scaleX: 1.8103534843002127,
    scaleY: 1.4031148180111288,
    scaleZ: 1.686652591805788,
  },
  {
    id: "mammoth_standard_window_shutter_1",
    fx: 0.9774696707105714,
    fz: 0.6699791785869178,
    dy: 1.602608473496812,
    yawRad: -Math.PI / 2,
    pitchRad: 0,
    rollRad: 0,
    uniformScale: 1.6498272281962265,
    verticalScaleMul: 0.8499628264360659,
    scaleX: 1.6130018645866648,
    scaleY: 1.402291814008845,
    scaleZ: 1.686652591805788,
  },
] as const satisfies readonly StandardWindowShutterTemplate[];

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
    unitExteriorGlassMeshesEnabledForStoryLevel(parts.storyLevelIndex) &&
    displayFloor >= APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MIN &&
    displayFloor <= APARTMENT_STANDARD_WINDOW_SHUTTER_FLOOR_MAX
  );
}

export function standardApartmentWindowShutterReferenceItemsFromPlacedItems(
  placedItems: readonly OwnedApartmentPlacedItem[],
): OwnedApartmentPlacedItem[] {
  const authored = placedItems.filter((item) =>
    isOwnedApartmentWindowShutterModelRelPath(item.modelRelPath),
  );
  return authored.length > 0
    ? authored
    : EAST_REFERENCE_WINDOW_SHUTTER_TEMPLATES.map((template) =>
        adaptStandardWindowShutterPlacementForUnit(template, "unit_e_reference"),
      );
}

/** Mirror east-authored shutter transforms onto west-balcony units. */
export function adaptStandardWindowShutterPlacementForUnit(
  template: StandardWindowShutterTemplate,
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
    pitchRad: template.pitchRad,
    rollRad: template.rollRad,
    uniformScale: template.uniformScale,
    verticalScaleMul: template.verticalScaleMul,
    ...(template.scaleX !== undefined ? { scaleX: template.scaleX } : {}),
    ...(template.scaleY !== undefined ? { scaleY: template.scaleY } : {}),
    ...(template.scaleZ !== undefined ? { scaleZ: template.scaleZ } : {}),
    ignoreSupportSurfaces: false,
    itemKind: "plain",
  };
}

export function standardApartmentWindowShutterPlacedItemsForUnit(
  unitId: string,
  referencePlacedItems: readonly OwnedApartmentPlacedItem[] = [],
): OwnedApartmentPlacedItem[] {
  if (!unitId.startsWith("unit_e_") && !unitId.startsWith("unit_w_")) return [];
  return standardApartmentWindowShutterReferenceItemsFromPlacedItems(referencePlacedItems).map(
    (template) => adaptStandardWindowShutterPlacementForUnit(template, unitId),
  );
}

/**
 * Replace authored shutter rows with the current reference pair, mirrored for west units.
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
    ...standardApartmentWindowShutterPlacedItemsForUnit(unitId, placedItems),
  ];
}

export function eastReferenceFxForStandardWindowShutterId(shutterId: string): number | null {
  const row = APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES.find((t) => t.id === shutterId);
  return row?.fx ?? null;
}

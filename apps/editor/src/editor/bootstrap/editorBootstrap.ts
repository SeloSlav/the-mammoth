import {
  BuildingDocSchema,
  CellDocSchema,
  ElevatorCabDefSchema,
  FloorDocSchema,
  FloorOverrideDocSchema,
  InteriorDocSchema,
  LandingKitDefSchema,
  OwnedApartmentBuiltinsDocSchema,
  PrefabDefSchema,
  StairWellDefSchema,
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  type BuildingDoc,
  type CellDoc,
  type FloorDoc,
  type FloorOverrideDoc,
  type InteriorDoc,
  type PrefabDef,
} from "@the-mammoth/schemas";
import { useEditorStore } from "../../state/editorStore.js";
import type { LandingKitVariant } from "../../state/editorStoreTypes.js";
import {
  type EditorContentIndex,
  EDITOR_APARTMENT_KIT_FILE,
  EDITOR_BUILDING_FILE,
  EDITOR_ELEVATOR_DIR,
  EDITOR_OWNED_APT_BUILTINS_FILE,
} from "../content/editorContentDiscovery.js";

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

function uniqueFloorDocIds(building: BuildingDoc): string[] {
  return [...new Set(building.floorRefs.map((r) => r.floorDocId))];
}

function collectInteriorDocIds(building: BuildingDoc): string[] {
  const s = new Set<string>();
  for (const c of building.cores) {
    if (c.interiorDocId) s.add(c.interiorDocId);
  }
  for (const u of building.units) s.add(u.interiorTemplateId);
  for (const t of building.slotTemplates) s.add(t.interiorTemplateId);
  return [...s];
}

async function fetchEditorContentIndex(building: BuildingDoc): Promise<EditorContentIndex> {
  try {
    return (await fetchJson("/__editor/content-index")) as EditorContentIndex;
  } catch {
    return {
      buildingPath: EDITOR_BUILDING_FILE,
      floorDocIds: uniqueFloorDocIds(building),
      interiorDocIds: collectInteriorDocIds(building),
      cellDocIds: ["cell_0_0"],
      prefabDefIds: [],
      floorOverrideDocIds: [],
      elevatorCabRelPath: `${EDITOR_ELEVATOR_DIR}/cab.json`,
      landingKitRelPath: `${EDITOR_ELEVATOR_DIR}/landing_kit.json`,
      apartmentKitRelPath: EDITOR_APARTMENT_KIT_FILE,
      stairWellRelPath: `${EDITOR_ELEVATOR_DIR}/stairwell.json`,
      materialTextureUrls: [],
    };
  }
}

export async function bootstrapEditorFromContent(): Promise<void> {
  const rawBuilding = await fetchJson(`/content/${EDITOR_BUILDING_FILE}`);
  const building = BuildingDocSchema.parse(rawBuilding);
  const contentIndex = await fetchEditorContentIndex(building);

  const floorIds =
    contentIndex.floorDocIds.length > 0 ? contentIndex.floorDocIds : uniqueFloorDocIds(building);
  const floorDocs: Record<string, FloorDoc> = {};
  for (const id of floorIds) {
    const doc = FloorDocSchema.parse(
      await fetchJson(`/content/building/floors/${id}.json`),
    );
    floorDocs[id] = doc;
  }

  const interiorIds =
    contentIndex.interiorDocIds.length > 0
      ? contentIndex.interiorDocIds
      : collectInteriorDocIds(building);
  const interiorDocs: Record<string, InteriorDoc> = {};
  for (const id of interiorIds) {
    interiorDocs[id] = InteriorDocSchema.parse(
      await fetchJson(`/content/interiors/${id}.json`),
    );
  }

  const cellDocs: Record<string, CellDoc> = {};
  for (const id of contentIndex.cellDocIds) {
    cellDocs[id] = CellDocSchema.parse(await fetchJson(`/content/cells/${id}.json`));
  }

  const prefabDefs: Record<string, PrefabDef> = {};
  for (const id of contentIndex.prefabDefIds) {
    prefabDefs[id] = PrefabDefSchema.parse(await fetchJson(`/content/prefabs/${id}.json`));
  }

  const floorOverrideDocs: Record<string, FloorOverrideDoc> = {};
  for (const id of contentIndex.floorOverrideDocIds) {
    floorOverrideDocs[id] = FloorOverrideDocSchema.parse(
      await fetchJson(`/content/building/floor-overrides/${id}.json`),
    );
  }

  let elevatorCabDef: import("@the-mammoth/schemas").ElevatorCabDef | undefined;
  let landingKitDef: import("@the-mammoth/schemas").LandingKitDef | undefined;
  let apartmentKitDef: import("@the-mammoth/schemas").LandingKitDef | undefined;
  let stairWellDef: import("@the-mammoth/schemas").StairWellDef | undefined;
  try {
    elevatorCabDef = ElevatorCabDefSchema.parse(await fetchJson(`/content/elevator/cab.json`));
  } catch {
    /* optional until first save */
  }
  try {
    landingKitDef = LandingKitDefSchema.parse(
      await fetchJson(`/content/elevator/landing_kit.json`),
    );
  } catch {
    /* optional */
  }
  try {
    apartmentKitDef = LandingKitDefSchema.parse(
      await fetchJson(`/content/${contentIndex.apartmentKitRelPath}`),
    );
  } catch {
    /* optional — falls back to DEFAULT_APARTMENT_KIT_DEF until authored */
  }
  try {
    stairWellDef = StairWellDefSchema.parse(
      await fetchJson(`/content/elevator/stairwell.json`),
    );
  } catch {
    /* optional */
  }

  let ownedApartmentBuiltins = DEFAULT_OWNED_APARTMENT_BUILTINS_DOC;
  try {
    ownedApartmentBuiltins = OwnedApartmentBuiltinsDocSchema.parse(
      await fetchJson(`/content/${EDITOR_OWNED_APT_BUILTINS_FILE}`),
    );
  } catch {
    /* optional */
  }

  const sorted = [...building.floorRefs].sort(
    (a, b) => a.levelIndex - b.levelIndex,
  );
  const first = sorted[0];

  useEditorStore.setState((s) => ({
    building,
    floorDocs,
    interiorDocs,
    cellDocs,
    prefabDefs,
    floorOverrideDocs,
    contentIndex,
    ownedApartmentBuiltins,
    ...(elevatorCabDef ? { elevatorCabDef } : {}),
    // Bootstrap always lands on the elevator variant so the freshly parsed `landingKitDef` matches
    // what the existing scene-runtime + inspector code expects. Authoring is swapped post-load via
    // `setLandingKitVariant` from the outliner.
    landingKitVariant: "elevator" as LandingKitVariant,
    ...(landingKitDef ? { landingKitDef } : {}),
    ...(apartmentKitDef ? { inactiveLandingKitDef: apartmentKitDef } : {}),
    ...(stairWellDef ? { stairWellDef } : {}),
    activeFloorDocId: first?.floorDocId ?? floorIds[0] ?? "floor_mamutica_ground",
    focusedStoryLevelIndex: first?.levelIndex ?? 1,
    activeInteriorDocId: interiorIds[0] ?? "lobby_central",
      activeCellDocId: contentIndex.cellDocIds[0] ?? "cell_0_0",
      activePrefabDefId: contentIndex.prefabDefIds[0] ?? null,
      activeFloorOverrideDocId:
        first?.floorOverrideDocId ??
        contentIndex.floorOverrideDocIds.find((id) =>
          id.startsWith(`${building.id}__L${String(first?.levelIndex ?? 1).padStart(2, "0")}`),
        ) ??
        null,
    selectedId: null,
    dirty: false,
    historyPast: [],
    historyFuture: [],
    contentStructureEpoch: s.contentStructureEpoch + 1,
  }));
}

export async function reloadEditorFromContent(): Promise<void> {
  await bootstrapEditorFromContent();
}

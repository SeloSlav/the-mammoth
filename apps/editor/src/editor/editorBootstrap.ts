import {
  BuildingDocSchema,
  FloorDocSchema,
  InteriorDocSchema,
  type BuildingDoc,
  type FloorDoc,
  type InteriorDoc,
} from "@the-mammoth/schemas";
import { useEditorStore } from "../state/editorStore.js";

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

export async function bootstrapEditorFromContent(): Promise<void> {
  const rawBuilding = await fetchJson("/content/building/mammoth.json");
  const building = BuildingDocSchema.parse(rawBuilding);

  const floorIds = uniqueFloorDocIds(building);
  const floorDocs: Record<string, FloorDoc> = {};
  for (const id of floorIds) {
    const doc = FloorDocSchema.parse(
      await fetchJson(`/content/building/floors/${id}.json`),
    );
    floorDocs[id] = doc;
  }

  const interiorIds = collectInteriorDocIds(building);
  const interiorDocs: Record<string, InteriorDoc> = {};
  for (const id of interiorIds) {
    interiorDocs[id] = InteriorDocSchema.parse(
      await fetchJson(`/content/interiors/${id}.json`),
    );
  }

  const sorted = [...building.floorRefs].sort(
    (a, b) => a.levelIndex - b.levelIndex,
  );
  const first = sorted[0];

  useEditorStore.setState({
    building,
    floorDocs,
    interiorDocs,
    activeFloorDocId: first?.floorDocId ?? floorIds[0] ?? "floor_mamutica_ground",
    focusedStoryLevelIndex: first?.levelIndex ?? 1,
    activeInteriorDocId: interiorIds[0] ?? "lobby_central",
    selectedId: null,
    dirty: false,
    historyPast: [],
    historyFuture: [],
  });
}

export async function reloadEditorFromContent(): Promise<void> {
  await bootstrapEditorFromContent();
}

import type { CellDoc, FloorDoc, InteriorDoc, PrefabDef } from "@the-mammoth/schemas";

export function collectPrefabIdsFromFloors(floorDocs: Record<string, FloorDoc>): string[] {
  const s = new Set<string>();
  for (const d of Object.values(floorDocs)) {
    for (const o of d.objects) s.add(o.prefabId);
  }
  return [...s].sort();
}

export function collectPrefabIdsFromInteriors(
  interiorDocs: Record<string, InteriorDoc>,
): string[] {
  const s = new Set<string>();
  for (const d of Object.values(interiorDocs)) {
    for (const p of d.placements) {
      if (p.prefabId) s.add(p.prefabId);
    }
  }
  return [...s].sort();
}

export function collectPrefabIdsFromCells(cellDocs: Record<string, CellDoc>): string[] {
  const s = new Set<string>();
  for (const d of Object.values(cellDocs)) {
    for (const p of d.placements) {
      if (p.prefabId) s.add(p.prefabId);
    }
  }
  return [...s].sort();
}

export function collectPrefabIdsFromPrefabDefs(
  prefabDefs: Record<string, PrefabDef>,
): string[] {
  const s = new Set<string>();
  for (const d of Object.values(prefabDefs)) {
    s.add(d.id);
    for (const c of d.components) {
      if (c.prefabId) s.add(c.prefabId);
    }
  }
  return [...s].sort();
}

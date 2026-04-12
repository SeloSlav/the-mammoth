import * as THREE from "three";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import { addStairWellPlaceholder } from "./stairElevatorPlaceholders.js";

/** Typical floor doc id (content + generator). */
export const TYPICAL_FLOOR_DOC_ID = "floor_mamutica_typical";

/** Match `DEFAULT_BUILDING_FLOOR_SPACING_M` / `gen-mamutica-floor-doc.mjs`. */
export const STOREY_SPACING_M = 60 / 19;

const CORE_PY = STOREY_SPACING_M * 0.5 + 0.08;

export type BuildingStairShaftSpec = {
  /** Stable key for skipping per-floor placeholders / walk duplicates. */
  planKey: string;
  id: string;
  px: number;
  pz: number;
  sx: number;
  syPlate: number;
  sz: number;
  megaSy: number;
  centerY: number;
};

export function shaftPlanKey(px: number, pz: number): string {
  const rx = Math.round(px * 100) / 100;
  const rz = Math.round(pz * 100) / 100;
  return `${rx},${rz}`;
}

function isStairPrefab(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("stair_well") || p.includes("stairwell");
}

/**
 * One full-height shaft mesh + walk volume per **distinct stair column** (grouped by plan XZ).
 * Vertical span always matches the **whole building stack** (ground → top storey) so every
 * stairwell reads as one continuous shaft.
 */
export function getBuildingStairShaftSpecs(
  _building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  sortedRefs: readonly { levelIndex: number; floorDocId: string }[],
  spacing: number,
): BuildingStairShaftSpec[] {
  if (sortedRefs.length === 0) return [];

  const levelMin = Math.min(...sortedRefs.map((r) => r.levelIndex));
  const levelMax = Math.max(...sortedRefs.map((r) => r.levelIndex));

  type Acc = { id: string; px: number; pz: number; sx: number; sz: number; syPlate: number };
  const map = new Map<string, Acc>();

  for (const ref of sortedRefs) {
    const doc = getFloorDoc(ref.floorDocId);
    for (const obj of doc.objects) {
      if (!isStairPrefab(obj.prefabId)) continue;
      const [px, , pz] = obj.position;
      const sx = obj.scale?.[0] ?? 1;
      const syPlate = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;
      const key = shaftPlanKey(px, pz);
      const ex = map.get(key);
      if (!ex) {
        map.set(key, { id: obj.id, px, pz, sx, sz, syPlate });
      } else {
        ex.sx = Math.max(ex.sx, sx);
        ex.sz = Math.max(ex.sz, sz);
        ex.syPlate = Math.max(ex.syPlate, syPlate);
      }
    }
  }

  if (map.size === 0) return [];

  const globalBottom =
    (levelMin - 1) * spacing + CORE_PY - STOREY_SPACING_M * 0.5;
  const globalTop =
    (levelMax - 1) * spacing + CORE_PY + STOREY_SPACING_M * 0.5;
  const megaSy = globalTop - globalBottom;
  const centerY = (globalBottom + globalTop) * 0.5;

  const out: BuildingStairShaftSpec[] = [];
  for (const [planKey, s] of map) {
    out.push({
      planKey,
      id: s.id,
      px: s.px,
      pz: s.pz,
      sx: s.sx,
      syPlate: s.syPlate,
      sz: s.sz,
      megaSy,
      centerY,
    });
  }
  return out;
}

export function addBuildingStairShaftColumnsToRoot(
  root: THREE.Group,
  specs: readonly BuildingStairShaftSpec[],
  _sortedRefs: readonly { levelIndex: number; floorDocId: string }[],
  _getFloorDoc: (floorDocId: string) => FloorDoc,
  _spacing: number,
): void {
  if (specs.length === 0) return;
  for (const s of specs) {
    const col = new THREE.Group();
    col.name = `stair_shaft:${s.id}`;
    col.position.set(s.px, s.centerY, s.pz);
    const climbFull = s.megaSy > STOREY_SPACING_M * 1.25;
    /** No `groundDoor`: stair–corridor wall cutouts disabled (solid shaft shell). */
    addStairWellPlaceholder(col, s.sx, s.megaSy, s.sz, {
      climbFullShaft: climbFull,
      omitGroundStoreyCornerLandings: true,
    });
    root.add(col);
  }
}

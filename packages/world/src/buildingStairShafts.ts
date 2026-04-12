import * as THREE from "three";
import type { BuildingDoc, FloorDoc } from "@the-mammoth/schemas";
import {
  addStairWellPlaceholder,
  computeStairDoorSnapForPlaceholder,
  SHAFT_DOUBLE_DOOR_H,
} from "./stairElevatorPlaceholders.js";
import {
  corridorFlushGapForShaftDoor,
  firstCorridorOrLobbyFromFloor,
} from "./shaftCorridorFlush.js";
import { pickCornerLandingNearDoorBand } from "./stairWellGeometry.js";

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
 * First authored stair on this shaft: plate-aligned Y in mega-column local space (landing pick
 * for {@link computeStairDoorSnapForPlaceholder}). Exported so mega **corridor punches** use the
 * same hint as {@link addBuildingStairShaftColumnsToRoot} (one tangent for the full-height shell).
 */
export function firstStairDoorBandTargetYLocal(
  sortedRefs: readonly { levelIndex: number; floorDocId: string }[],
  getFloorDoc: (floorDocId: string) => FloorDoc,
  s: BuildingStairShaftSpec,
  spacing: number,
): number | undefined {
  const key = shaftPlanKey(s.px, s.pz);
  for (const ref of sortedRefs) {
    const doc = getFloorDoc(ref.floorDocId);
    const stair = doc.objects.find(
      (o) =>
        isStairPrefab(o.prefabId) &&
        shaftPlanKey(o.position[0], o.position[2]) === key,
    );
    if (!stair) continue;
    const plateY = (ref.levelIndex - 1) * spacing;
    return plateY + stair.position[1] - s.centerY;
  }
  return undefined;
}

/** Wall-local Y bands for each stacked storey (mega column), aligned to corner landings at the door face. */
function collectCorridorDoorBandsLocalY(
  sortedRefs: readonly { levelIndex: number; floorDocId: string }[],
  getFloorDoc: (floorDocId: string) => FloorDoc,
  s: BuildingStairShaftSpec,
  acx: number,
  acz: number,
  spacing: number,
): { y0: number; y1: number }[] {
  const key = shaftPlanKey(s.px, s.pz);
  const climbFull = s.megaSy > STOREY_SPACING_M * 1.25;
  const groundDoor = {
    bandHeightM: s.megaSy,
    towardPlateXZ: [acx, acz] as const,
    shaftPlateXZ: [s.px, s.pz] as const,
  };
  const doorBandTargetYForLandingPick = firstStairDoorBandTargetYLocal(
    sortedRefs,
    getFloorDoc,
    s,
    spacing,
  );
  const snap = computeStairDoorSnapForPlaceholder(
    s.sx,
    s.megaSy,
    s.sz,
    groundDoor,
    { climbFullShaft: climbFull, doorBandTargetYForLandingPick },
  );
  const tangSnap = snap.tangentOffsetAlongWall;
  const out: { y0: number; y1: number }[] = [];
  const halfOpen = SHAFT_DOUBLE_DOOR_H * 0.5 + 0.12;
  for (const ref of sortedRefs) {
    const doc = getFloorDoc(ref.floorDocId);
    const stair = doc.objects.find(
      (o) =>
        isStairPrefab(o.prefabId) &&
        shaftPlanKey(o.position[0], o.position[2]) === key,
    );
    if (!stair) continue;
    const plateY = (ref.levelIndex - 1) * spacing;
    const targetY = plateY + stair.position[1] - s.centerY;
    const land = pickCornerLandingNearDoorBand(
      snap.L,
      snap.face,
      tangSnap,
      snap.doorHalfW,
      targetY,
    );
    const mid = land ? land.y : targetY;
    out.push({ y0: mid - halfOpen, y1: mid + halfOpen });
  }
  return out;
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
  sortedRefs: readonly { levelIndex: number; floorDocId: string }[],
  getFloorDoc: (floorDocId: string) => FloorDoc,
  spacing: number,
): void {
  if (specs.length === 0) return;
  const acx = specs.reduce((a, s) => a + s.px, 0) / specs.length;
  const acz = specs.reduce((a, s) => a + s.pz, 0) / specs.length;

  let corridorFp = undefined as
    | ReturnType<typeof firstCorridorOrLobbyFromFloor>
    | undefined;
  for (const ref of sortedRefs) {
    corridorFp = firstCorridorOrLobbyFromFloor(getFloorDoc(ref.floorDocId));
    if (corridorFp) break;
  }

  for (const s of specs) {
    const col = new THREE.Group();
    col.name = `stair_shaft:${s.id}`;
    col.position.set(s.px, s.centerY, s.pz);
    const climbFull = s.megaSy > STOREY_SPACING_M * 1.25;
    const doorBandTargetYForLandingPick = firstStairDoorBandTargetYLocal(
      sortedRefs,
      getFloorDoc,
      s,
      spacing,
    );
    const stairSnap = computeStairDoorSnapForPlaceholder(
      s.sx,
      s.megaSy,
      s.sz,
      {
        bandHeightM: s.megaSy,
        towardPlateXZ: [acx, acz],
        shaftPlateXZ: [s.px, s.pz],
      },
      { climbFullShaft: climbFull, doorBandTargetYForLandingPick },
    );
    let stairFlush: number | undefined;
    if (corridorFp) {
      const g = corridorFlushGapForShaftDoor(
        stairSnap.face,
        s.px,
        s.pz,
        s.sx * 0.5,
        s.sz * 0.5,
        corridorFp,
      );
      if (g > 1e-4) stairFlush = Math.min(0.35, g);
    }
    addStairWellPlaceholder(col, s.sx, s.megaSy, s.sz, {
      climbFullShaft: climbFull,
      groundDoor: {
        bandHeightM: s.megaSy,
        towardPlateXZ: [acx, acz],
        shaftPlateXZ: [s.px, s.pz],
      },
      doorBandTargetYForLandingPick,
      corridorDoorBandsLocalY: collectCorridorDoorBandsLocalY(
        sortedRefs,
        getFloorDoc,
        s,
        acx,
        acz,
        spacing,
      ),
      corridorFlushGapM: stairFlush,
      omitGroundStoreyCornerLandings: true,
    });
    root.add(col);
  }
}

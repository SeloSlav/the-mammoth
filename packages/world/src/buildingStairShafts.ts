import * as THREE from "three";
import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import {
  addStairWellPlaceholder,
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
  type StairWellGroundDoorContext,
} from "./stairElevatorPlaceholders.js";
import { stairwellLitterScatterSeed } from "./stairwellCigaretteLitter.js";
import {
  exteriorFacesForPlacedObjectInFloor,
  shaftFacesTowardAdjacentElevatorHoistways,
} from "./exteriorFaceExposure.js";
import { shaftDoorTowardPointFromFloorCorridors } from "./shaftCorridorFlush.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import {
  type FloorShortLabelMap,
  shortFloorLabelForLevel,
} from "./buildingFloorLabels.js";

/**
 * Reads optional authored facade direction on stair/elevator `PlacedObject.metadata`
 * (e.g. Mamutica `"side": "east"`). Geometry-only detection misses shafts inset from the plate
 * AABB when units extend past the core (east stair wall is ~0.6 m inside `max.x`).
 */
export function readShaftFacadeHintFaces(metadata: unknown): CardinalFace[] {
  if (!metadata || typeof metadata !== "object") return [];
  const sideRaw = (metadata as { side?: unknown }).side;
  if (typeof sideRaw !== "string") return [];
  const side = sideRaw.trim().toLowerCase();
  if (!side) return [];
  const map: Record<string, CardinalFace> = {
    east: "e",
    west: "w",
    north: "n",
    south: "s",
    e: "e",
    w: "w",
    n: "n",
    s: "s",
  };
  const face = map[side];
  return face ? [face] : [];
}

/** Union geometry-exposed faces with optional authored hints (deduped). */
export function mergeShaftExteriorHints(
  geometryFaces: readonly CardinalFace[],
  hint: readonly CardinalFace[] | undefined,
): CardinalFace[] {
  if (!hint?.length) return [...geometryFaces];
  return [...new Set<CardinalFace>([...hint, ...geometryFaces])];
}

/** Typical floor doc id (content + generator). */
export const TYPICAL_FLOOR_DOC_ID = "floor_mamutica_typical";

/** Match `DEFAULT_BUILDING_FLOOR_SPACING_M` / `gen-mamutica-floor-doc.mjs`. */
export const STOREY_SPACING_M = 60 / 19;

/**
 * Hoistway / stair-shell height from authored `scale.y` can sit slightly below `storeySpacing`,
 * leaving visible seams between stacked segments — stretch the shell to the storey pitch.
 */
export function shaftStackSy(syPlate: number, storeySpacing: number): number {
  return Math.max(syPlate, storeySpacing);
}

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
  bottomY: number;
  storeyCount: number;
  storeySpacing: number;
  /** Lowest `levelIndex` in the building stack (aligns segment `i` with per-floor plate `story`). */
  minLevelIndex: number;
  entryDoorContexts: readonly (StairWellGroundDoorContext | undefined)[];
  /** Shaft faces flush with the merged floor-plate footprint (plate-space); facade PBR on these only. */
  exteriorShaftFaces: readonly CardinalFace[];
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
  const entryDoorContextsByKey = new Map<string, (StairWellGroundDoorContext | undefined)[]>();
  const facadeHintByKey = new Map<string, CardinalFace[]>();

  for (const [refIndex, ref] of sortedRefs.entries()) {
    const doc = getFloorDoc(ref.floorDocId);
    let plateCx = 0;
    let plateCz = 0;
    for (const obj of doc.objects) {
      plateCx += obj.position[0];
      plateCz += obj.position[2];
    }
    if (doc.objects.length > 0) {
      plateCx /= doc.objects.length;
      plateCz /= doc.objects.length;
    }
    for (const obj of doc.objects) {
      if (!isStairPrefab(obj.prefabId)) continue;
      const [px, , pz] = obj.position;
      const sx = obj.scale?.[0] ?? 1;
      const syPlate = obj.scale?.[1] ?? 1;
      const sz = obj.scale?.[2] ?? 1;
      const key = shaftPlanKey(px, pz);
      const hint = readShaftFacadeHintFaces(obj.metadata);
      if (hint.length > 0 && !facadeHintByKey.has(key)) {
        facadeHintByKey.set(key, hint);
      }
      const ex = map.get(key);
      if (!ex) {
        map.set(key, { id: obj.id, px, pz, sx, sz, syPlate });
      } else {
        ex.sx = Math.max(ex.sx, sx);
        ex.sz = Math.max(ex.sz, sz);
        ex.syPlate = Math.max(ex.syPlate, syPlate);
      }
      const contexts = entryDoorContextsByKey.get(key) ?? Array.from({ length: sortedRefs.length });
      contexts[refIndex] = {
        towardPlateXZ: shaftDoorTowardPointFromFloorCorridors(px, pz, doc, plateCx, plateCz),
        shaftPlateXZ: [px, pz],
      };
      entryDoorContextsByKey.set(key, contexts);
    }
  }

  if (map.size === 0) return [];

  const exposedFacesByKey = new Map<string, CardinalFace[]>();
  const towardElevatorFacesByKey = new Map<string, CardinalFace[]>();
  for (const ref of sortedRefs) {
    const doc = getFloorDoc(ref.floorDocId);
    for (const obj of doc.objects) {
      if (!isStairPrefab(obj.prefabId)) continue;
      const key = shaftPlanKey(obj.position[0], obj.position[2]);
      const faces = exteriorFacesForPlacedObjectInFloor(doc, obj);
      if (faces.length > 0) {
        exposedFacesByKey.set(
          key,
          [...new Set<CardinalFace>([...(exposedFacesByKey.get(key) ?? []), ...faces])],
        );
      }
      const elevFaces = shaftFacesTowardAdjacentElevatorHoistways(doc, obj);
      if (elevFaces.length > 0) {
        towardElevatorFacesByKey.set(
          key,
          [...new Set<CardinalFace>([...(towardElevatorFacesByKey.get(key) ?? []), ...elevFaces])],
        );
      }
    }
  }

  const globalBottom =
    (levelMin - 1) * spacing + CORE_PY - STOREY_SPACING_M * 0.5;
  const storeyCount = levelMax - levelMin + 1;
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
      bottomY: globalBottom,
      storeyCount,
      storeySpacing: spacing,
      minLevelIndex: levelMin,
      entryDoorContexts: entryDoorContextsByKey.get(planKey) ?? [],
      exteriorShaftFaces: [
        ...new Set<CardinalFace>([
          ...mergeShaftExteriorHints(
            exposedFacesByKey.get(planKey) ?? [],
            facadeHintByKey.get(planKey),
          ),
          ...(towardElevatorFacesByKey.get(planKey) ?? []),
        ]),
      ],
    });
  }
  return out;
}

/** One contiguous stair-well column mesh stack (segments per storey); see {@link addBuildingStairShaftColumnsToRoot}. */
export function addBuildingStairShaftColumnToRoot(
  root: THREE.Group,
  s: BuildingStairShaftSpec,
  stairWellDef?: StairWellDef,
  floorShortLabels?: FloorShortLabelMap,
): void {
  const col = new THREE.Group();
  col.name = `stair_shaft:${s.id}`;
  col.userData.mammothStairColumnRoot = true;
  col.position.set(s.px, 0, s.pz);
  for (let i = 0; i < s.storeyCount; i++) {
    const isTopStorey = i === s.storeyCount - 1;
    const segment = new THREE.Group();
    segment.name = `stair_shaft_segment_${i}`;
    segment.userData.mammothPlateLevelIndex = s.minLevelIndex + i;
    segment.position.y = s.bottomY + STOREY_SPACING_M * 0.5 + i * s.storeySpacing;
    const authoringScope = i === 0 ? "ground" : "typical";
    const sySeg = shaftStackSy(s.syPlate, s.storeySpacing);
    const resolvedDoor = resolveStairWellGroundDoor({
      sx: s.sx,
      sy: sySeg,
      sz: s.sz,
      context: s.entryDoorContexts[i],
      def: stairWellDef,
      authoringScope,
    });
    const resolvedGroundDoor = resolvedDoor?.groundDoor;
    const supplementalDoors = resolveStairWellSupplementalDoors({
      sx: s.sx,
      sy: sySeg,
      sz: s.sz,
      context: s.entryDoorContexts[i],
      def: stairWellDef,
      authoringScope,
      primaryDoor: resolvedDoor,
    });
    const shaftExteriorFaceSet = new Set<CardinalFace>(s.exteriorShaftFaces);
    if (i === 0) {
      const f = resolvedGroundDoor?.face;
      if (f) shaftExteriorFaceSet.add(f);
      for (const sup of supplementalDoors) {
        if (sup.face) shaftExteriorFaceSet.add(sup.face);
      }
    }
    col.add(segment);
    const storyLevelIndex = s.minLevelIndex + i;
    addStairWellPlaceholder(segment, s.sx, sySeg, s.sz, {
      omitGroundStoreyCornerLandings: i === 0,
      def: stairWellDef,
      authoringScope,
      groundDoor: resolvedGroundDoor,
      supplementalDoors,
      includeCeiling: isTopStorey,
      omitTreads: isTopStorey,
      omitTopLanding: isTopStorey,
      isTopOccupiedStairStorey:
        s.storeyCount >= 2 && !isTopStorey && i === s.storeyCount - 2,
      shaftExteriorFaces: [...shaftExteriorFaceSet],
      interiorWallUvAlternated: (s.minLevelIndex + i - 1) % 2 === 1,
      segmentScatterSeed: stairwellLitterScatterSeed(s.planKey, i),
      stairGraphicsMergeRoot: col,
      storyLevelIndex,
      storyShortLabel: shortFloorLabelForLevel(storyLevelIndex, floorShortLabels),
    });
  }
  root.add(col);
}

/** Stair columns: one segment group per storey (band-culled in FP via `mammothPlateLevelIndex`). */
export function addBuildingStairShaftColumnsToRoot(
  root: THREE.Group,
  specs: readonly BuildingStairShaftSpec[],
  stairWellDef?: StairWellDef,
  floorShortLabels?: FloorShortLabelMap,
): void {
  if (specs.length === 0) return;
  for (const s of specs) {
    addBuildingStairShaftColumnToRoot(root, s, stairWellDef, floorShortLabels);
  }
}

/**
 * Same meshes as {@link addBuildingStairShaftColumnsToRoot}, yielding between each stair column root
 * so ground-mesh authoring does not stall the login thread on multi-shaft footprints.
 */
export async function addBuildingStairShaftColumnsToRootYielding(
  root: THREE.Group,
  specs: readonly BuildingStairShaftSpec[],
  stairWellDef: StairWellDef | undefined,
  yieldAfterEachColumn: () => Promise<void>,
  floorShortLabels?: FloorShortLabelMap,
): Promise<void> {
  if (specs.length === 0) return;
  for (const s of specs) {
    addBuildingStairShaftColumnToRoot(root, s, stairWellDef, floorShortLabels);
    await yieldAfterEachColumn();
  }
}

import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import type { CardinalFace } from "./wallWithDoorCutout.js";

const SHAFT_FLUSH_TOUCH_M = 0.55;
const SHAFT_FLUSH_PENETRATE_M = 0.08;

const OUTWARD_BLOCK_EPS_M = 0.08;
const MAX_UNIT_BLOCKING_GAP_M = 0.02;
const MAX_NON_UNIT_BLOCKING_GAP_M = 0.6;
const MIN_EXPOSED_SPAN_M = 0.2;
const MIN_BLOCKING_OVERLAP_M = 0.08;

type Span = readonly [number, number];

function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  let cur0 = sorted[0]![0];
  let cur1 = sorted[0]![1];
  for (let i = 1; i < sorted.length; i++) {
    const [s0, s1] = sorted[i]!;
    if (s0 <= cur1 + OUTWARD_BLOCK_EPS_M) {
      cur1 = Math.max(cur1, s1);
    } else {
      out.push([cur0, cur1]);
      cur0 = s0;
      cur1 = s1;
    }
  }
  out.push([cur0, cur1]);
  return out;
}

function hasMeaningfulGap(faceSpan: Span, covered: readonly Span[]): boolean {
  let cursor = faceSpan[0];
  for (const [s0, s1] of covered) {
    if (s0 > cursor + MIN_EXPOSED_SPAN_M) return true;
    cursor = Math.max(cursor, s1);
  }
  return faceSpan[1] > cursor + MIN_EXPOSED_SPAN_M;
}

function objectBounds(obj: PlacedObject): {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
} {
  const sx = obj.scale?.[0] ?? 1;
  const sz = obj.scale?.[2] ?? 1;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  return {
    x0: obj.position[0] - hx,
    x1: obj.position[0] + hx,
    z0: obj.position[2] - hz,
    z1: obj.position[2] + hz,
  };
}

function isUnitPrefab(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("apartment") || p.includes("unit");
}

/**
 * Faces that remain visible to the outside because no other axis-aligned room/core shell extends
 * farther outward over a meaningful overlap span on that side.
 */
export function exteriorFacesForPlacedObjectInFloor(
  floor: FloorDoc,
  obj: PlacedObject,
): CardinalFace[] {
  if (obj.rotation) return [];
  const a = objectBounds(obj);
  const blockers = {
    e: [] as Span[],
    w: [] as Span[],
    n: [] as Span[],
    s: [] as Span[],
  };

  for (const other of floor.objects) {
    if (other.id === obj.id || other.rotation) continue;
    const b = objectBounds(other);
    const maxGap = isUnitPrefab(other.prefabId)
      ? MAX_UNIT_BLOCKING_GAP_M
      : MAX_NON_UNIT_BLOCKING_GAP_M;

    const zw0 = Math.max(a.z0, b.z0);
    const zw1 = Math.min(a.z1, b.z1);
    const zw = zw1 - zw0;
    if (zw > MIN_BLOCKING_OVERLAP_M) {
      if (b.x0 <= a.x1 + maxGap && b.x1 > a.x1 + OUTWARD_BLOCK_EPS_M) {
        blockers.e.push([zw0, zw1]);
      }
      if (b.x1 >= a.x0 - maxGap && b.x0 < a.x0 - OUTWARD_BLOCK_EPS_M) {
        blockers.w.push([zw0, zw1]);
      }
    }

    const xw0 = Math.max(a.x0, b.x0);
    const xw1 = Math.min(a.x1, b.x1);
    const xw = xw1 - xw0;
    if (xw > MIN_BLOCKING_OVERLAP_M) {
      if (b.z0 <= a.z1 + maxGap && b.z1 > a.z1 + OUTWARD_BLOCK_EPS_M) {
        blockers.n.push([xw0, xw1]);
      }
      if (b.z1 >= a.z0 - maxGap && b.z0 < a.z0 - OUTWARD_BLOCK_EPS_M) {
        blockers.s.push([xw0, xw1]);
      }
    }
  }

  const out: CardinalFace[] = [];
  if (hasMeaningfulGap([a.z0, a.z1], mergeSpans(blockers.e))) out.push("e");
  if (hasMeaningfulGap([a.z0, a.z1], mergeSpans(blockers.w))) out.push("w");
  if (hasMeaningfulGap([a.x0, a.x1], mergeSpans(blockers.n))) out.push("n");
  if (hasMeaningfulGap([a.x0, a.x1], mergeSpans(blockers.s))) out.push("s");
  return out;
}

function spanOverlap1D(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * Axis-aligned shaft sides of `obj` that sit flush against another footprint whose prefab
 * matches `neighborMatcher`. Used so core-to-core faces (e.g. stair ↔ elevator) still get facade
 * PBR on the outward shell — {@link exteriorFacesForPlacedObjectInFloor} treats the neighbor as a
 * blocker and omits those cardinals.
 */
export function shaftPerimeterFacesFlushAgainstPrefabs(
  floor: FloorDoc,
  obj: PlacedObject,
  neighborMatcher: (prefabId: string) => boolean,
): CardinalFace[] {
  if (obj.rotation) return [];
  const a = objectBounds(obj);
  const out = new Set<CardinalFace>();

  for (const other of floor.objects) {
    if (other.id === obj.id || other.rotation || !neighborMatcher(other.prefabId)) continue;
    const b = objectBounds(other);

    const zOverlap = spanOverlap1D(a.z0, a.z1, b.z0, b.z1);
    if (zOverlap > MIN_BLOCKING_OVERLAP_M) {
      if (
        b.x0 <= a.x1 + SHAFT_FLUSH_TOUCH_M &&
        b.x0 >= a.x1 - SHAFT_FLUSH_PENETRATE_M
      ) {
        out.add("e");
      }
      if (
        b.x1 >= a.x0 - SHAFT_FLUSH_TOUCH_M &&
        b.x1 <= a.x0 + SHAFT_FLUSH_PENETRATE_M
      ) {
        out.add("w");
      }
    }

    const xOverlap = spanOverlap1D(a.x0, a.x1, b.x0, b.x1);
    if (xOverlap > MIN_BLOCKING_OVERLAP_M) {
      if (
        b.z0 <= a.z1 + SHAFT_FLUSH_TOUCH_M &&
        b.z0 >= a.z1 - SHAFT_FLUSH_PENETRATE_M
      ) {
        out.add("n");
      }
      if (
        b.z1 >= a.z0 - SHAFT_FLUSH_TOUCH_M &&
        b.z1 <= a.z0 + SHAFT_FLUSH_PENETRATE_M
      ) {
        out.add("s");
      }
    }
  }

  return [...out];
}

export function shaftFacesTowardAdjacentElevatorHoistways(
  floor: FloorDoc,
  obj: PlacedObject,
): CardinalFace[] {
  return shaftPerimeterFacesFlushAgainstPrefabs(floor, obj, (prefabId) =>
    prefabId.toLowerCase().includes("elevator"),
  );
}

export function shaftFacesTowardAdjacentStairwells(
  floor: FloorDoc,
  obj: PlacedObject,
): CardinalFace[] {
  return shaftPerimeterFacesFlushAgainstPrefabs(floor, obj, (prefabId) => {
    const p = prefabId.toLowerCase();
    return p.includes("stair_well") || p.includes("stairwell");
  });
}

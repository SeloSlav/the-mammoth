import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";

type XzRect = { x0: number; x1: number; z0: number; z1: number };

function placedFootprintXz(o: PlacedObject): XzRect {
  const [px, , pz] = o.position;
  const sx = o.scale?.[0] ?? 1;
  const sz = o.scale?.[2] ?? 1;
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  return { x0: px - hx, x1: px + hx, z0: pz - hz, z1: pz + hz };
}

function xzRectsOverlap(a: XzRect, b: XzRect): boolean {
  return a.x1 > b.x0 && a.x0 < b.x1 && a.z1 > b.z0 && a.z0 < b.z1;
}

function isStairWellPrefab(prefabId: string): boolean {
  const p = prefabId.toLowerCase();
  return p.includes("stair_well") || p.includes("stairwell");
}

function isElevatorPrefab(prefabId: string): boolean {
  return prefabId.toLowerCase().includes("elevator");
}

/**
 * Drops elevator objects whose XZ footprint intersects any stair-well footprint on the same
 * plate (authoring mistakes / legacy hub layouts).
 */
export function withoutElevatorsInStairwells(doc: FloorDoc): FloorDoc {
  const stairRects = doc.objects
    .filter((o) => isStairWellPrefab(o.prefabId))
    .map(placedFootprintXz);
  if (stairRects.length === 0) return doc;

  const next: PlacedObject[] = [];
  let dropped = 0;
  for (const o of doc.objects) {
    if (!isElevatorPrefab(o.prefabId)) {
      next.push(o);
      continue;
    }
    const e = placedFootprintXz(o);
    let inside = false;
    for (const s of stairRects) {
      if (xzRectsOverlap(e, s)) {
        inside = true;
        break;
      }
    }
    if (inside) dropped += 1;
    else next.push(o);
  }
  if (dropped === 0) return doc;
  return { ...doc, objects: next };
}

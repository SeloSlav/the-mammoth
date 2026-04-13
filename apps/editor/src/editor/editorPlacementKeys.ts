import * as THREE from "three";
import type { FloorDoc } from "@the-mammoth/schemas";

export const PLACEMENT_KEY_SEP = "\u0000";

export function placementKey(floorDocId: string, objectId: string): string {
  return `${floorDocId}${PLACEMENT_KEY_SEP}${objectId}`;
}

export function resolvePlacedId(
  hit: THREE.Object3D | null,
  floorDocs: Record<string, FloorDoc>,
): string | null {
  let cur: THREE.Object3D | null = hit;
  while (cur) {
    const id = cur.userData.placedObjectId;
    if (typeof id === "string" && id.length > 0) return id;
    if (cur instanceof THREE.Group && typeof cur.name === "string" && cur.name) {
      for (const d of Object.values(floorDocs)) {
        if (d.objects.some((o) => o.id === cur!.name)) return cur.name;
      }
    }
    cur = cur.parent;
  }
  return null;
}

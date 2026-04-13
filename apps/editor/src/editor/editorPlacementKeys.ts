import * as THREE from "three";
import type { FloorDoc } from "@the-mammoth/schemas";

export const PLACEMENT_KEY_SEP = "\u0000";

function readUserDataStringFromAncestors(
  attached: THREE.Object3D,
  key: "floorDocId" | "streamDocId",
): string | undefined {
  let cur: THREE.Object3D | null = attached;
  while (cur) {
    const v = cur.userData[key];
    if (typeof v === "string" && v.length > 0) return v;
    cur = cur.parent;
  }
  return undefined;
}

/** FloorDoc id for gizmo writes — matches {@link syncFloorTransforms} (`userData.floorDocId`). */
export function resolveGizmoFloorDocId(
  attached: THREE.Object3D,
  activeFloorDocId: string,
): string {
  return readUserDataStringFromAncestors(attached, "floorDocId") ?? activeFloorDocId;
}

/** Interior stream id for gizmo writes — matches interior mesh `userData.streamDocId`. */
export function resolveGizmoInteriorDocId(
  attached: THREE.Object3D,
  activeInteriorDocId: string,
): string {
  return readUserDataStringFromAncestors(attached, "streamDocId") ?? activeInteriorDocId;
}

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

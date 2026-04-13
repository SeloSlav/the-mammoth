import * as THREE from "three";
import type { FloorDoc, InteriorDoc } from "@the-mammoth/schemas";

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

/**
 * Walk from the gizmo-attached node up to the Object3D whose transform is stored in {@link FloorDoc}
 * (the room root `Group` with `userData.placedObjectId` / matching `name`).
 * Descendant meshes may not carry `placedObjectId`; reading their `.position` would be wrong for the doc.
 */
export function resolveFloorPlacementTransformRoot(
  attached: THREE.Object3D,
  floorDocs: Record<string, FloorDoc>,
): THREE.Object3D | null {
  let cur: THREE.Object3D | null = attached;
  while (cur) {
    const here: THREE.Object3D = cur;
    const pid = here.userData.placedObjectId;
    if (typeof pid === "string" && pid.length > 0) {
      for (const d of Object.values(floorDocs)) {
        if (d.objects.some((o) => o.id === pid)) return here;
      }
    }
    if (here instanceof THREE.Group && typeof here.name === "string" && here.name.length > 0) {
      const name = here.name;
      for (const d of Object.values(floorDocs)) {
        if (d.objects.some((o) => o.id === name)) return here;
      }
    }
    cur = here.parent;
  }
  return null;
}

export function floorPlacedObjectIdForTransformRoot(
  root: THREE.Object3D,
  floorDocs: Record<string, FloorDoc>,
): string | null {
  const pid = root.userData.placedObjectId;
  if (typeof pid === "string" && pid.length > 0) {
    for (const d of Object.values(floorDocs)) {
      if (d.objects.some((o) => o.id === pid)) return pid;
    }
  }
  if (root instanceof THREE.Group && typeof root.name === "string" && root.name.length > 0) {
    for (const d of Object.values(floorDocs)) {
      if (d.objects.some((o) => o.id === root.name)) return root.name;
    }
  }
  return null;
}

/** Same idea as {@link resolveFloorPlacementTransformRoot} for interior placeholder meshes. */
export function resolveInteriorPlacementTransformRoot(
  attached: THREE.Object3D,
  doc: InteriorDoc | undefined,
): THREE.Object3D | null {
  if (!doc) return null;
  const ids = new Set(doc.placements.map((p) => p.entityId));
  let cur: THREE.Object3D | null = attached;
  while (cur) {
    const here: THREE.Object3D = cur;
    const pid = here.userData.placedObjectId;
    if (typeof pid === "string" && pid.length > 0 && ids.has(pid)) return here;
    if (typeof here.name === "string" && here.name.length > 0 && ids.has(here.name)) return here;
    cur = here.parent;
  }
  return null;
}

export function interiorEntityIdForTransformRoot(root: THREE.Object3D): string | null {
  const pid = root.userData.placedObjectId;
  if (typeof pid === "string" && pid.length > 0) return pid;
  if (typeof root.name === "string" && root.name.length > 0) return root.name;
  return null;
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

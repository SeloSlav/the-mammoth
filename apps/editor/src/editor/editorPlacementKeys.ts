import * as THREE from "three";
import type { FloorDoc, InteriorDoc } from "@the-mammoth/schemas";
import {
  LANDING_DOOR_GLASS_PART_ID,
  LANDING_DOOR_OPENING_PROXY_ID,
} from "@the-mammoth/world";

export const PLACEMENT_KEY_SEP = "\u0000";

function resolveAncestor(
  hit: THREE.Object3D | null,
  predicate: (obj: THREE.Object3D) => boolean,
): THREE.Object3D | null {
  let cur: THREE.Object3D | null = hit;
  while (cur) {
    if (predicate(cur)) return cur;
    cur = cur.parent;
  }
  return null;
}

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

/** Walks parents for `userData.editorCabPartId` (cab workspace picking). */
export function resolveCabPartTarget(hit: THREE.Object3D | null): THREE.Object3D | null {
  return resolveAncestor(hit, (obj) => {
    const id = obj.userData.editorCabPartId;
    return typeof id === "string" && id.length > 0;
  });
}

/** Walks parents for `userData.editorCabPartId` (cab workspace picking). */
export function resolveCabPartId(hit: THREE.Object3D | null): string | null {
  const target = resolveCabPartTarget(hit);
  const id = target?.userData.editorCabPartId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Resolves landing workspace selection: opening proxy (framed hole), then other subparts; glass
 * picks map to the opening proxy so the gizmo resizes the hole, not an isolated pane.
 */
export function resolveLandingKitPickTarget(hit: THREE.Object3D | null): THREE.Object3D | null {
  const openingProxy = resolveAncestor(hit, (obj) => obj.userData.editorLandingOpeningProxy === true);
  if (openingProxy) return openingProxy;
  const glass = resolveAncestor(
    hit,
    (obj) => obj.userData.editorLandingPartId === LANDING_DOOR_GLASS_PART_ID,
  );
  if (glass) {
    let cur: THREE.Object3D | null = glass.parent;
    while (cur) {
      const proxy = cur.getObjectByName(LANDING_DOOR_OPENING_PROXY_ID);
      if (proxy) return proxy;
      cur = cur.parent;
    }
  }
  const part = resolveAncestor(hit, (obj) => {
    const partId = obj.userData.editorLandingPartId;
    return typeof partId === "string" && partId.length > 0;
  });
  if (part) return part;
  return resolveAncestor(hit, (obj) => obj.userData.editorLandingKitRoot === true);
}

/**
 * Resolves landing workspace selection: opening proxy (framed hole), then other subparts; glass
 * picks map to the opening proxy so the gizmo resizes the hole, not an isolated pane.
 */
export function resolveLandingKitPickId(hit: THREE.Object3D | null): string | null {
  const target = resolveLandingKitPickTarget(hit);
  if (!target) return null;
  if (target.userData.editorLandingOpeningProxy === true) return LANDING_DOOR_OPENING_PROXY_ID;
  const part = target.userData.editorLandingPartId;
  if (typeof part === "string" && part.length > 0) return part;
  if (target.userData.editorLandingKitRoot === true) return "landing_door_kit";
  return null;
}

/** Walks parents for `userData.editorStairPartId` (shared stairwell workspace picking). */
export function resolveStairWellPartTarget(hit: THREE.Object3D | null): THREE.Object3D | null {
  return (
    resolveAncestor(hit, (obj) => {
      const pickId = obj.userData.editorStairPickId;
      return typeof pickId === "string" && pickId.length > 0;
    }) ??
    resolveAncestor(hit, (obj) => {
      const id = obj.userData.editorStairPartId;
      return typeof id === "string" && id.length > 0;
    })
  );
}

/** Walks parents for `userData.editorStairPartId` (shared stairwell workspace picking). */
export function resolveStairWellPartId(hit: THREE.Object3D | null): string | null {
  const target = resolveStairWellPartTarget(hit);
  if (!target) return null;
  const pickId = target.userData.editorStairPickId;
  if (typeof pickId === "string" && pickId.length > 0) return pickId;
  const id = target.userData.editorStairPartId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

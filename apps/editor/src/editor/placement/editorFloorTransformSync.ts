import * as THREE from "three";
import type {
  CellDoc,
  FloorDoc,
  InteriorDoc,
  PlacedObject,
  PrefabDef,
} from "@the-mammoth/schemas";
import { useEditorStore } from "../../state/editorStore.js";
import { placementKey } from "./editorPlacementKeys.js";

export function syncFloorTransforms(root: THREE.Object3D, floorDocs: Record<string, FloorDoc>) {
  const byKey = new Map<string, PlacedObject>();
  for (const [fid, d] of Object.entries(floorDocs)) {
    for (const o of d.objects) byKey.set(placementKey(fid, o.id), o);
  }
  root.traverse((o) => {
    const id = o.userData.placedObjectId as string | undefined;
    if (!id || !(o instanceof THREE.Object3D)) return;
    const fid = o.userData.floorDocId as string | undefined;
    let pl = fid ? byKey.get(placementKey(fid, id)) : undefined;
    if (!pl) {
      for (const d of Object.values(floorDocs)) {
        const hit = d.objects.find((ob) => ob.id === id);
        if (hit) {
          pl = hit;
          break;
        }
      }
    }
    if (!pl) return;
    o.position.set(pl.position[0], pl.position[1], pl.position[2]);
    if (pl.rotation)
      o.quaternion.set(
        pl.rotation[0],
        pl.rotation[1],
        pl.rotation[2],
        pl.rotation[3],
      );
    else o.quaternion.identity();
    const sx = pl.scale?.[0] ?? 1;
    const sy = pl.scale?.[1] ?? 1;
    const sz = pl.scale?.[2] ?? 1;
    o.scale.set(sx, sy, sz);
  });
}

export function syncInteriorTransforms(root: THREE.Object3D, doc: InteriorDoc) {
  for (const p of doc.placements) {
    const o = root.getObjectByName(p.entityId);
    if (!o) continue;
    if (
      typeof o.userData.streamDocId === "string" &&
      o.userData.streamDocId !== doc.id
    ) {
      continue;
    }
    o.position.set(p.position[0], p.position[1], p.position[2]);
    if (p.rotation)
      o.quaternion.set(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3]);
    else o.quaternion.identity();
    const sx = p.scale?.[0] ?? 1;
    const sy = p.scale?.[1] ?? 1;
    const sz = p.scale?.[2] ?? 1;
    o.scale.set(sx, sy, sz);
  }
}

export function syncCellTransforms(root: THREE.Object3D, doc: CellDoc) {
  for (const p of doc.placements) {
    const o = root.getObjectByName(p.entityId);
    if (!o) continue;
    o.position.set(p.position[0], p.position[1], p.position[2]);
    if (p.rotation)
      o.quaternion.set(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3]);
    else o.quaternion.identity();
    const sx = p.scale?.[0] ?? 1;
    const sy = p.scale?.[1] ?? 1;
    const sz = p.scale?.[2] ?? 1;
    o.scale.set(sx, sy, sz);
  }
}

export function syncPrefabTransforms(root: THREE.Object3D, doc: PrefabDef) {
  for (const p of doc.components) {
    const o = root.getObjectByName(p.id);
    if (!o) continue;
    o.position.set(p.position[0], p.position[1], p.position[2]);
    if (p.rotation)
      o.quaternion.set(p.rotation[0], p.rotation[1], p.rotation[2], p.rotation[3]);
    else o.quaternion.identity();
    const sx = p.scale?.[0] ?? 1;
    const sy = p.scale?.[1] ?? 1;
    const sz = p.scale?.[2] ?? 1;
    o.scale.set(sx, sy, sz);
  }
}

export function syncDuplicateFloorGroups(
  root: THREE.Object3D,
  sourceId: string,
  source: THREE.Object3D,
) {
  const store = useEditorStore.getState();
  const fid = source.userData.floorDocId as string | undefined;
  const doc = fid
    ? store.floorDocs[fid]
    : store.floorDocs[store.activeFloorDocId];
  if (!doc) return;
  const obj = doc.objects.find((o) => o.id === sourceId);
  if (!obj) return;
  root.traverse((o) => {
    if (!(o instanceof THREE.Group)) return;
    if (o.userData.placedObjectId !== sourceId || o === source) return;
    if (
      typeof source.userData.floorDocId === "string" &&
      typeof o.userData.floorDocId === "string" &&
      o.userData.floorDocId !== source.userData.floorDocId
    ) {
      return;
    }
    o.position.copy(source.position);
    o.quaternion.copy(source.quaternion);
    o.scale.copy(source.scale);
  });
}

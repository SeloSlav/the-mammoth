import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { glassOpeningFromProxyMesh } from "@the-mammoth/world";
import { useEditorStore } from "../../state/editorStore.js";
import { syncDuplicateFloorGroups } from "../placement/editorFloorTransformSync.js";
import {
  floorPlacedObjectIdForTransformRoot,
  interiorEntityIdForTransformRoot,
  resolveFloorPlacementTransformRoot,
  resolveGizmoFloorDocId,
  resolveGizmoInteriorDocId,
  resolveInteriorPlacementTransformRoot,
} from "../placement/editorPlacementKeys.js";

function apartmentLandingKitUsesWholeDoorGizmo(): boolean {
  const st = useEditorStore.getState();
  return (
    st.mode === "landing_preview" &&
    st.landingKitVariant === "apartment" &&
    st.selectedId === "landing_door_kit"
  );
}

function readStairBaseVec3(
  obj: THREE.Object3D,
  key: "editorStairBasePosition" | "editorStairBaseScale",
  fallback: readonly [number, number, number],
): [number, number, number] {
  const raw = obj.userData[key];
  if (
    Array.isArray(raw) &&
    raw.length >= 3 &&
    raw.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return [raw[0]!, raw[1]!, raw[2]!];
  }
  return [fallback[0], fallback[1], fallback[2]];
}

function readStairBaseQuat(
  obj: THREE.Object3D,
): [number, number, number, number] {
  const raw = obj.userData.editorStairBaseRotation;
  if (
    Array.isArray(raw) &&
    raw.length >= 4 &&
    raw.every((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return [raw[0]!, raw[1]!, raw[2]!, raw[3]!];
  }
  return [0, 0, 0, 1];
}

export function commitEditorAttachedTransform(opts: {
  getProgrammaticTransformControlsDepth: () => number;
  transformControls: TransformControls;
  contentRoot: THREE.Group;
}): void {
  if (opts.getProgrammaticTransformControlsDepth() > 0) return;
  const store = useEditorStore.getState();
  const attached = opts.transformControls.object as THREE.Object3D | undefined;
  if (!attached) return;

  if (store.mode === "cab") {
    let o: THREE.Object3D | null = attached;
    let partId: string | undefined;
    while (o) {
      partId = o.userData.editorCabPartId as string | undefined;
      if (partId) break;
      o = o.parent;
    }
    if (!partId || !o) return;
    const pos: [number, number, number] = [
      o.position.x,
      o.position.y,
      o.position.z,
    ];
    const rot: [number, number, number, number] = [
      o.quaternion.x,
      o.quaternion.y,
      o.quaternion.z,
      o.quaternion.w,
    ];
    const sc: [number, number, number] = [o.scale.x, o.scale.y, o.scale.z];
    store.patchElevatorCabDef((d) => ({
      ...d,
      partTransforms: {
        ...d.partTransforms,
        [partId]: {
          ...d.partTransforms?.[partId],
          position: pos,
          rotation: rot,
          scale: sc,
        },
      },
    }));
    return;
  }

  if (store.mode === "landing_preview") {
    let o: THREE.Object3D | null = attached;
    if (apartmentLandingKitUsesWholeDoorGizmo()) {
      while (o) {
        if (o.userData.editorLandingKitRoot === true) {
          const widthBase =
            typeof o.userData.editorLandingPanelWidthM === "number"
              ? o.userData.editorLandingPanelWidthM
              : (store.landingKitDef.panelWidthM ?? 1.18);
          const heightBase =
            typeof o.userData.editorLandingPanelHeightM === "number"
              ? o.userData.editorLandingPanelHeightM
              : (store.landingKitDef.panelHeightM ?? 2.0);
          const nextWidth = THREE.MathUtils.clamp(
            widthBase * Math.abs(o.scale.z),
            0.2,
            3.0,
          );
          const nextHeight = THREE.MathUtils.clamp(
            heightBase * Math.abs(o.scale.y),
            0.4,
            3.5,
          );
          store.patchLandingKitDef((d) => ({
            ...d,
            panelWidthM: nextWidth,
            panelHeightM: nextHeight,
          }));
          return;
        }
        o = o.parent;
      }
      return;
    }
    o = attached;
    while (o) {
      if (o.userData.editorLandingOpeningProxy === true) {
        const open = glassOpeningFromProxyMesh(o, store.landingKitDef);
        store.patchLandingKitDef((d) => ({
          ...d,
          glassOpening: {
            ...d.glassOpening,
            widthM: open.widthM,
            heightM: open.heightM,
            centerYM: open.centerYM,
          },
        }));
        return;
      }
      o = o.parent;
    }
    o = attached;
    let partId: string | undefined;
    while (o) {
      partId = o.userData.editorLandingPartId as string | undefined;
      if (partId) break;
      o = o.parent;
    }
    if (!partId || !o) return;
    const pos: [number, number, number] = [
      o.position.x,
      o.position.y,
      o.position.z,
    ];
    const rot: [number, number, number, number] = [
      o.quaternion.x,
      o.quaternion.y,
      o.quaternion.z,
      o.quaternion.w,
    ];
    const sc: [number, number, number] = [o.scale.x, o.scale.y, o.scale.z];
    store.patchLandingKitDef((d) => ({
      ...d,
      partTransforms: {
        ...d.partTransforms,
        [partId]: {
          ...d.partTransforms?.[partId],
          position: pos,
          rotation: rot,
          scale: sc,
        },
      },
    }));
    return;
  }

  if (store.mode === "stairwell_preview") {
    let o: THREE.Object3D | null = attached;
    while (o) {
      o = o.parent;
    }
    o = attached;
    let partId: string | undefined;
    while (o) {
      partId = o.userData.editorStairPartId as string | undefined;
      if (partId) break;
      o = o.parent;
    }
    if (!partId || !o) return;
    const basePos = readStairBaseVec3(o, "editorStairBasePosition", [0, 0, 0]);
    const baseScale = readStairBaseVec3(o, "editorStairBaseScale", [1, 1, 1]);
    const baseRot = readStairBaseQuat(o);
    const baseQ = new THREE.Quaternion(
      baseRot[0],
      baseRot[1],
      baseRot[2],
      baseRot[3],
    );
    const invBaseQ = baseQ.clone().invert();
    const deltaQ = invBaseQ.multiply(o.quaternion.clone());
    store.patchStairWellDef((d) => ({
      ...d,
      ...(store.stairWellAuthorScope === "ground"
        ? {
            groundPartTransforms: {
              ...d.groundPartTransforms,
              [partId]: {
                ...d.groundPartTransforms?.[partId],
                position: [
                  o.position.x - basePos[0],
                  o.position.y - basePos[1],
                  o.position.z - basePos[2],
                ],
                rotation: [deltaQ.x, deltaQ.y, deltaQ.z, deltaQ.w],
                scale: [
                  baseScale[0] !== 0 ? o.scale.x / baseScale[0] : o.scale.x,
                  baseScale[1] !== 0 ? o.scale.y / baseScale[1] : o.scale.y,
                  baseScale[2] !== 0 ? o.scale.z / baseScale[2] : o.scale.z,
                ],
              },
            },
          }
        : {
            partTransforms: {
              ...d.partTransforms,
              [partId]: {
                ...d.partTransforms?.[partId],
                position: [
                  o.position.x - basePos[0],
                  o.position.y - basePos[1],
                  o.position.z - basePos[2],
                ],
                rotation: [deltaQ.x, deltaQ.y, deltaQ.z, deltaQ.w],
                scale: [
                  baseScale[0] !== 0 ? o.scale.x / baseScale[0] : o.scale.x,
                  baseScale[1] !== 0 ? o.scale.y / baseScale[1] : o.scale.y,
                  baseScale[2] !== 0 ? o.scale.z / baseScale[2] : o.scale.z,
                ],
              },
            },
          }),
    }));
    return;
  }

  if (
    store.mode !== "floor" &&
    store.mode !== "interior" &&
    store.mode !== "cell" &&
    store.mode !== "prefab" &&
    store.mode !== "floor_override"
  ) {
    return;
  }
  if (store.mode === "floor") {
    const root = resolveFloorPlacementTransformRoot(attached, store.floorDocs);
    if (!root) return;
    const id = floorPlacedObjectIdForTransformRoot(root, store.floorDocs);
    if (!id) return;
    const pos: [number, number, number] = [
      root.position.x,
      root.position.y,
      root.position.z,
    ];
    const rot: [number, number, number, number] = [
      root.quaternion.x,
      root.quaternion.y,
      root.quaternion.z,
      root.quaternion.w,
    ];
    const sc: [number, number, number] = [
      root.scale.x,
      root.scale.y,
      root.scale.z,
    ];
    store.updatePlacedObject(
      resolveGizmoFloorDocId(root, store.activeFloorDocId),
      id,
      {
        position: pos,
        rotation: rot,
        scale: sc,
      },
    );
    syncDuplicateFloorGroups(opts.contentRoot, id, root);
  } else if (store.mode === "interior") {
    const intDocId = resolveGizmoInteriorDocId(
      attached,
      store.activeInteriorDocId,
    );
    const doc = store.interiorDocs[intDocId];
    const root = resolveInteriorPlacementTransformRoot(attached, doc);
    if (!root) return;
    const id = interiorEntityIdForTransformRoot(root);
    if (!id) return;
    const pos: [number, number, number] = [
      root.position.x,
      root.position.y,
      root.position.z,
    ];
    const rot: [number, number, number, number] = [
      root.quaternion.x,
      root.quaternion.y,
      root.quaternion.z,
      root.quaternion.w,
    ];
    const sc: [number, number, number] = [
      root.scale.x,
      root.scale.y,
      root.scale.z,
    ];
    store.updateInteriorPlacement(intDocId, id, {
      position: pos,
      rotation: rot,
      scale: sc,
    });
  } else if (store.mode === "cell") {
    const id =
      (typeof attached.userData.placedObjectId === "string" &&
        attached.userData.placedObjectId) ||
      attached.name;
    if (!id) return;
    const pos: [number, number, number] = [
      attached.position.x,
      attached.position.y,
      attached.position.z,
    ];
    const rot: [number, number, number, number] = [
      attached.quaternion.x,
      attached.quaternion.y,
      attached.quaternion.z,
      attached.quaternion.w,
    ];
    const sc: [number, number, number] = [
      attached.scale.x,
      attached.scale.y,
      attached.scale.z,
    ];
    store.updateCellPlacement(store.activeCellDocId, id, {
      position: pos,
      rotation: rot,
      scale: sc,
    });
  } else if (store.mode === "prefab") {
    const id =
      (typeof attached.userData.placedObjectId === "string" &&
        attached.userData.placedObjectId) ||
      attached.name;
    if (!id || !store.activePrefabDefId) return;
    const pos: [number, number, number] = [
      attached.position.x,
      attached.position.y,
      attached.position.z,
    ];
    const rot: [number, number, number, number] = [
      attached.quaternion.x,
      attached.quaternion.y,
      attached.quaternion.z,
      attached.quaternion.w,
    ];
    const sc: [number, number, number] = [
      attached.scale.x,
      attached.scale.y,
      attached.scale.z,
    ];
    store.updatePrefabComponent(store.activePrefabDefId, id, {
      position: pos,
      rotation: rot,
      scale: sc,
    });
  } else if (store.activeFloorOverrideDocId) {
    const root = resolveFloorPlacementTransformRoot(attached, store.floorDocs);
    if (!root) return;
    const id = floorPlacedObjectIdForTransformRoot(root, store.floorDocs);
    if (!id) return;
    const pos: [number, number, number] = [
      root.position.x,
      root.position.y,
      root.position.z,
    ];
    const rot: [number, number, number, number] = [
      root.quaternion.x,
      root.quaternion.y,
      root.quaternion.z,
      root.quaternion.w,
    ];
    const sc: [number, number, number] = [
      root.scale.x,
      root.scale.y,
      root.scale.z,
    ];
    store.updateFloorOverrideObjectPatch(store.activeFloorOverrideDocId, id, {
      position: pos,
      rotation: rot,
      scale: sc,
    });
  }
}

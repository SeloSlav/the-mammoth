import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { glassOpeningFromProxyMesh, TYPICAL_FLOOR_DOC_ID, clampOwnedApartmentWallOpeningsForLength, patchStairWellCeilingPropAnchorInDef, readStairWellCeilingPropAnchorFromTransform } from "@the-mammoth/world";
import {
  OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
} from "@the-mammoth/schemas";
import { useEditorStore } from "../../state/editorStore.js";
import { resolveMyApartmentAuthoringFractionMappingForEditor } from "../myApartment/editorMyApartmentAuthoringContext.js";
import {
  resolveOwnedApartmentAuthoringLayoutForEditor,
  type OwnedApartmentFractionToPreviewXZ,
} from "../myApartment/editorMyApartmentAuthoringShell.js";
import {
  applyMyApartmentDecorRootScaleFromDoc,
  applyMyApartmentDecorUniformScale,
  clampMyApartmentDecorEulerLimits,
  constrainMyApartmentDecorVerticalBounds,
  readMyApartmentDecorCommittedScale,
  constrainMyApartmentMirrorRootPose,
  EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
  findEditorMyApartmentMirrorSurfaceMesh,
  findEditorMyApartmentWallSlabMesh,
  clampMyApartmentWallOpeningProxyPose,
  layoutFractionsFromPreviewWorldPosition,
  snapMyApartmentDecorEulerToGrid,
  snapOwnedApartmentDecorPitchRad,
  snapOwnedApartmentDecorYawRad,
} from "../myApartment/editorMyApartmentMeshes.js";
import { getEditorMyApartmentStaticSelectionGroupsMap } from "../myApartment/editorMyApartmentPieceGroupBridge.js";
import { snapOwnedApartmentWallYawRad } from "../myApartment/editorMyApartmentWallSnap.js";
import { syncDuplicateFloorGroups } from "../placement/editorFloorTransformSync.js";
import {
  floorPlacedObjectIdForTransformRoot,
  interiorEntityIdForTransformRoot,
  resolveFloorPlacementTransformRoot,
  resolveGizmoFloorDocId,
  resolveGizmoInteriorDocId,
  resolveInteriorPlacementTransformRoot,
} from "../placement/editorPlacementKeys.js";
import {
  MY_APARTMENT_OBJECT_GROUP_MANIP_UD,
} from "../myApartment/editorMyApartmentSavedGroupManip.js";

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

export function resolveMyApartmentDecorCommittedDy(input: {
  targetRoot: THREE.Object3D;
}): number {
  const rootWorld = input.targetRoot.getWorldPosition(new THREE.Vector3());
  return rootWorld.y - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
}

export function resolveMyApartmentWallCommittedDy(input: {
  targetRoot: THREE.Object3D;
}): number {
  input.targetRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(input.targetRoot);
  return box.min.y - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
}

export type MyApartmentWallPlacementPatch = {
  fx: number;
  fz: number;
  dy: number;
  yawRad: number;
  pitchRad: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
};

/**
 * Read wall placement for the store from the live scene root.
 * Does not run snap, fill-gap, or shell clamp — the scene pose is persisted as-is.
 */
export function readMyApartmentWallPlacementPatchFromSceneRoot(
  targetRoot: THREE.Object3D,
  fractionMapping: OwnedApartmentFractionToPreviewXZ,
): MyApartmentWallPlacementPatch | null {
  if (!(targetRoot instanceof THREE.Group)) return null;
  if (!targetRoot.userData.mammothEditorMyApartmentWallId) return null;

  const mesh = findEditorMyApartmentWallSlabMesh(targetRoot);
  if (!mesh) return null;

  targetRoot.updateMatrixWorld(true);
  const dy = THREE.MathUtils.clamp(
    resolveMyApartmentWallCommittedDy({ targetRoot }),
    0,
    EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
  );
  const pW = new THREE.Vector3().setFromMatrixPosition(targetRoot.matrixWorld);
  const eulerLocal = new THREE.Euler().setFromQuaternion(targetRoot.quaternion, "YXZ");
  const yaw = snapOwnedApartmentWallYawRad(eulerLocal.y);
  const { fx, fz } = layoutFractionsFromPreviewWorldPosition(
    fractionMapping,
    pW.x,
    pW.z,
  );
  return {
    fx,
    fz,
    dy,
    yawRad: yaw,
    pitchRad: 0,
    sizeX: Math.abs(mesh.scale.x * targetRoot.scale.x),
    sizeY: Math.abs(mesh.scale.y * targetRoot.scale.y),
    sizeZ: Math.abs(mesh.scale.z * targetRoot.scale.z),
  };
}

/** Copies every mounted wall group's world pose into `ownedApartmentBuiltins` (call before save). */
export function persistAllMyApartmentWallPlacementsFromScene(): boolean {
  const store = useEditorStore.getState();
  if (store.mode !== "my_apartment_layout") return false;

  const groups = getEditorMyApartmentStaticSelectionGroupsMap();
  if (!groups) return false;

  const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
    floorDoc: store.floorDocs[TYPICAL_FLOOR_DOC_ID],
    building: store.building,
    previewUnitId: store.myApartmentPreviewUnitId,
  });
  const fractionMapping = resolveMyApartmentAuthoringFractionMappingForEditor({
    myApartmentAuthoringTarget: store.myApartmentAuthoringTarget,
    floorDocs: store.floorDocs,
    building: store.building,
    myApartmentPreviewUnitId: store.myApartmentPreviewUnitId,
    ownedApartmentBuiltins: store.ownedApartmentBuiltins,
  });

  const patches = new Map<string, MyApartmentWallPlacementPatch>();
  for (const group of Object.values(groups)) {
    const wallId = group.userData.mammothEditorMyApartmentWallId as string | undefined;
    if (!wallId) continue;
    const patch = readMyApartmentWallPlacementPatchFromSceneRoot(group, fractionMapping);
    if (patch) patches.set(wallId, patch);
  }
  if (patches.size === 0) return false;

  store.patchOwnedApartmentBuiltins((d) => ({
    ...d,
    wallItems: d.wallItems.map((item) => {
      const patch = patches.get(item.id);
      return patch
        ? {
            ...item,
            ...patch,
            openings: clampOwnedApartmentWallOpeningsForLength(patch.sizeX, item.openings ?? []),
          }
        : item;
    }),
  }));
  return true;
}

/** Avoid mount resync + full mesh rebuild every `objectChange` tick while the gizmo is active. */
function deferMyApartmentLayoutStorePersistWhileDragging(
  store: { mode: string },
  transformControls: TransformControls,
  getLevelEditorTransformGesture: () => boolean,
): boolean {
  return (
    store.mode === "my_apartment_layout" &&
    transformControls.dragging === true &&
    getLevelEditorTransformGesture()
  );
}

export function commitEditorAttachedTransform(opts: {
  getProgrammaticTransformControlsDepth: () => number;
  getLevelEditorTransformGesture: () => boolean;
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
    let ceilingPropRoot: THREE.Object3D | null = null;
    let ceilingPropId: string | undefined;
    let partRoot: THREE.Object3D | null = null;
    let partId: string | undefined;
    while (o) {
      if (!ceilingPropId) {
        const id = o.userData.editorStairCeilingPropId as string | undefined;
        if (id) {
          ceilingPropId = id;
          ceilingPropRoot = o;
        }
      }
      if (!partId) {
        const id = o.userData.editorStairPartId as string | undefined;
        if (id) {
          partId = id;
          partRoot = o;
        }
      }
      o = o.parent;
    }
    if (ceilingPropId && ceilingPropRoot) {
      const anchorPatch = readStairWellCeilingPropAnchorFromTransform(ceilingPropRoot);
      if (!anchorPatch) return;
      const scope = store.stairWellAuthorScope;
      store.patchStairWellDef((d) =>
        patchStairWellCeilingPropAnchorInDef(d, scope, ceilingPropId!, anchorPatch),
      );
      return;
    }
    if (!partId || !partRoot) return;
    o = partRoot;
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

  if (store.mode === "my_apartment_layout") {
    const doc = store.ownedApartmentBuiltins;
    const m = resolveMyApartmentAuthoringFractionMappingForEditor({
      myApartmentAuthoringTarget: store.myApartmentAuthoringTarget,
      floorDocs: store.floorDocs,
      building: store.building,
      myApartmentPreviewUnitId: store.myApartmentPreviewUnitId,
      ownedApartmentBuiltins: doc,
    });

    if (attached.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] === true) {
      const decorPatches = new Map<
        string,
        {
          fx: number;
          fz: number;
          dy: number;
          yawRad: number;
          pitchRad: number;
          rollRad: number;
          uniformScale: number;
          verticalScaleMul: number;
          scaleX: number;
          scaleY: number;
          scaleZ: number;
        }
      >();
      const mirrorPatches = new Map<
        string,
        {
          fx: number;
          fz: number;
          dy: number;
          yawRad: number;
          pitchRad: number;
          rollRad: number;
          sizeX: number;
          sizeY: number;
        }
      >();
      const wallPatches = new Map<
        string,
        {
          fx: number;
          fz: number;
          dy: number;
          yawRad: number;
          pitchRad: number;
          sizeX: number;
          sizeY: number;
          sizeZ: number;
        }
      >();

      for (const child of [...attached.children]) {
        if (!(child instanceof THREE.Group)) continue;
        const decorChildId = child.userData.mammothEditorMyApartmentDecorId as
          | string
          | undefined;
        const wallChildId = child.userData.mammothEditorMyApartmentWallId as
          | string
          | undefined;
        const mirrorChildId = child.userData.mammothEditorMyApartmentMirrorId as
          | string
          | undefined;
        if (!decorChildId && !wallChildId && !mirrorChildId) continue;

        if (decorChildId) {
          const targetRootChild = child;
          clampMyApartmentDecorEulerLimits(targetRootChild);
          if (store.gridSnapM > 0) {
            snapMyApartmentDecorEulerToGrid(targetRootChild);
          }
          constrainMyApartmentDecorVerticalBounds(targetRootChild);
          targetRootChild.updateMatrixWorld(true);
          const dy = THREE.MathUtils.clamp(
            resolveMyApartmentDecorCommittedDy({
              targetRoot: targetRootChild,
            }),
            0,
            EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
          );
          const eulerLocal = new THREE.Euler().setFromQuaternion(
            targetRootChild.quaternion,
            "YXZ",
          );
          const yaw = eulerLocal.y;
          const pitch = THREE.MathUtils.clamp(
            eulerLocal.x,
            -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
            OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
          );
          const roll = THREE.MathUtils.clamp(
            eulerLocal.z,
            -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
            OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
          );
          const rootWorld = targetRootChild.getWorldPosition(new THREE.Vector3());
          const { fx, fz } = layoutFractionsFromPreviewWorldPosition(
            m,
            rootWorld.x,
            rootWorld.z,
          );
          const scaleFields = readMyApartmentDecorCommittedScale(targetRootChild);
          const decorKey = decorChildId;
          decorPatches.set(decorKey, {
            fx,
            fz,
            dy,
            yawRad: yaw,
            pitchRad: pitch,
            rollRad: roll,
            ...scaleFields,
          });
          if (
            !(
              deferMyApartmentLayoutStorePersistWhileDragging(
                store,
                opts.transformControls,
                opts.getLevelEditorTransformGesture,
              ) &&
              store.transformMode === "scale"
            )
          ) {
            applyMyApartmentDecorRootScaleFromDoc(targetRootChild, scaleFields);
          }
          continue;
        }

        if (mirrorChildId) {
          const targetRootChild = child;
          applyMyApartmentDecorUniformScale(targetRootChild);
          clampMyApartmentDecorEulerLimits(targetRootChild);
          if (store.gridSnapM > 0) {
            snapMyApartmentDecorEulerToGrid(targetRootChild);
          }
          if (!opts.transformControls.dragging) {
            constrainMyApartmentMirrorRootPose(targetRootChild);
          }
          const mesh = findEditorMyApartmentMirrorSurfaceMesh(targetRootChild);
          if (!mesh) continue;
          targetRootChild.updateMatrixWorld(true);
          const decorBoundsChild = new THREE.Box3().setFromObject(targetRootChild);
          const dyChild = THREE.MathUtils.clamp(
            decorBoundsChild.min.y - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
            0,
            EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
          );
          const eulerLocalMirror = new THREE.Euler().setFromQuaternion(
            targetRootChild.quaternion,
            "YXZ",
          );
          const yawMirror = eulerLocalMirror.y;
          const pitchMirror = THREE.MathUtils.clamp(
            eulerLocalMirror.x,
            -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
            OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
          );
          const rollMirror = THREE.MathUtils.clamp(
            eulerLocalMirror.z,
            -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
            OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
          );
          const rootWorldMirror = targetRootChild.getWorldPosition(new THREE.Vector3());
          const { fx: fxMirror, fz: fzMirror } = layoutFractionsFromPreviewWorldPosition(
            m,
            rootWorldMirror.x,
            rootWorldMirror.z,
          );
          const sizeXMirror = Math.abs(mesh.scale.x * targetRootChild.scale.x);
          const sizeYMirror = Math.abs(mesh.scale.y * targetRootChild.scale.y);
          const mirrorKey = mirrorChildId;
          mirrorPatches.set(mirrorKey, {
            fx: fxMirror,
            fz: fzMirror,
            dy: dyChild,
            yawRad: yawMirror,
            pitchRad: pitchMirror,
            rollRad: rollMirror,
            sizeX: sizeXMirror,
            sizeY: sizeYMirror,
          });
          continue;
        }

        if (wallChildId) {
          const patch = readMyApartmentWallPlacementPatchFromSceneRoot(child, m);
          if (patch) wallPatches.set(wallChildId, patch);
        }
      }

      const deferPersist = deferMyApartmentLayoutStorePersistWhileDragging(
        store,
        opts.transformControls,
        opts.getLevelEditorTransformGesture,
      );
      if (
        !deferPersist &&
        (decorPatches.size > 0 ||
          mirrorPatches.size > 0 ||
          wallPatches.size > 0)
      ) {
        store.patchOwnedApartmentBuiltins((d) => ({
          ...d,
          ...(decorPatches.size > 0
            ? {
                placedItems: d.placedItems.map((item) => {
                  const patch = decorPatches.get(item.id);
                  return patch ? { ...item, ...patch } : item;
                }),
              }
            : {}),
          ...(mirrorPatches.size > 0
            ? {
                mirrorItems: d.mirrorItems.map((item) => {
                  const patch = mirrorPatches.get(item.id);
                  return patch ? { ...item, ...patch } : item;
                }),
              }
            : {}),
          ...(wallPatches.size > 0
            ? {
                wallItems: d.wallItems.map((item) => {
                  const patch = wallPatches.get(item.id);
                  return patch ? { ...item, ...patch } : item;
                }),
              }
            : {}),
        }));
      }
      return;
    }

    let openingWalk: THREE.Object3D | null = attached;
    while (openingWalk) {
      if (openingWalk.userData.editorMyApartmentWallOpeningProxy === true) {
        const openingId = openingWalk.userData.mammothEditorMyApartmentWallOpeningId as
          | string
          | undefined;
        let wallRoot: THREE.Object3D | null = openingWalk.parent;
        while (wallRoot && !wallRoot.userData.mammothEditorMyApartmentWallId) {
          wallRoot = wallRoot.parent;
        }
        const openingWallId = wallRoot?.userData.mammothEditorMyApartmentWallId as
          | string
          | undefined;
        if (openingId && openingWallId && wallRoot) {
          const wallItem = store.ownedApartmentBuiltins.wallItems.find(
            (w) => w.id === openingWallId,
          );
          if (wallItem) {
            clampMyApartmentWallOpeningProxyPose(
              openingWalk,
              wallRoot,
              wallItem,
              openingId,
            );
            const tangentOffsetM = openingWalk.position.x;
            store.patchOwnedApartmentBuiltins((d) => ({
              ...d,
              wallItems: d.wallItems.map((item) =>
                item.id === openingWallId
                  ? {
                      ...item,
                      openings: (item.openings ?? []).map((op) =>
                        op.id === openingId ? { ...op, tangentOffsetM } : op,
                      ),
                    }
                  : item,
              ),
            }));
            return;
          }
        }
      }
      openingWalk = openingWalk.parent;
    }

    let targetRoot: THREE.Object3D | null = attached;
    let decorId: string | undefined;
    let wallId: string | undefined;
    let mirrorId: string | undefined;
    while (targetRoot) {
      decorId = targetRoot.userData.mammothEditorMyApartmentDecorId as string | undefined;
      wallId = targetRoot.userData.mammothEditorMyApartmentWallId as string | undefined;
      mirrorId = targetRoot.userData.mammothEditorMyApartmentMirrorId as string | undefined;
      if (decorId || wallId || mirrorId) break;
      targetRoot = targetRoot.parent;
    }
    if (!targetRoot) return;

    if (decorId) {
      clampMyApartmentDecorEulerLimits(targetRoot);
      if (store.gridSnapM > 0) {
        snapMyApartmentDecorEulerToGrid(targetRoot);
      }
      constrainMyApartmentDecorVerticalBounds(targetRoot);
      targetRoot.updateMatrixWorld(true);
      const dy = THREE.MathUtils.clamp(
        resolveMyApartmentDecorCommittedDy({
          targetRoot,
        }),
        0,
        EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
      );
      const eulerLocal = new THREE.Euler().setFromQuaternion(targetRoot.quaternion, "YXZ");
      const yaw = eulerLocal.y;
      const pitch = THREE.MathUtils.clamp(
        eulerLocal.x,
        -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
        OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
      );
      const roll = THREE.MathUtils.clamp(
        eulerLocal.z,
        -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
        OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
      );
      const rootWorld = targetRoot.getWorldPosition(new THREE.Vector3());
      const { fx, fz } = layoutFractionsFromPreviewWorldPosition(
        m,
        rootWorld.x,
        rootWorld.z,
      );
      const scaleFields = readMyApartmentDecorCommittedScale(targetRoot);
      if (
        !deferMyApartmentLayoutStorePersistWhileDragging(
                store,
                opts.transformControls,
                opts.getLevelEditorTransformGesture,
              )
      ) {
        store.patchOwnedApartmentBuiltins((d) => ({
          ...d,
          placedItems: d.placedItems.map((item) =>
            item.id === decorId
              ? {
                  ...item,
                  fx,
                  fz,
                  dy,
                  yawRad: yaw,
                  pitchRad: pitch,
                  rollRad: roll,
                  ...scaleFields,
                }
              : item,
          ),
        }));
      }
      if (
        !(
          deferMyApartmentLayoutStorePersistWhileDragging(
                store,
                opts.transformControls,
                opts.getLevelEditorTransformGesture,
              ) &&
          store.transformMode === "scale"
        )
      ) {
        applyMyApartmentDecorRootScaleFromDoc(targetRoot, scaleFields);
      }
      return;
    }

    if (mirrorId) {
      applyMyApartmentDecorUniformScale(targetRoot);
      clampMyApartmentDecorEulerLimits(targetRoot);
      if (store.gridSnapM > 0) {
        snapMyApartmentDecorEulerToGrid(targetRoot);
      }
      if (!opts.transformControls.dragging) {
        constrainMyApartmentMirrorRootPose(targetRoot);
      }
      const mesh = findEditorMyApartmentMirrorSurfaceMesh(targetRoot);
      if (!mesh) return;
      targetRoot.updateMatrixWorld(true);
      const mirrorBounds = new THREE.Box3().setFromObject(targetRoot);
      const dy = THREE.MathUtils.clamp(
        mirrorBounds.min.y - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
        0,
        EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
      );
      const eulerLocal = new THREE.Euler().setFromQuaternion(targetRoot.quaternion, "YXZ");
      const yaw = eulerLocal.y;
      const pitch = THREE.MathUtils.clamp(
        eulerLocal.x,
        -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
        OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
      );
      const roll = THREE.MathUtils.clamp(
        eulerLocal.z,
        -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
        OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
      );
      const rootWorld = targetRoot.getWorldPosition(new THREE.Vector3());
      const { fx, fz } = layoutFractionsFromPreviewWorldPosition(
        m,
        rootWorld.x,
        rootWorld.z,
      );
      const sizeX = Math.abs(mesh.scale.x * targetRoot.scale.x);
      const sizeY = Math.abs(mesh.scale.y * targetRoot.scale.y);
      if (
        !deferMyApartmentLayoutStorePersistWhileDragging(
                store,
                opts.transformControls,
                opts.getLevelEditorTransformGesture,
              )
      ) {
        store.patchOwnedApartmentBuiltins((d) => ({
          ...d,
          mirrorItems: d.mirrorItems.map((item) =>
            item.id === mirrorId
              ? {
                  ...item,
                  fx,
                  fz,
                  dy,
                  yawRad: yaw,
                  pitchRad: pitch,
                  rollRad: roll,
                  sizeX,
                  sizeY,
                }
              : item,
          ),
        }));
      }
      return;
    }

    if (wallId) {
      if (
        deferMyApartmentLayoutStorePersistWhileDragging(
                store,
                opts.transformControls,
                opts.getLevelEditorTransformGesture,
              )
      ) {
        return;
      }
      const patch = readMyApartmentWallPlacementPatchFromSceneRoot(targetRoot, m);
      if (!patch) return;
      store.patchOwnedApartmentBuiltins((d) => ({
        ...d,
        wallItems: d.wallItems.map((item) =>
          item.id === wallId
            ? {
                ...item,
                ...patch,
                openings: clampOwnedApartmentWallOpeningsForLength(
                  patch.sizeX,
                  item.openings ?? [],
                ),
              }
            : item,
        ),
      }));
      return;
    }

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

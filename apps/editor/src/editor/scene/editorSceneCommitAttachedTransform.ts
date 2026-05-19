import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { glassOpeningFromProxyMesh, TYPICAL_FLOOR_DOC_ID } from "@the-mammoth/world";
import {
  OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
  OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
} from "@the-mammoth/schemas";
import { useEditorStore } from "../../state/editorStore.js";
import {
  ownedApartmentFractionMappingForEditor,
  resolveOwnedApartmentAuthoringLayoutForEditor,
} from "../myApartment/editorMyApartmentAuthoringShell.js";
import {
  applyMyApartmentDecorUniformScale,
  clampMyApartmentDecorEulerLimits,
  clampOwnedApartmentDecorUniformScale,
  constrainMyApartmentDecorVerticalBounds,
  constrainMyApartmentMirrorRootPose,
  constrainMyApartmentWallRootPose,
  EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
  findEditorMyApartmentMirrorSurfaceMesh,
  findEditorMyApartmentWallSlabMesh,
  snapMyApartmentDecorEulerToGrid,
  snapOwnedApartmentDecorPitchRad,
  snapOwnedApartmentDecorYawRad,
} from "../myApartment/editorMyApartmentMeshes.js";
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

  if (store.mode === "my_apartment_layout") {
    const doc = store.ownedApartmentBuiltins;
    const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
      floorDoc: store.floorDocs[TYPICAL_FLOOR_DOC_ID],
      building: store.building,
    });
    const m = ownedApartmentFractionMappingForEditor({
      layout,
      builtinsFallbackPreviewM: doc.previewSizeM,
    });

    if (attached.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] === true) {
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
          applyMyApartmentDecorUniformScale(targetRootChild);
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
          const wx = rootWorld.x + m.prefabOriginX;
          const wz = rootWorld.z + m.prefabOriginZ;
          const fx = THREE.MathUtils.clamp(
            (wx - m.strictMinX) / m.spanX,
            OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
            OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
          );
          const fz = THREE.MathUtils.clamp(
            (wz - m.strictMinZ) / m.spanZ,
            OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
            OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
          );
          const uniformScale = clampOwnedApartmentDecorUniformScale(
            (targetRootChild.scale.x +
              targetRootChild.scale.y +
              targetRootChild.scale.z) /
              3,
          );
          const decorKey = decorChildId;
          store.patchOwnedApartmentBuiltins((d) => ({
            ...d,
            placedItems: d.placedItems.map((item) =>
              item.id === decorKey
                ? {
                    ...item,
                    fx,
                    fz,
                    dy,
                    yawRad: yaw,
                    pitchRad: pitch,
                    rollRad: roll,
                    uniformScale,
                  }
                : item,
            ),
          }));
          targetRootChild.scale.setScalar(uniformScale);
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
          const wxMirror = rootWorldMirror.x + m.prefabOriginX;
          const wzMirror = rootWorldMirror.z + m.prefabOriginZ;
          const fxMirror = THREE.MathUtils.clamp(
            (wxMirror - m.strictMinX) / m.spanX,
            OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
            OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
          );
          const fzMirror = THREE.MathUtils.clamp(
            (wzMirror - m.strictMinZ) / m.spanZ,
            OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
            OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
          );
          const sizeXMirror = Math.abs(mesh.scale.x * targetRootChild.scale.x);
          const sizeYMirror = Math.abs(mesh.scale.y * targetRootChild.scale.y);
          const mirrorKey = mirrorChildId;
          store.patchOwnedApartmentBuiltins((d) => ({
            ...d,
            mirrorItems: d.mirrorItems.map((item) =>
              item.id === mirrorKey
                ? {
                    ...item,
                    fx: fxMirror,
                    fz: fzMirror,
                    dy: dyChild,
                    yawRad: yawMirror,
                    pitchRad: pitchMirror,
                    rollRad: rollMirror,
                    sizeX: sizeXMirror,
                    sizeY: sizeYMirror,
                  }
                : item,
            ),
          }));
          continue;
        }

        if (wallChildId) {
          const targetRootChild = child;
          if (!opts.transformControls.dragging) {
            constrainMyApartmentWallRootPose(targetRootChild);
          }
          const mesh = findEditorMyApartmentWallSlabMesh(targetRootChild);
          if (!mesh) continue;
          targetRootChild.updateMatrixWorld(true);
          const decorBoundsChild = new THREE.Box3().setFromObject(targetRootChild);
          const dyChild = THREE.MathUtils.clamp(
            decorBoundsChild.min.y - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
            0,
            EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
          );
          const pWChild = new THREE.Vector3().setFromMatrixPosition(
            targetRootChild.matrixWorld,
          );
          const eulerLocalWall = new THREE.Euler().setFromQuaternion(
            targetRootChild.quaternion,
            "YXZ",
          );
          const yawWall = snapOwnedApartmentDecorYawRad(eulerLocalWall.y);
          const pitchWall = THREE.MathUtils.clamp(
            snapOwnedApartmentDecorPitchRad(eulerLocalWall.x),
            -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
            OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
          );
          const wxw = pWChild.x + m.prefabOriginX;
          const wzw = pWChild.z + m.prefabOriginZ;
          const fxw = THREE.MathUtils.clamp(
            (wxw - m.strictMinX) / m.spanX,
            OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
            OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
          );
          const fzw = THREE.MathUtils.clamp(
            (wzw - m.strictMinZ) / m.spanZ,
            OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
            OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
          );
          const sizeXw = Math.abs(mesh.scale.x * targetRootChild.scale.x);
          const sizeYw = Math.abs(mesh.scale.y * targetRootChild.scale.y);
          const sizeZw = Math.abs(mesh.scale.z * targetRootChild.scale.z);
          const wallKey = wallChildId;
          store.patchOwnedApartmentBuiltins((d) => ({
            ...d,
            wallItems: d.wallItems.map((item) =>
              item.id === wallKey
                ? {
                    ...item,
                    fx: fxw,
                    fz: fzw,
                    dy: dyChild,
                    yawRad: yawWall,
                    pitchRad: pitchWall,
                    sizeX: sizeXw,
                    sizeY: sizeYw,
                    sizeZ: sizeZw,
                  }
                : item,
            ),
          }));
        }
      }
      return;
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
      applyMyApartmentDecorUniformScale(targetRoot);
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
      const wx = rootWorld.x + m.prefabOriginX;
      const wz = rootWorld.z + m.prefabOriginZ;
      const fx = THREE.MathUtils.clamp(
        (wx - m.strictMinX) / m.spanX,
        OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
        OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
      );
      const fz = THREE.MathUtils.clamp(
        (wz - m.strictMinZ) / m.spanZ,
        OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
        OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
      );
      const uniformScale = clampOwnedApartmentDecorUniformScale(
        (targetRoot.scale.x + targetRoot.scale.y + targetRoot.scale.z) / 3,
      );
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
                uniformScale,
              }
            : item,
        ),
      }));
      targetRoot.scale.setScalar(uniformScale);
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
      const wx = rootWorld.x + m.prefabOriginX;
      const wz = rootWorld.z + m.prefabOriginZ;
      const fx = THREE.MathUtils.clamp(
        (wx - m.strictMinX) / m.spanX,
        OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
        OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
      );
      const fz = THREE.MathUtils.clamp(
        (wz - m.strictMinZ) / m.spanZ,
        OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
        OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
      );
      const sizeX = Math.abs(mesh.scale.x * targetRoot.scale.x);
      const sizeY = Math.abs(mesh.scale.y * targetRoot.scale.y);
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
      return;
    }

    if (wallId) {
      /* During scale drag, `objectChange` keeps mesh/residual root factors split — folding here would
       * compound sizes (see {@link constrainMyApartmentWallRootPose} `scaleDrag`). */
      if (!opts.transformControls.dragging) {
        constrainMyApartmentWallRootPose(targetRoot);
      }
      const mesh = findEditorMyApartmentWallSlabMesh(targetRoot);
      if (!mesh) return;
      targetRoot.updateMatrixWorld(true);
      const decorBounds = new THREE.Box3().setFromObject(targetRoot);
      const dy = THREE.MathUtils.clamp(
        decorBounds.min.y - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
        0,
        EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M,
      );
      const pW = new THREE.Vector3().setFromMatrixPosition(targetRoot.matrixWorld);
      const eulerLocal = new THREE.Euler().setFromQuaternion(targetRoot.quaternion, "YXZ");
      const yaw = snapOwnedApartmentDecorYawRad(eulerLocal.y);
      const pitch = THREE.MathUtils.clamp(
        snapOwnedApartmentDecorPitchRad(eulerLocal.x),
        -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
        OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
      );
      const wx = pW.x + m.prefabOriginX;
      const wz = pW.z + m.prefabOriginZ;
      const fx = THREE.MathUtils.clamp(
        (wx - m.strictMinX) / m.spanX,
        OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
        OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
      );
      const fz = THREE.MathUtils.clamp(
        (wz - m.strictMinZ) / m.spanZ,
        OWNED_APARTMENT_LAYOUT_FRACTION_MIN,
        OWNED_APARTMENT_LAYOUT_FRACTION_MAX,
      );
      const sizeX = Math.abs(mesh.scale.x * targetRoot.scale.x);
      const sizeY = Math.abs(mesh.scale.y * targetRoot.scale.y);
      const sizeZ = Math.abs(mesh.scale.z * targetRoot.scale.z);
      store.patchOwnedApartmentBuiltins((d) => ({
        ...d,
        wallItems: d.wallItems.map((item) =>
          item.id === wallId
            ? {
                ...item,
                fx,
                fz,
                dy,
                yawRad: yaw,
                pitchRad: pitch,
                sizeX,
                sizeY,
                sizeZ,
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

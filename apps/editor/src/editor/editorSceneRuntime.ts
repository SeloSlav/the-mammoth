import * as THREE from "three";
import { MOUSE } from "three";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
  createFPCamera,
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  type LocalFirstPersonPresenter,
} from "@the-mammoth/engine";
import {
  applyElevatorCabPartTransforms,
  glassOpeningFromProxyMesh,
  LANDING_DOOR_OPENING_PROXY_ID,
  rebuildLandingDoorPreviewSwing,
  applyStairWellPartTransforms,
  rebuildStairWellPreviewRoot,
} from "@the-mammoth/world";
import { useEditorStore } from "../state/editorStore.js";
import {
  disposeSceneEnvironment,
  disposeSubtreeGpuAssets,
} from "./disposeSubtree.js";
import { registerEditorSpawnCalculator } from "./spawnBridge.js";
import { registerEditorNavigationBridge } from "./editorNavigationBridge.js";
import { FpViewmodelEditorSession } from "./fpViewmodelEditorSession.js";
import { FpConsumableEditorSession } from "./fpConsumableEditorSession.js";
import {
  getFpViewmodelAuthoringPicks,
  registerFpViewmodelAuthoringBridge,
} from "./fpViewmodelAuthoringBridge.js";
import { registerFpConsumableAuthoringBridge } from "./fpConsumableAuthoringBridge.js";
import { resolveFpAuthorPickId } from "./fpAuthorPickResolve.js";
import { FpSelectionAabbOutline } from "./fpSelectionAabbOutline.js";
import { PreviewSelectionShapeOutline } from "./previewSelectionShapeOutline.js";
import {
  anchoredScaleAnchorLocalPoint,
  type AnchoredScaleAxis,
  anchoredScaleAxisFromTransformAxis,
  computeAnchoredScalePosition,
} from "./anchoredScaleGizmo.js";
import {
  adoptWeaponPresentationFileText,
  getLastWeaponPresentationFileText,
  registerWeaponPresentationPostSaveApply,
  resetWeaponPresentationEditorSyncStateForTeardown,
} from "./weaponPresentationEditorSync.js";
import { objectLivesUnderScene } from "./sceneGraphUtils.js";
import {
  floorPlacedObjectIdForTransformRoot,
  interiorEntityIdForTransformRoot,
  resolveCabPartTarget,
  resolveFloorPlacementTransformRoot,
  resolveGizmoFloorDocId,
  resolveGizmoInteriorDocId,
  resolveInteriorPlacementTransformRoot,
  resolveCabPartId,
  resolveLandingKitPickId,
  resolveLandingKitPickTarget,
  resolvePlacedId,
  resolveStairWellPartId,
  resolveStairWellPartTarget,
} from "./editorPlacementKeys.js";
import { emptyFloorDoc } from "./editorEmptyFloorDoc.js";
import {
  syncCellTransforms,
  syncDuplicateFloorGroups,
  syncFloorTransforms,
  syncInteriorTransforms,
  syncPrefabTransforms,
} from "./editorFloorTransformSync.js";
import { addEditorSceneLighting } from "./editorSceneLighting.js";
import { createEditorPmremEnvironment } from "./editorSceneEnvironment.js";
import { buildEditorStructuralRoot } from "./editorBuildingContentMount.js";

export async function mountEditorScene(canvas: HTMLCanvasElement): Promise<() => void> {
  const ORBIT_MAX_DISTANCE = 40;
  await assertWebGpuAdapterOrThrow();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8edf4);
  scene.fog = new THREE.Fog(0xe4eaf0, 95, 920);

  const camera = createFPCamera();
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: false });
  await renderer.init();
  assertWebGpuRendererBackend(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { dir, grid } = addEditorSceneLighting(scene);

  const textureLoader = new THREE.TextureLoader();
  const { pmrem, applyEnvironment } = createEditorPmremEnvironment(scene, renderer);

  const contentRoot = new THREE.Group();
  contentRoot.name = "editorContentRoot";
  scene.add(contentRoot);

  const transformControls = new TransformControls(camera, null);
  /**
   * `TransformControls.pointerMove` ignores moves unless `getPointer().button === -1` (see three
   * `TransformControls.js`). Some browsers send `button: 0` on captured `pointermove` while the
   * primary button is held, so drags never apply → nothing commits and the next sync snaps back.
   */
  {
    type TcPriv = { _getPointer: (e: PointerEvent) => { x: number; y: number; button: number } };
    const tc = transformControls as unknown as TcPriv;
    const orig = tc._getPointer.bind(transformControls);
    tc._getPointer = function (this: TransformControls, event: PointerEvent) {
      const out = orig(event);
      if (this.dragging === true && event.type === "pointermove") {
        return { ...out, button: -1 };
      }
      return out;
    };
  }
  /**
   * {@link TransformControls} dispatches `change` when `object`/camera/mode/etc. are set.
   * Our listener calls into Zustand; a nested subscribe can still see stale `prev` and think
   * the FP gizmo must re-sync → infinite recursion. Ignore `change` during programmatic sync.
   */
  let programmaticTransformControlsDepth = 0;
  function withProgrammaticTransformControls<T>(fn: () => T): T {
    programmaticTransformControlsDepth++;
    try {
      return fn();
    } finally {
      programmaticTransformControlsDepth--;
    }
  }

  /**
   * True while a floor/interior gizmo drag is in progress (TransformControls `mouseDown`…`mouseUp`).
   * Used with {@link TransformControls#dragging} so we never run {@link syncTransformsFromStore}
   * mid-gesture: generic `change` events (camera, mode, etc.) must not pull stale doc data onto the
   * mesh while Zustand is catching up.
   */
  let levelEditorTransformGesture = false;
  let levelEditorAnchoredScaleGesture:
    | {
        object: THREE.Object3D;
        startPosition: THREE.Vector3;
        startScale: THREE.Vector3;
        startRotation: THREE.Quaternion;
        axis: AnchoredScaleAxis;
        localBounds: THREE.Box3;
        handleAxisSigns: THREE.Vector3;
      }
    | null = null;
  function apartmentLandingKitUsesWholeDoorGizmo(): boolean {
    const st = useEditorStore.getState();
    return (
      st.mode === "landing_preview" &&
      st.landingKitVariant === "apartment" &&
      st.selectedId === "landing_door_kit"
    );
  }

  function landingKitPickOptions(): { solidLeafAsWhole?: boolean } | undefined {
    return useEditorStore.getState().landingKitVariant === "apartment"
      ? { solidLeafAsWhole: true }
      : undefined;
  }
  const _anchoredScaleInvWorld = new THREE.Matrix4();
  const _anchoredScaleWorldBox = new THREE.Box3();
  const _anchoredScaleLocalBox = new THREE.Box3();

  function localBoundsForAnchoredScale(root: THREE.Object3D): THREE.Box3 | null {
    root.updateWorldMatrix(true, true);
    _anchoredScaleInvWorld.copy(root.matrixWorld).invert();
    let has = false;
    const bounds = new THREE.Box3();
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const geom = obj.geometry;
      if (!geom) return;
      geom.computeBoundingBox();
      if (!geom.boundingBox) return;
      obj.updateWorldMatrix(true, false);
      _anchoredScaleWorldBox.copy(geom.boundingBox).applyMatrix4(obj.matrixWorld);
      _anchoredScaleLocalBox.copy(_anchoredScaleWorldBox).applyMatrix4(_anchoredScaleInvWorld);
      if (!has) {
        bounds.copy(_anchoredScaleLocalBox);
        has = true;
      } else {
        bounds.union(_anchoredScaleLocalBox);
      }
    });
    return has ? bounds : null;
  }

  function shouldUseAnchoredScaleGesture(): boolean {
    const st = useEditorStore.getState();
    if (isFpMode(st.mode) || st.transformMode !== "scale") return false;
    return !(st.mode === "landing_preview" && st.selectedId === LANDING_DOOR_OPENING_PROXY_ID);
  }

  function primeAnchoredScaleGesture(): void {
    levelEditorAnchoredScaleGesture = null;
    if (!shouldUseAnchoredScaleGesture()) return;
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (!attached) return;
    const axis = anchoredScaleAxisFromTransformAxis(
      (transformControls as unknown as { axis?: string | null }).axis,
    );
    if (!axis) return;
    const pointStart = (
      transformControls as unknown as { pointStart?: THREE.Vector3 | null }
    ).pointStart;
    const localBounds = localBoundsForAnchoredScale(attached);
    if (!localBounds) return;
    levelEditorAnchoredScaleGesture = {
      object: attached,
      startPosition: attached.position.clone(),
      startScale: attached.scale.clone(),
      startRotation: attached.quaternion.clone(),
      axis,
      localBounds: localBounds.clone(),
      handleAxisSigns: new THREE.Vector3(
        axis.includes("X") ? (pointStart && pointStart.x < 0 ? -1 : 1) : 0,
        axis.includes("Y") ? (pointStart && pointStart.y < 0 ? -1 : 1) : 0,
        axis.includes("Z") ? (pointStart && pointStart.z < 0 ? -1 : 1) : 0,
      ),
    };
  }

  function applyAnchoredScaleGesture(): void {
    if (
      !shouldUseAnchoredScaleGesture() ||
      !transformControls.dragging ||
      !levelEditorAnchoredScaleGesture
    ) {
      return;
    }
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (!attached || attached !== levelEditorAnchoredScaleGesture.object) return;
    const anchorLocalPoint = anchoredScaleAnchorLocalPoint({
      axis: levelEditorAnchoredScaleGesture.axis,
      localBounds: levelEditorAnchoredScaleGesture.localBounds,
      handleAxisSigns: levelEditorAnchoredScaleGesture.handleAxisSigns,
    });
    const nextPos = computeAnchoredScalePosition({
      startPosition: levelEditorAnchoredScaleGesture.startPosition,
      startScale: levelEditorAnchoredScaleGesture.startScale,
      currentScale: attached.scale,
      rotation: levelEditorAnchoredScaleGesture.startRotation,
      anchorLocalPoint,
    });
    withProgrammaticTransformControls(() => {
      attached.position.copy(nextPos);
    });
  }

  const readStairBaseVec3 = (
    obj: THREE.Object3D,
    key: "editorStairBasePosition" | "editorStairBaseScale",
    fallback: readonly [number, number, number],
  ): [number, number, number] => {
    const raw = obj.userData[key];
    if (
      Array.isArray(raw) &&
      raw.length >= 3 &&
      raw.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return [raw[0]!, raw[1]!, raw[2]!];
    }
    return [fallback[0], fallback[1], fallback[2]];
  };

  const readStairBaseQuat = (
    obj: THREE.Object3D,
  ): [number, number, number, number] => {
    const raw = obj.userData.editorStairBaseRotation;
    if (
      Array.isArray(raw) &&
      raw.length >= 4 &&
      raw.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return [raw[0]!, raw[1]!, raw[2]!, raw[3]!];
    }
    return [0, 0, 0, 1];
  };

  function commitLevelEditorAttachedTransformToStore(): void {
    if (programmaticTransformControlsDepth > 0) return;
    const store = useEditorStore.getState();
    const attached = transformControls.object as THREE.Object3D | undefined;
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
      const pos: [number, number, number] = [o.position.x, o.position.y, o.position.z];
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
                : store.landingKitDef.panelWidthM ?? 1.18;
            const heightBase =
              typeof o.userData.editorLandingPanelHeightM === "number"
                ? o.userData.editorLandingPanelHeightM
                : store.landingKitDef.panelHeightM ?? 2.0;
            const nextWidth = THREE.MathUtils.clamp(widthBase * Math.abs(o.scale.z), 0.2, 3.0);
            const nextHeight = THREE.MathUtils.clamp(heightBase * Math.abs(o.scale.y), 0.4, 3.5);
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
      const pos: [number, number, number] = [o.position.x, o.position.y, o.position.z];
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
      const baseQ = new THREE.Quaternion(baseRot[0], baseRot[1], baseRot[2], baseRot[3]);
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
      store.updatePlacedObject(resolveGizmoFloorDocId(root, store.activeFloorDocId), id, {
        position: pos,
        rotation: rot,
        scale: sc,
      });
      syncDuplicateFloorGroups(contentRoot, id, root);
    } else if (store.mode === "interior") {
      const intDocId = resolveGizmoInteriorDocId(attached, store.activeInteriorDocId);
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
        (typeof attached.userData.placedObjectId === "string" && attached.userData.placedObjectId) ||
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
        (typeof attached.userData.placedObjectId === "string" && attached.userData.placedObjectId) ||
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

  transformControls.addEventListener("mouseDown", () => {
    if (isFpMode(useEditorStore.getState().mode)) return;
    levelEditorTransformGesture = true;
    primeAnchoredScaleGesture();
  });
  transformControls.addEventListener("mouseUp", () => {
    if (isFpMode(useEditorStore.getState().mode)) return;
    levelEditorTransformGesture = false;
    levelEditorAnchoredScaleGesture = null;
    /** No `objectChange` if the pointer never moved; still persist rest pose. */
    commitLevelEditorAttachedTransformToStore();
    /** After `dragging` flips false, subscriber may skip sync; realign mesh ↔ store once. */
    queueMicrotask(() => {
      const m = useEditorStore.getState().mode;
      if (!isFpMode(m)) {
        syncTransformsFromStore();
        /** Landing swing rebuild replaces the mesh under the gizmo; re-attach to the new proxy. */
        syncTransformAttachment();
      }
    });
  });

  transformControls.addEventListener("dragging-changed", (ev) => {
    const raw = ev as unknown as { value?: boolean };
    const active = raw.value === true;
    const st = useEditorStore.getState();
    if (isFpMode(st.mode)) {
      orbitControls.enabled = !active && st.fpAuthorCamera === "orbit";
      return;
    }
    /** Immediate camera off/on so fly/orbit release before the next Zustand tick. */
    if (active) {
      orbitControls.enabled = false;
      flyControls.enabled = false;
    } else {
      orbitControls.enabled = st.cameraMode !== "fly";
      flyControls.enabled = st.cameraMode === "fly";
    }
    if (!active) levelEditorTransformGesture = false;
    if (!active) levelEditorAnchoredScaleGesture = null;
    if (active) useEditorStore.getState().beginTransaction();
    else useEditorStore.getState().commitTransaction();
  });
  transformControls.addEventListener("objectChange", () => {
    applyAnchoredScaleGesture();
    commitLevelEditorAttachedTransformToStore();
  });
  transformControls.addEventListener("change", () => {
    if (programmaticTransformControlsDepth > 0) return;
    const store = useEditorStore.getState();
    if (isWeaponFpAuthoringState(store)) {
      const pres = fpSession?.getPresenter();
      const attached = transformControls.object as THREE.Object3D | undefined;
        if (pres && attached) {
        const pid = pres.getAuthoringPickList().find((p) => p.object === attached)?.id;
        if (pid === "rigRoot") pres.syncAuthoringRigRestFromAttachedRig();
        else if (pid === "weaponRoot") pres.syncFpWeaponMountBaselineFromRoot();
      }
      store.bumpFpAuthorLive();
    }
  });
  const transformHelper = transformControls.getHelper();
  scene.add(transformHelper);

  /** Defer {@link OrbitControls#connect} until after {@link TransformControls#connect} (see `rewireCanvasPrimaryPointerListeners`). */
  const orbitControls = new OrbitControls(camera, null);
  orbitControls.enableDamping = true;
  orbitControls.target.set(0, 1.45, 0);
  orbitControls.minDistance = 0.22;
  orbitControls.maxDistance = ORBIT_MAX_DISTANCE;
  orbitControls.update();
  const flyControls = new FlyControls(camera, canvas);
  flyControls.movementSpeed = useEditorStore.getState().flySpeedMps;
  flyControls.rollSpeed = 0.6;
  flyControls.dragToLook = true;
  flyControls.autoForward = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const fpSelectionOutline = new FpSelectionAabbOutline();
  fpSelectionOutline.visible = false;
  scene.add(fpSelectionOutline);
  const previewSelectionOutline = new PreviewSelectionShapeOutline(0xff4fa3);
  previewSelectionOutline.visible = false;
  scene.add(previewSelectionOutline);

  let fpClickCandidate: { x: number; y: number } | null = null;
  let levelClickCandidate:
    | {
        x: number;
        y: number;
        id: string | null;
        target: THREE.Object3D | null;
        hitFloorDocId: string | null;
        hitLevelIndex: number | null;
      }
    | null = null;
  let preferredPreviewSelectionTarget: THREE.Object3D | null = null;

  let buildingRoot: THREE.Group | null = null;
  let lastBuiltContentEpoch = -1;
  let shouldFrameAfterRebuild = true;

  let fpSession: FpViewmodelEditorSession | null = null;
  let fpSessionLoading = false;
  let fpConsumableSession: FpConsumableEditorSession | null = null;
  let fpConsumableSessionLoading = false;
  /** Guards nested store updates during FP teardown (`setFpAuthorPickList([])`, etc.). */
  let fpTeardownInProgress = false;
  /** Wireframe at canonical rig rest (head-pitch space); editor-only. */
  let fpDefaultRigAnchor: THREE.LineSegments | null = null;
  /** Last FP gizmo attach signature from store (refreshed in syncFpTransformAttachment). */
  let lastFpGizmoAttachKey = "";

  type EditorStoreSnapshot = ReturnType<typeof useEditorStore.getState>;
  const isFpMode = (mode: EditorStoreSnapshot["mode"]) =>
    mode === "fp_viewmodel" || mode === "fp_consumable";
  const isSharedPreviewMode = (mode: EditorStoreSnapshot["mode"]) =>
    mode === "cab" || mode === "landing_preview" || mode === "stairwell_preview";
  const getFpAuthorSubjectKind = (s: EditorStoreSnapshot) =>
    s.fpAuthorSubjectKind === "consumable" ? "consumable" : "weapon";
  const isWeaponFpAuthoringState = (s: EditorStoreSnapshot) =>
    s.mode === "fp_viewmodel" && getFpAuthorSubjectKind(s) === "weapon";
  const isConsumableFpAuthoringState = (s: EditorStoreSnapshot) =>
    s.mode === "fp_consumable" || (s.mode === "fp_viewmodel" && getFpAuthorSubjectKind(s) === "consumable");

  function ancestorLevelIndex(obj: THREE.Object3D | null): number | null {
    let cur = obj;
    while (cur) {
      const raw = cur.userData.mammothPlateLevelIndex;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      cur = cur.parent;
    }
    return null;
  }

  function frameBox(box: THREE.Box3): void {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    camera.up.set(0, 1, 0);
    orbitControls.target.copy(center);
    camera.position
      .copy(center)
      .add(new THREE.Vector3(-0.82, 0.46, 0.68).normalize().multiplyScalar(Math.max(span * 1.5, 16)));
    camera.lookAt(center);
    orbitControls.update();
  }

  function frameObject(obj: THREE.Object3D | null): void {
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    frameBox(box);
  }

  function frameFocusedStoryObject(): void {
    if (!buildingRoot) return;
    const focusedLevel = useEditorStore.getState().focusedStoryLevelIndex;
    const levelNodes: THREE.Object3D[] = [];
    buildingRoot.traverse((child) => {
      if (child.userData.mammothPlateLevelIndex === focusedLevel) levelNodes.push(child);
    });
    const box = new THREE.Box3();
    for (const node of levelNodes) {
      box.expandByObject(node);
    }
    if (box.isEmpty()) {
      frameObject(buildingRoot);
      return;
    }
    frameBox(box);
  }

  function findBestSelectionTarget(): THREE.Object3D | null {
    const s = useEditorStore.getState();
    if (!buildingRoot || !s.selectedId) return null;
    if (
      preferredPreviewSelectionTarget &&
      objectLivesUnderScene(preferredPreviewSelectionTarget, scene)
    ) {
      const preferredId =
        s.mode === "cab"
          ? resolveCabPartId(preferredPreviewSelectionTarget)
          : s.mode === "landing_preview"
            ? resolveLandingKitPickId(preferredPreviewSelectionTarget, landingKitPickOptions())
            : s.mode === "stairwell_preview"
              ? resolveStairWellPartId(preferredPreviewSelectionTarget)
              : null;
      if (preferredId === s.selectedId) return preferredPreviewSelectionTarget;
    }
    preferredPreviewSelectionTarget = null;
    let target: THREE.Object3D | null = null;
    let bestRank = -1;
    let bestD = Infinity;
    if (s.mode === "cab") {
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorCabPartId as string | undefined;
        if (pid !== s.selectedId) return;
        target = o;
      });
      return target;
    }
    if (s.mode === "landing_preview") {
      if (s.selectedId === "landing_door_kit") {
        const door = buildingRoot.getObjectByName("editor_landing_door");
        return door ?? null;
      }
      if (s.selectedId === LANDING_DOOR_OPENING_PROXY_ID) {
        buildingRoot.traverse((o) => {
          if (o.userData.editorLandingOpeningProxy === true) target = o;
        });
        return target;
      }
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorLandingPartId as string | undefined;
        if (pid === s.selectedId) target = o;
      });
      return target;
    }
    if (s.mode === "stairwell_preview") {
      buildingRoot.traverse((o) => {
        const pid = o.userData.editorStairPartId as string | undefined;
        if (pid === s.selectedId && target === null) target = o;
      });
      return target;
    }
    if (s.mode === "floor") {
      buildingRoot.traverse((o) => {
        const root = resolveFloorPlacementTransformRoot(o, s.floorDocs);
        if (root !== o) return;
        const id = floorPlacedObjectIdForTransformRoot(o, s.floorDocs);
        if (id !== s.selectedId) return;
        if (resolveGizmoFloorDocId(o, s.activeFloorDocId) !== s.activeFloorDocId) return;
        const levelIndex = ancestorLevelIndex(o);
        const rank = levelIndex === s.focusedStoryLevelIndex ? 2 : 1;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const d = wp.distanceToSquared(camera.position);
        if (rank > bestRank || (rank === bestRank && d < bestD)) {
          bestRank = rank;
          bestD = d;
          target = o;
        }
      });
      return target;
    }
    if (s.mode === "interior") {
      const intDoc = s.interiorDocs[s.activeInteriorDocId];
      buildingRoot.traverse((o) => {
        const root = resolveInteriorPlacementTransformRoot(o, intDoc);
        if (root !== o) return;
        const eid = interiorEntityIdForTransformRoot(o);
        if (eid !== s.selectedId) return;
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const d = wp.distanceToSquared(camera.position);
        if (d < bestD) {
          bestD = d;
          target = o;
        }
      });
      return target;
    }
    buildingRoot.traverse((o) => {
      const id =
        (typeof o.userData.placedObjectId === "string" && o.userData.placedObjectId) || o.name;
      if (id !== s.selectedId) return;
      const levelIndex = ancestorLevelIndex(o);
      const rank = levelIndex === s.focusedStoryLevelIndex ? 1 : 0;
      const wp = new THREE.Vector3();
      o.getWorldPosition(wp);
      const d = wp.distanceToSquared(camera.position);
      if (rank > bestRank || (rank === bestRank && d < bestD)) {
        bestRank = rank;
        bestD = d;
        target = o;
      }
    });
    return target;
  }

  registerEditorNavigationBridge({
    frameEditorBuilding: () => frameObject(buildingRoot),
    frameEditorSelection: () => frameObject(findBestSelectionTarget()),
    frameFocusedStory: frameFocusedStoryObject,
  });

  function disposeFpDefaultRigAnchor(): void {
    if (!fpDefaultRigAnchor) return;
    fpDefaultRigAnchor.parent?.remove(fpDefaultRigAnchor);
    fpDefaultRigAnchor.geometry.dispose();
    (fpDefaultRigAnchor.material as THREE.Material).dispose();
    fpDefaultRigAnchor = null;
  }

  function attachFpDefaultRigAnchor(pres: LocalFirstPersonPresenter): void {
    disposeFpDefaultRigAnchor();
    const fpRoot = pres.getFpViewmodelAuthoringRoot();
    const box = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const mat = new THREE.LineBasicMaterial({
      color: 0x5599dd,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
    const lines = new THREE.LineSegments(edges, mat);
    lines.name = "fp_default_rig_anchor_editor";
    const d = FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED.positionM;
    lines.position.set(d.x, d.y, d.z);
    lines.renderOrder = 999;
    fpRoot.add(lines);
    fpDefaultRigAnchor = lines;
  }

  function frameOrbitOnActiveFpSession(): void {
    scene.updateMatrixWorld(true);
    const t = new THREE.Vector3();
    const st = useEditorStore.getState();
    let hit = false;
    if (isWeaponFpAuthoringState(st)) {
      hit = fpSession?.getPresenter()?.getAuthoringOrbitTargetWorld(t) ?? false;
    } else if (isConsumableFpAuthoringState(st)) {
      hit = fpConsumableSession?.getAuthoringOrbitTarget(t) ?? false;
    }
    if (!hit) return;
    orbitControls.target.copy(t);
    const dir = new THREE.Vector3(0.58, 0.22, 0.78).normalize();
    const dist = Math.min(1.05, orbitControls.maxDistance * 0.35);
    camera.position.copy(t).addScaledVector(dir, dist);
    orbitControls.update();
  }

  /** Kept for compatibility with existing weapon authoring bridge registration. */
  function frameOrbitOnFpViewmodel(): void {
    frameOrbitOnActiveFpSession();
  }

  function applyLevelEditorMouseButtons(st: ReturnType<typeof useEditorStore.getState>): void {
    void st;
    orbitControls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };
  }

  function applyFpOrbitMouseButtons(): void {
    orbitControls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };
  }

  function shouldUseEditorHdri(st: EditorStoreSnapshot): boolean {
    return !isFpMode(st.mode) && !isSharedPreviewMode(st.mode) && st.useHdriEnvironment;
  }

  function shouldShowEditorGrid(st: EditorStoreSnapshot): boolean {
    return !isFpMode(st.mode) && !isSharedPreviewMode(st.mode);
  }

  /**
   * Snap to engine defaults, then nudge `rigRoot` so the crowbar mount tracks a fixed point in the
   * **gameplay camera** frame (same solver as tuning). In-memory only; use Save layout to persist.
   */
  function frameMountIntoGameplayView(): void {
    const pres = fpSession?.getPresenter();
    const cam = fpSession?.getGameplayCamera();
    if (!pres || !cam) return;
    pres.snapRigRootToAuthoringDefaults();
    if (!pres.frameWeaponMountIntoGameplayCamera(scene, cam)) {
      useEditorStore.getState().showFpAuthorToast("Could not align mount to gameplay camera (mesh not ready).", 6500);
      return;
    }
    useEditorStore.getState().bumpFpAuthorLive();
    maybeSyncFpGizmoFromStore();
    useEditorStore
      .getState()
      .showFpAuthorToast(
        "Fit hand + weapon to the gameplay camera (in memory). Save layout to write JSON.",
        6200,
      );
  }

  function disposeFpViewmodelRuntimeOnly() {
    if (fpTeardownInProgress) return;
    fpTeardownInProgress = true;
    try {
      levelEditorTransformGesture = false;
      transformControls.enabled = true;
      rewireCanvasPrimaryPointerListeners();
      resetWeaponPresentationEditorSyncStateForTeardown();
      disposeFpDefaultRigAnchor();
      registerFpViewmodelAuthoringBridge(null);
      registerWeaponPresentationPostSaveApply(null);
      lastFpGizmoAttachKey = "";
      fpClickCandidate = null;
      fpSelectionOutline.setFromObject(null);
      // Detach before tearing down the FP graph so we never render with a control target that was
      // already removed from the scene (TransformControls warns and can glitch).
      withProgrammaticTransformControls(() => transformControls.detach());
      fpSession?.dispose();
      fpSession = null;
      fpSessionLoading = false;
      // Store updates run synchronously; nested subscribers still see outer `prev` until the outer
      // callback returns. Clear session *before* pick list so weapon-change teardown cannot recurse.
      useEditorStore.getState().setFpAuthorPickList([]);
    } finally {
      fpTeardownInProgress = false;
    }
  }

  function disposeFpConsumableRuntimeOnly() {
    if (fpTeardownInProgress) return;
    fpTeardownInProgress = true;
    try {
      levelEditorTransformGesture = false;
      transformControls.enabled = true;
      rewireCanvasPrimaryPointerListeners();
      registerFpConsumableAuthoringBridge(null);
      registerFpViewmodelAuthoringBridge(null);
      lastFpGizmoAttachKey = "";
      fpClickCandidate = null;
      fpSelectionOutline.setFromObject(null);
      withProgrammaticTransformControls(() => transformControls.detach());
      fpConsumableSession?.dispose();
      fpConsumableSession = null;
      fpConsumableSessionLoading = false;
      useEditorStore.getState().setFpAuthorPickList([]);
    } finally {
      fpTeardownInProgress = false;
    }
  }

  function teardownFpSession() {
    disposeFpViewmodelRuntimeOnly();
    disposeFpConsumableRuntimeOnly();
    contentRoot.visible = true;
    grid.visible = true;
    shouldFrameAfterRebuild = true;
    camera.position.set(-38, 28, 22);
    camera.lookAt(2, 18, 0);
    orbitControls.target.set(0, 1.45, 0);
    orbitControls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    };
    orbitControls.update();
  }

  function syncFpTransformAttachment() {
    withProgrammaticTransformControls(() => {
      const s = useEditorStore.getState();
      const picks =
        isWeaponFpAuthoringState(s)
          ? (fpSession?.getPresenter()?.getAuthoringPickList() ?? [])
          : isConsumableFpAuthoringState(s)
            ? (fpConsumableSession?.getPickList() ?? [])
            : [];
      if (picks.length === 0) {
        transformControls.detach();
        lastFpGizmoAttachKey = "";
        transformControls.enabled = true;
        return;
      }
      const hit = picks.find((p) => p.id === s.fpAuthorTargetId) ?? picks[0];
      transformControls.detach();
      if (hit && objectLivesUnderScene(hit.object, scene)) {
        transformControls.enabled = true;
        transformControls.attach(hit.object);
        transformControls.setMode(s.transformMode);
        // World-aligned handles (same as floor/interior editor default): local space tied
        // weapon/hand euler to screen-unfriendly axes; world space tracks drag vs arrow direction.
        transformControls.setSpace("world");
        // Orbit camera is meters from the subject — large handles. Gameplay uses the in-head lens;
        // 2.25 fills the frustum and hides the hand/weapon (same rig as `mountFpSession`).
        transformControls.setSize(s.fpAuthorCamera === "gameplay" ? 0.62 : 2.25);
        const snap = s.gridSnapM;
        transformControls.setTranslationSnap(snap > 0 ? snap : null);
        transformControls.setRotationSnap(snap > 0 ? THREE.MathUtils.degToRad(15) : null);
        transformControls.setScaleSnap(snap > 0 ? snap : null);
        lastFpGizmoAttachKey = `${s.fpAuthorTargetId}\0${s.transformMode}\0${s.gridSnapM}\0${s.fpAuthorCamera}`;
      } else {
        lastFpGizmoAttachKey = "";
        transformControls.enabled = true;
      }
    });
  }

  /** Re-attach gizmo when store-driven target/mode/snap changed (runs from RAF; avoids missed zustand subscribe edges). */
  function maybeSyncFpGizmoFromStore() {
    const s = useEditorStore.getState();
    const hasFpPicks =
      (isWeaponFpAuthoringState(s) && fpSession?.getPresenter() != null) ||
      (isConsumableFpAuthoringState(s) && fpConsumableSession?.isReady());
    if (!hasFpPicks) {
      lastFpGizmoAttachKey = "";
      return;
    }
    const key = `${s.fpAuthorTargetId}\0${s.transformMode}\0${s.gridSnapM}\0${s.fpAuthorCamera}`;
    if (key === lastFpGizmoAttachKey) return;
    syncFpTransformAttachment();
  }

  function ensureFpSession() {
    if (fpSession || fpSessionLoading) return;
    fpSessionLoading = true;
    const requestedWeaponId = useEditorStore.getState().fpAuthorWeaponId;
    useEditorStore.getState().setFpAuthorInitMessage("Loading FP viewmodels…");
    void FpViewmodelEditorSession.create(scene, requestedWeaponId)
      .then((s) => {
        fpSessionLoading = false;
        const store = useEditorStore.getState();
        if (!isWeaponFpAuthoringState(store) || store.fpAuthorWeaponId !== requestedWeaponId) {
          s.dispose();
          if (isWeaponFpAuthoringState(store)) ensureFpSession();
          else useEditorStore.getState().setFpAuthorInitMessage(null);
          return;
        }
        if (s.getInitError()) {
          useEditorStore.getState().setFpAuthorInitMessage(s.getInitError());
          s.dispose();
          return;
        }
        fpSession = s;
        useEditorStore.getState().setFpAuthorInitMessage(null);
        useEditorStore.getState().bumpFpAuthorLive();
        registerWeaponPresentationPostSaveApply((weaponId, json) => {
          const pres = fpSession?.getPresenter();
          if (!pres) return;
          if (useEditorStore.getState().fpAuthorWeaponId !== weaponId) return;
          adoptWeaponPresentationFileText(pres, weaponId, json);
          maybeSyncFpGizmoFromStore();
        });
        void (async () => {
          try {
            const wid = useEditorStore.getState().fpAuthorWeaponId;
            const r = await fetch(`/content/weapons/${wid}.presentation.json`, {
              cache: "no-store",
            });
            if (!r.ok) return;
            const text = await r.text();
            if (!isWeaponFpAuthoringState(useEditorStore.getState())) return;
            const pres = fpSession?.getPresenter();
            if (!pres) return;
            adoptWeaponPresentationFileText(pres, wid, text);
            maybeSyncFpGizmoFromStore();
          } catch {
            /* ignore */
          }
        })();
        registerFpViewmodelAuthoringBridge({
          getPicks: () => fpSession?.getPresenter()?.getAuthoringPickList() ?? [],
          getPresenter: () => fpSession?.getPresenter(),
          frameOrbitOnViewmodel: frameOrbitOnFpViewmodel,
          frameMountIntoGameplayView,
        });
        contentRoot.visible = false;
        grid.visible = false;
        const presReady = fpSession.getPresenter();
        if (presReady) attachFpDefaultRigAnchor(presReady);
        frameOrbitOnFpViewmodel();
        syncTransformAttachment();
      })
      .catch((e) => {
        fpSessionLoading = false;
        const store = useEditorStore.getState();
        if (!isWeaponFpAuthoringState(store) || store.fpAuthorWeaponId !== requestedWeaponId) {
          if (isWeaponFpAuthoringState(store)) ensureFpSession();
          return;
        }
        useEditorStore
          .getState()
          .setFpAuthorInitMessage(e instanceof Error ? e.message : String(e));
      });
  }

  function ensureFpConsumableSession() {
    if (fpConsumableSession || fpConsumableSessionLoading) return;
    fpConsumableSessionLoading = true;
    const requestedConsumableId = useEditorStore.getState().fpAuthorConsumableId;
    useEditorStore.getState().setFpAuthorInitMessage("Loading FP consumable…");
    void FpConsumableEditorSession.create(scene, requestedConsumableId)
      .then((s) => {
        fpConsumableSessionLoading = false;
        const store = useEditorStore.getState();
        if (!isConsumableFpAuthoringState(store) || store.fpAuthorConsumableId !== requestedConsumableId) {
          s.dispose();
          if (isConsumableFpAuthoringState(store)) ensureFpConsumableSession();
          else useEditorStore.getState().setFpAuthorInitMessage(null);
          return;
        }
        if (s.getInitError()) {
          useEditorStore.getState().setFpAuthorInitMessage(s.getInitError());
          s.dispose();
          return;
        }
        fpConsumableSession = s;
        useEditorStore.getState().setFpAuthorInitMessage(null);
        useEditorStore.getState().bumpFpAuthorLive();

        // Load authored presentation JSON and apply it to the session.
        void (async () => {
          try {
            const r = await fetch(
              `/content/consumables/${requestedConsumableId}.presentation.json`,
              { cache: "no-store" },
            );
            if (!r.ok) return;
            const doc = JSON.parse(await r.text()) as { firstPerson?: { mount?: unknown } };
            const mount = doc?.firstPerson?.mount;
            if (mount && typeof mount === "object") {
              fpConsumableSession?.applyMount(mount as Parameters<typeof s.applyMount>[0]);
            }
          } catch {
            /* ignore — session starts at default position */
          }
        })();

        registerFpConsumableAuthoringBridge({
          getSession: () => fpConsumableSession,
        });
        // Re-use the same picks bridge so the gizmo infra works.
        registerFpViewmodelAuthoringBridge({
          getPicks: () => fpConsumableSession?.getPickList() ?? [],
          frameOrbitOnViewmodel: frameOrbitOnActiveFpSession,
        });
        contentRoot.visible = false;
        grid.visible = false;
        frameOrbitOnActiveFpSession();
        syncTransformAttachment();
      })
      .catch((e) => {
        fpConsumableSessionLoading = false;
        const store = useEditorStore.getState();
        if (!isConsumableFpAuthoringState(store) || store.fpAuthorConsumableId !== requestedConsumableId) {
          if (isConsumableFpAuthoringState(store)) ensureFpConsumableSession();
          return;
        }
        useEditorStore
          .getState()
          .setFpAuthorInitMessage(e instanceof Error ? e.message : String(e));
      });
  }

  const rebuildStructural = () => {
    const s = useEditorStore.getState();
    if (isFpMode(s.mode)) return;
    const ep = s.contentStructureEpoch;
    if (ep === lastBuiltContentEpoch) return;
    lastBuiltContentEpoch = ep;

    if (buildingRoot) {
      contentRoot.remove(buildingRoot);
      disposeSubtreeGpuAssets(buildingRoot);
      buildingRoot = null;
    }

    buildingRoot = buildEditorStructuralRoot({
      mode: s.mode,
      workspace: s.workspace,
      building: s.building,
      floorDocs: s.floorDocs,
      floorOverrideDocs: s.floorOverrideDocs,
      activeInteriorDocId: s.activeInteriorDocId,
      interiorDocs: s.interiorDocs,
      activeCellDocId: s.activeCellDocId,
      cellDocs: s.cellDocs,
      activePrefabDefId: s.activePrefabDefId,
      prefabDefs: s.prefabDefs,
      activeFloorOverrideDocId: s.activeFloorOverrideDocId,
      elevatorCabDef: s.elevatorCabDef,
      landingKitDef: s.landingKitDef,
      stairWellDef: s.stairWellDef,
      stairWellAuthorScope: s.stairWellAuthorScope,
      textureLoader,
      emptyFloorDoc,
    });

    contentRoot.add(buildingRoot);
    syncTransformsFromStore();
    syncTransformAttachment();
    if (shouldFrameAfterRebuild) {
      shouldFrameAfterRebuild = false;
      if (s.mode === "floor" || s.mode === "floor_override") frameFocusedStoryObject();
      else if (
        s.mode === "cab" ||
        s.mode === "landing_preview" ||
        s.mode === "stairwell_preview"
      )
        frameObject(buildingRoot);
      else frameObject(buildingRoot);
    }
  };

  function syncTransformsFromStore() {
    if (!buildingRoot) return;
    const s = useEditorStore.getState();
    if (s.mode === "floor") {
      syncFloorTransforms(buildingRoot, s.floorDocs);
      if (s.workspace === "world") {
        const cellDoc = s.cellDocs[s.activeCellDocId];
        if (cellDoc) {
          const cellRoot = buildingRoot.getObjectByName(`cell:${cellDoc.id}`);
          if (cellRoot) syncCellTransforms(cellRoot, cellDoc);
        }
      }
    } else if (s.mode === "interior") {
      const doc = s.interiorDocs[s.activeInteriorDocId];
      if (doc) syncInteriorTransforms(buildingRoot, doc);
    } else if (s.mode === "cell") {
      const doc = s.cellDocs[s.activeCellDocId];
      if (doc) syncCellTransforms(buildingRoot, doc);
    } else if (s.mode === "prefab") {
      const doc = s.activePrefabDefId ? s.prefabDefs[s.activePrefabDefId] : undefined;
      if (doc) syncPrefabTransforms(buildingRoot, doc);
    } else if (s.mode === "floor_override") {
      syncFloorTransforms(buildingRoot, s.floorDocs);
      if (s.workspace === "world") {
        const cellDoc = s.cellDocs[s.activeCellDocId];
        if (cellDoc) {
          const cellRoot = buildingRoot.getObjectByName(`cell:${cellDoc.id}`);
          if (cellRoot) syncCellTransforms(cellRoot, cellDoc);
        }
      }
    } else if (s.mode === "cab") {
      const cabPreview = buildingRoot.getObjectByName("editor_elevator_cab_preview");
      if (cabPreview) applyElevatorCabPartTransforms(cabPreview, s.elevatorCabDef);
    } else if (s.mode === "landing_preview") {
      const door = buildingRoot.getObjectByName("editor_landing_door");
      if (door instanceof THREE.Group) {
        rebuildLandingDoorPreviewSwing(door, s.landingKitDef);
      }
    } else if (s.mode === "stairwell_preview") {
      applyStairWellPartTransforms(buildingRoot, s.stairWellDef);
    }
  }

  function syncTransformAttachment() {
    withProgrammaticTransformControls(() => {
      const s = useEditorStore.getState();
      transformControls.detach();
      if (isFpMode(s.mode)) {
        syncFpTransformAttachment();
        return;
      }
      if (s.mode === "landing_preview" && s.selectedId === "landing_door_kit") {
        if (!apartmentLandingKitUsesWholeDoorGizmo()) return;
      }
      const target = findBestSelectionTarget();
      if (target) {
        transformControls.attach(target);
        transformControls.setMode(s.transformMode);
        const opening =
          s.mode === "landing_preview" && s.selectedId === LANDING_DOOR_OPENING_PROXY_ID;
        transformControls.setSize(opening ? 1.35 : 1);
        if (opening) {
          transformControls.setTranslationSnap(null);
          transformControls.setRotationSnap(null);
          transformControls.setScaleSnap(null);
        } else {
          const snap = s.gridSnapM;
          transformControls.setTranslationSnap(snap > 0 ? snap : null);
          transformControls.setRotationSnap(snap > 0 ? THREE.MathUtils.degToRad(15) : null);
          transformControls.setScaleSnap(snap > 0 ? snap : null);
        }
      }
    });
  }

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (fpSession) {
      const g = fpSession.getGameplayCamera();
      g.aspect = w / h;
      g.updateProjectionMatrix();
    }
    if (fpConsumableSession) {
      const g = fpConsumableSession.getGameplayCamera();
      g.aspect = w / h;
      g.updateProjectionMatrix();
    }
  };
  setSize();
  const ro = new ResizeObserver(setSize);
  ro.observe(canvas);

  camera.position.set(-38, 28, 22);
  camera.lookAt(2, 18, 0);

  registerEditorSpawnCalculator(() => {
    const st = useEditorStore.getState();
    const cam =
      isWeaponFpAuthoringState(st) && st.fpAuthorCamera === "gameplay" && fpSession
        ? fpSession.getGameplayCamera()
        : isConsumableFpAuthoringState(st) &&
            st.fpAuthorCamera === "gameplay" &&
            fpConsumableSession
          ? fpConsumableSession.getGameplayCamera()
          : camera;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    forward.normalize();
    return {
      position: cam.position.toArray() as [number, number, number],
      forward: forward.toArray() as [number, number, number],
    };
  });

  /** Nested `set()` inside this subscriber leaves `prev` stale; never re-run weapon teardown there. */
  let editorStoreSyncDepth = 0;
  let prev = useEditorStore.getState();
  const unsub = useEditorStore.subscribe((s) => {
    editorStoreSyncDepth++;
    try {
      if (s.mode !== prev.mode && !isFpMode(s.mode)) {
        shouldFrameAfterRebuild = true;
      }
      if (isFpMode(s.mode) && !isFpMode(prev.mode)) {
        document.exitPointerLock?.();
      }
      const wantsWeapon = isWeaponFpAuthoringState(s);
      const hadWeapon = isWeaponFpAuthoringState(prev);
      const wantsConsumable = isConsumableFpAuthoringState(s);
      const hadConsumable = isConsumableFpAuthoringState(prev);

      if (wantsWeapon) {
        if (
          editorStoreSyncDepth === 1 &&
          ((hadWeapon && s.fpAuthorWeaponId !== prev.fpAuthorWeaponId) || hadConsumable) &&
          (fpSession || fpSessionLoading)
        ) {
          disposeFpViewmodelRuntimeOnly();
        }
        if (hadConsumable && (fpConsumableSession || fpConsumableSessionLoading)) {
          disposeFpConsumableRuntimeOnly();
        }
        ensureFpSession();
        if (fpSession?.getPresenter()) {
          contentRoot.visible = false;
          grid.visible = false;
        }
      } else if (hadWeapon && !wantsConsumable && !fpTeardownInProgress) {
        disposeFpViewmodelRuntimeOnly();
        if (!isFpMode(s.mode)) {
          contentRoot.visible = true;
          grid.visible = true;
          shouldFrameAfterRebuild = true;
          camera.position.set(-38, 28, 22);
          camera.lookAt(2, 18, 0);
          orbitControls.target.set(0, 1.45, 0);
          orbitControls.mouseButtons = {
            LEFT: MOUSE.ROTATE,
            MIDDLE: MOUSE.DOLLY,
            RIGHT: MOUSE.PAN,
          };
          orbitControls.update();
        }
      }

      if (wantsConsumable) {
        if (
          editorStoreSyncDepth === 1 &&
          ((hadConsumable && s.fpAuthorConsumableId !== prev.fpAuthorConsumableId) || hadWeapon) &&
          (fpConsumableSession || fpConsumableSessionLoading)
        ) {
          disposeFpConsumableRuntimeOnly();
        }
        if (hadWeapon && (fpSession || fpSessionLoading)) {
          disposeFpViewmodelRuntimeOnly();
        }
        ensureFpConsumableSession();
        if (fpConsumableSession?.isReady()) {
          contentRoot.visible = false;
          grid.visible = false;
        }
      } else if (hadConsumable && !wantsWeapon && !fpTeardownInProgress) {
        disposeFpConsumableRuntimeOnly();
        if (!isFpMode(s.mode)) {
          contentRoot.visible = true;
          grid.visible = true;
          shouldFrameAfterRebuild = true;
          camera.position.set(-38, 28, 22);
          camera.lookAt(2, 18, 0);
          orbitControls.target.set(0, 1.45, 0);
          orbitControls.mouseButtons = {
            LEFT: MOUSE.ROTATE,
            MIDDLE: MOUSE.DOLLY,
            RIGHT: MOUSE.PAN,
          };
          orbitControls.update();
        }
      }

      if (!isFpMode(s.mode)) {
        if (isFpMode(prev.mode)) {
          levelEditorTransformGesture = false;
          transformControls.enabled = true;
        }
        if (s.contentStructureEpoch !== prev.contentStructureEpoch) {
          rebuildStructural();
        } else {
          const placementDataChanged =
            s.floorDocs !== prev.floorDocs ||
            s.interiorDocs !== prev.interiorDocs ||
            s.building !== prev.building ||
            s.activeInteriorDocId !== prev.activeInteriorDocId ||
            s.workspace !== prev.workspace ||
            s.activeCellDocId !== prev.activeCellDocId ||
            s.cellDocs !== prev.cellDocs ||
            s.elevatorCabDef !== prev.elevatorCabDef ||
            s.landingKitDef !== prev.landingKitDef ||
            s.stairWellDef !== prev.stairWellDef;
          /**
           * Never sync meshes from store on unrelated updates (`fpAuthorLive`, pick list, dirty
           * flag, …). Those used to fire every RAF / UI tick and overwrote the gizmo mid-edit.
           */
          if (
            placementDataChanged &&
            !transformControls.dragging &&
            !levelEditorTransformGesture
          ) {
            const stairOpeningChanged =
              s.mode === "stairwell_preview" &&
              (JSON.stringify(s.stairWellDef.entryOpening) !==
                JSON.stringify(prev.stairWellDef.entryOpening) ||
                JSON.stringify(s.stairWellDef.groundEntryOpening) !==
                  JSON.stringify(prev.stairWellDef.groundEntryOpening) ||
                JSON.stringify(s.stairWellDef.secondaryEntryOpening) !==
                  JSON.stringify(prev.stairWellDef.secondaryEntryOpening));
            const stairPreviewRoot = buildingRoot?.getObjectByName("editor_stair_well_preview");
            if (stairOpeningChanged && stairPreviewRoot instanceof THREE.Group) {
              rebuildStairWellPreviewRoot(
                stairPreviewRoot,
                s.stairWellDef,
              );
            }
            syncTransformsFromStore();
          }
        }
      }

      const tcFp =
        isFpMode(s.mode) &&
        (wantsWeapon
          ? Boolean(fpSession?.getPresenter())
          : wantsConsumable
            ? fpConsumableSession?.isReady() === true
            : false) &&
        (s.fpAuthorTargetId !== prev.fpAuthorTargetId ||
          s.fpAuthorSubjectKind !== prev.fpAuthorSubjectKind ||
          s.fpAuthorWeaponId !== prev.fpAuthorWeaponId ||
          s.fpAuthorConsumableId !== prev.fpAuthorConsumableId ||
          s.fpAuthorCamera !== prev.fpAuthorCamera ||
          s.transformMode !== prev.transformMode ||
          s.gridSnapM !== prev.gridSnapM);
      const tcLevel =
        !isFpMode(s.mode) &&
        (s.selectedId !== prev.selectedId ||
          s.transformMode !== prev.transformMode ||
          s.gridSnapM !== prev.gridSnapM ||
          s.mode !== prev.mode ||
          s.activeInteriorDocId !== prev.activeInteriorDocId ||
          s.workspace !== prev.workspace ||
          s.elevatorCabDef !== prev.elevatorCabDef ||
          s.landingKitDef !== prev.landingKitDef ||
          s.stairWellDef !== prev.stairWellDef);
      /**
       * Preview gizmo drags patch Zustand on every pointer move. Re-attaching here would detach the
       * control from the captured pointer mid-gesture, which feels like "losing grip" after a tiny
       * movement. Defer level-editor attachment refreshes until the drag ends (`mouseUp` already
       * calls `syncTransformAttachment()` after store/mesh reconciliation).
       */
      const shouldSyncLevelAttachment =
        tcLevel && !transformControls.dragging && !levelEditorTransformGesture;
      if (tcFp || shouldSyncLevelAttachment) {
        syncTransformAttachment();
      }

      flyControls.movementSpeed = s.flySpeedMps;
      /**
       * While dragging the level-editor gizmo, Orbit + Fly must stay off — both use the primary
       * button and would steal pointer capture from {@link TransformControls} (especially Fly
       * `dragToLook` on LMB).
       */
      const gizmoDragging = transformControls.dragging === true;
      const wantOrbit =
        (isFpMode(s.mode) && s.fpAuthorCamera === "orbit") ||
        (!isFpMode(s.mode) && s.cameraMode !== "fly");
      const wantFly = !isFpMode(s.mode) && s.cameraMode === "fly";
      orbitControls.enabled = !gizmoDragging && wantOrbit;
      flyControls.enabled = !gizmoDragging && wantFly;
      if (isFpMode(s.mode) && s.fpAuthorCamera === "orbit") {
        applyFpOrbitMouseButtons();
      } else {
        applyLevelEditorMouseButtons(s);
        camera.up.set(0, 1, 0);
      }

      if (s.shadowsEnabled !== prev.shadowsEnabled) {
        renderer.shadowMap.enabled = s.shadowsEnabled;
        dir.castShadow = s.shadowsEnabled;
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = s.shadowsEnabled;
        });
      }
      if (
        s.useHdriEnvironment !== prev.useHdriEnvironment ||
        s.mode !== prev.mode ||
        s.workspace !== prev.workspace
      ) {
        applyEnvironment(shouldUseEditorHdri(s));
        grid.visible = shouldShowEditorGrid(s);
      }
      prev = s;
    } finally {
      editorStoreSyncDepth--;
    }
  });

  // Subscribers are not invoked on register — cold-start default FP modes must bootstrap here.
  {
    const st = useEditorStore.getState();
    if (isWeaponFpAuthoringState(st)) {
      ensureFpSession();
    } else if (isConsumableFpAuthoringState(st)) {
      ensureFpConsumableSession();
    }
    if (isFpMode(st.mode)) {
      orbitControls.enabled = st.fpAuthorCamera === "orbit";
      if (st.fpAuthorCamera === "orbit") {
        applyFpOrbitMouseButtons();
      } else {
        applyLevelEditorMouseButtons(st);
      }
    }
    grid.visible = shouldShowEditorGrid(st);
  }

  rebuildStructural();
  applyEnvironment(shouldUseEditorHdri(useEditorStore.getState()));
  syncTransformAttachment();

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (ev.currentTarget !== canvas) return;
    const st = useEditorStore.getState();
    const pickCam =
      isWeaponFpAuthoringState(st) && st.fpAuthorCamera === "gameplay" && fpSession
        ? fpSession.getGameplayCamera()
        : isConsumableFpAuthoringState(st) &&
            st.fpAuthorCamera === "gameplay" &&
            fpConsumableSession
          ? fpConsumableSession.getGameplayCamera()
          : camera;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, pickCam);
    if (transformControls.dragging || levelEditorTransformGesture) {
      fpClickCandidate = null;
      levelClickCandidate = null;
      return;
    }

    if (isFpMode(st.mode)) {
      fpClickCandidate = { x: ev.clientX, y: ev.clientY };
      levelClickCandidate = null;
      return;
    }
    fpClickCandidate = null;
    const targets: THREE.Object3D[] = [];
    if (buildingRoot) targets.push(buildingRoot);
    const intersects = raycaster.intersectObjects(targets, true);
    const hit = intersects[0] ?? null;
    const store = useEditorStore.getState();
    levelClickCandidate = {
      x: ev.clientX,
      y: ev.clientY,
      id:
        hit == null
          ? null
          : store.mode === "cab"
            ? resolveCabPartId(hit.object)
            : store.mode === "landing_preview"
              ? resolveLandingKitPickId(hit.object, landingKitPickOptions())
              : store.mode === "stairwell_preview"
                ? resolveStairWellPartId(hit.object)
                : resolvePlacedId(hit.object, store.floorDocs),
      target:
        hit == null
          ? null
          : store.mode === "cab"
            ? resolveCabPartTarget(hit.object)
            : store.mode === "landing_preview"
              ? resolveLandingKitPickTarget(hit.object, landingKitPickOptions())
              : store.mode === "stairwell_preview"
                ? resolveStairWellPartTarget(hit.object)
                : null,
      hitFloorDocId:
        hit && store.mode === "floor"
          ? resolveGizmoFloorDocId(hit.object, store.activeFloorDocId)
          : null,
      hitLevelIndex:
        hit && (store.mode === "floor" || store.mode === "floor_override")
          ? ancestorLevelIndex(hit.object)
          : null,
    };
  };

  function rewireCanvasPrimaryPointerListeners(): void {
    if (transformControls.domElement) {
      withProgrammaticTransformControls(() => transformControls.disconnect());
    }
    if (orbitControls.domElement) {
      orbitControls.disconnect();
    }
    canvas.removeEventListener("pointerdown", onPointerDown);
    withProgrammaticTransformControls(() => transformControls.connect(canvas));
    orbitControls.connect(canvas);
    canvas.addEventListener("pointerdown", onPointerDown);
  }
  rewireCanvasPrimaryPointerListeners();

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const st = useEditorStore.getState();

    if (ev.currentTarget !== canvas) return;

    if (isFpMode(st.mode)) {
      if (!fpClickCandidate) return;
      const dx = ev.clientX - fpClickCandidate.x;
      const dy = ev.clientY - fpClickCandidate.y;
      fpClickCandidate = null;
      levelClickCandidate = null;
      if (Math.hypot(dx, dy) > 5) return;

      const pickCam =
        st.fpAuthorCamera === "gameplay" && isWeaponFpAuthoringState(st) && fpSession
          ? fpSession.getGameplayCamera()
          : st.fpAuthorCamera === "gameplay" &&
              isConsumableFpAuthoringState(st) &&
              fpConsumableSession
            ? fpConsumableSession.getGameplayCamera()
            : camera;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, pickCam);

      const picks = getFpViewmodelAuthoringPicks();
      if (picks.length === 0) return;
      const hits = raycaster.intersectObjects(
        picks.map((p) => p.object),
        true,
      );
      if (hits.length === 0) return;
      const id = resolveFpAuthorPickId(hits[0]!.object, picks);
      if (id) {
        useEditorStore.getState().pickFpAuthorTarget(id);
        }
      return;
    }

    if (!levelClickCandidate) return;
    const levelCandidate = levelClickCandidate;
    const dx = ev.clientX - levelCandidate.x;
    const dy = ev.clientY - levelCandidate.y;
    fpClickCandidate = null;
    levelClickCandidate = null;
    if (Math.hypot(dx, dy) > 5) return;

    const pickCam = camera;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, pickCam);

    if (!levelCandidate.id) {
      preferredPreviewSelectionTarget = null;
      useEditorStore.getState().setSelectedId(null);
      previewSelectionOutline.setFromObject(null);
      syncTransformAttachment();
      return;
    }
    const store = useEditorStore.getState();
    preferredPreviewSelectionTarget = levelCandidate.target;
    if (store.mode === "floor" && levelCandidate.hitFloorDocId) {
      if (levelCandidate.hitFloorDocId !== store.activeFloorDocId) {
        useEditorStore.getState().setActiveFloorDocId(levelCandidate.hitFloorDocId);
      }
      if (
        levelCandidate.hitLevelIndex !== null &&
        levelCandidate.hitLevelIndex !== store.focusedStoryLevelIndex
      ) {
        useEditorStore.getState().setFocusedStoryLevelIndex(levelCandidate.hitLevelIndex);
      }
    } else if (
      store.mode === "floor_override" &&
      levelCandidate.hitLevelIndex !== null &&
      levelCandidate.hitLevelIndex !== store.focusedStoryLevelIndex
    ) {
      useEditorStore.getState().setFocusedStoryLevelIndex(levelCandidate.hitLevelIndex);
    }
    if (
      store.mode === "cab" ||
      store.mode === "landing_preview" ||
      store.mode === "stairwell_preview"
    ) {
      useEditorStore.getState().setTransformMode("translate");
    }
    useEditorStore.getState().setSelectedId(levelCandidate.id);
    previewSelectionOutline.setFromObject(preferredPreviewSelectionTarget);
    syncTransformAttachment();
  };
  canvas.addEventListener("pointerup", onPointerUp);

  let raf = 0;
  let lastTickMs = performance.now();
  let lastWeaponPresentationPollMs = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - lastTickMs) / 1000, 0.05);
    lastTickMs = now;
    const st = useEditorStore.getState();
    const tcDragging = transformControls.dragging === true;
    const inFpMode = isFpMode(st.mode);
    if (isWeaponFpAuthoringState(st) && fpSession?.getPresenter()) {
      previewSelectionOutline.setFromObject(null);
      const pres = fpSession.getPresenter()!;
      if (!tcDragging) {
        pres.setFpSwingAuthoringOverlay({ previewPhase01: null, keyframes: null });
        const tPoll = performance.now();
        if (tPoll - lastWeaponPresentationPollMs >= 600) {
          lastWeaponPresentationPollMs = tPoll;
          const weaponId = st.fpAuthorWeaponId;
          void (async () => {
            try {
              const r = await fetch(`/content/weapons/${weaponId}.presentation.json`, {
                cache: "no-store",
              });
              if (!r.ok) return;
              const text = await r.text();
              if (text === getLastWeaponPresentationFileText(weaponId)) return;
              adoptWeaponPresentationFileText(pres, weaponId, text);
              maybeSyncFpGizmoFromStore();
            } catch {
              /* ignore */
            }
          })();
        }
      }
      const picksMeta = pres.getAuthoringPickList().map((p) => ({ id: p.id, label: p.label }));
      useEditorStore.getState().setFpAuthorPickList(picksMeta);
      if (tcDragging) {
        fpSession.applyAuthoringPitchOnly(st.fpAuthorPitchRad);
      } else {
        fpSession.tick(dt, st.fpAuthorPitchRad);
        maybeSyncFpGizmoFromStore();
      }
      const picksAfter = pres.getAuthoringPickList();
      const sel = picksAfter.find(
        (p) => p.id === useEditorStore.getState().fpAuthorTargetId,
      )?.object;
      fpSelectionOutline.setFromObject(sel ?? null);
    } else if (isConsumableFpAuthoringState(st) && fpConsumableSession?.isReady()) {
      previewSelectionOutline.setFromObject(null);
      const picksMeta = fpConsumableSession
        .getPickList()
        .map((p) => ({ id: p.id, label: p.label }));
      useEditorStore.getState().setFpAuthorPickList(picksMeta);
      if (tcDragging) {
        fpConsumableSession.applyAuthoringPitchOnly(st.fpAuthorPitchRad);
      } else {
        fpConsumableSession.tick(dt, st.fpAuthorPitchRad);
        maybeSyncFpGizmoFromStore();
      }
      const picks = fpConsumableSession.getPickList();
      const sel = picks.find(
        (p) => p.id === useEditorStore.getState().fpAuthorTargetId,
      )?.object;
      fpSelectionOutline.setFromObject(sel ?? null);
    } else {
      fpSelectionOutline.setFromObject(null);
      if (
        st.mode === "cab" ||
        st.mode === "landing_preview" ||
        st.mode === "stairwell_preview"
      ) {
        previewSelectionOutline.setFromObject(findBestSelectionTarget());
      } else {
        previewSelectionOutline.setFromObject(null);
      }
    }
    const renderCam =
      isWeaponFpAuthoringState(st) && st.fpAuthorCamera === "gameplay" && fpSession
        ? fpSession.getGameplayCamera()
        : isConsumableFpAuthoringState(st) &&
            st.fpAuthorCamera === "gameplay" &&
            fpConsumableSession
          ? fpConsumableSession.getGameplayCamera()
          : camera;
    if (isWeaponFpAuthoringState(st) && st.fpAuthorCamera === "gameplay" && fpSession) {
      fpSession.syncWorldMatrices();
    } else if (isConsumableFpAuthoringState(st) && st.fpAuthorCamera === "gameplay" && fpConsumableSession) {
      fpConsumableSession.syncWorldMatrices();
    }
    renderCam.aspect = canvas.clientWidth / canvas.clientHeight;
    renderCam.updateProjectionMatrix();
    (transformControls as unknown as { camera: THREE.Camera }).camera = renderCam;
    if (!tcDragging) {
      if (inFpMode && st.fpAuthorCamera === "orbit") {
        orbitControls.update();
      } else if (!inFpMode && st.cameraMode === "fly") {
        flyControls.update(dt);
      } else if (!inFpMode) {
        orbitControls.update();
      }
    }
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (attached && !objectLivesUnderScene(attached, scene)) {
      withProgrammaticTransformControls(() => transformControls.detach());
    }
    renderer.render(scene, renderCam);
  };
  tick();

  return () => {
    registerEditorSpawnCalculator(null);
    registerEditorNavigationBridge(null);
    teardownFpSession();
    orbitControls.dispose();
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    unsub();
    ro.disconnect();
    scene.remove(transformHelper);
    transformControls.dispose();
    fpSelectionOutline.geometry.dispose();
    (fpSelectionOutline.material as THREE.Material).dispose();
    scene.remove(fpSelectionOutline);
    previewSelectionOutline.dispose();
    scene.remove(previewSelectionOutline);
    if (buildingRoot) {
      contentRoot.remove(buildingRoot);
      disposeSubtreeGpuAssets(buildingRoot);
      buildingRoot = null;
    }
    pmrem.dispose();
    applyEnvironment(false);
    disposeSceneEnvironment(scene);
    renderer.dispose();
    scene.clear();
  };
}

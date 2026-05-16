import * as THREE from "three";
import { MOUSE } from "three";
import { FlyControls } from "three/addons/controls/FlyControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
  createFPCamera,
} from "@the-mammoth/engine";
import { LANDING_DOOR_OPENING_PROXY_ID } from "@the-mammoth/world";
import { useEditorStore } from "../../state/editorStore.js";
import { disposeSceneEnvironment } from "../scene/disposeSubtree.js";
import { registerEditorSpawnCalculator } from "../bridges/spawnBridge.js";
import { registerEditorNavigationBridge } from "../bridges/editorNavigationBridge.js";
import { FpSelectionAabbOutline } from "../fpAuthoring/fpSelectionAabbOutline.js";
import { PreviewSelectionShapeOutline } from "../scene/previewSelectionShapeOutline.js";
import {
  anchoredScaleAnchorLocalPoint,
  type AnchoredScaleAxis,
  anchoredScaleAxisFromTransformAxis,
  computeAnchoredScalePosition,
} from "../scene/anchoredScaleGizmo.js";
import { addEditorSceneLighting } from "../scene/editorSceneLighting.js";
import { createEditorPmremEnvironment } from "../scene/editorSceneEnvironment.js";
import { commitEditorAttachedTransform } from "../scene/editorSceneCommitAttachedTransform.js";
import { createEditorSceneSelectionFraming } from "./editorSceneSelectionFraming.js";
import { patchTransformControlsPointerForCaptureCompat } from "./editorScenePatchTransformControls.js";
import {
  disposeEditorStructuralRoot,
  rebuildEditorStructuralIfNeeded,
  syncEditorPlacementTransformsFromStore,
  type EditorStructuralState,
} from "./editorSceneStructuralRebuild.js";
import { createEditorFpAuthoringLifecycle } from "./editorSceneFpAuthoringLifecycle.js";
import { subscribeEditorSceneStore } from "./editorSceneStoreSubscription.js";
import { createEditorSceneCanvasPointerHandlers } from "./editorSceneCanvasPointer.js";
import { startEditorSceneRenderLoop } from "./editorSceneRenderLoop.js";
import { createEditorSceneMyApartmentLifecycle } from "../myApartment/editorSceneMyApartmentLifecycle.js";
import {
  constrainMyApartmentDecorRootPose,
  constrainMyApartmentFurnitureRootPose,
  constrainMyApartmentWallRootPose,
  EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD,
  findEditorMyApartmentWallSlabMesh,
} from "../myApartment/editorMyApartmentMeshes.js";
import {
  getEditorMyApartmentPieceGroup,
  getEditorMyApartmentSelectionGroup,
} from "../myApartment/editorMyApartmentPieceGroupBridge.js";
import {
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutWallSelectedId,
} from "../myApartment/editorMyApartmentSelection.js";
import {
  isConsumableFpAuthoringState,
  isFpMode,
  isSharedPreviewMode,
  isWeaponFpAuthoringState,
} from "./editorStoreModeGuards.js";

export async function mountEditorScene(
  canvas: HTMLCanvasElement,
): Promise<() => void> {
  const ORBIT_MAX_DISTANCE = 40;
  await assertWebGpuAdapterOrThrow();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8edf4);
  scene.fog = new THREE.Fog(0xe4eaf0, 95, 920);

  const camera = createFPCamera();
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: false,
  });
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
  const { pmrem, applyEnvironment } = createEditorPmremEnvironment(
    scene,
    renderer,
  );

  const contentRoot = new THREE.Group();
  contentRoot.name = "editorContentRoot";
  scene.add(contentRoot);

  const structuralState: EditorStructuralState = {
    buildingRoot: null,
    lastBuiltContentEpoch: -1,
    shouldFrameAfterRebuild: true,
  };

  const transformControls = new TransformControls(camera, null);
  patchTransformControlsPointerForCaptureCompat(transformControls);

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

  let levelEditorTransformGesture = false;
  let levelEditorAnchoredScaleGesture: {
    object: THREE.Object3D;
    startPosition: THREE.Vector3;
    startScale: THREE.Vector3;
    startRotation: THREE.Quaternion;
    axis: AnchoredScaleAxis;
    localBounds: THREE.Box3;
    handleAxisSigns: THREE.Vector3;
  } | null = null;

  /** Wall slab mesh scale at scale-gesture pointer-down — avoids compounding `mesh *= root` each `objectChange`. */
  let wallSlabScaleGesture: {
    object: THREE.Object3D;
    meshStart: THREE.Vector3;
  } | null = null;

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

  function localBoundsForAnchoredScale(
    root: THREE.Object3D,
  ): THREE.Box3 | null {
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
      _anchoredScaleWorldBox
        .copy(geom.boundingBox)
        .applyMatrix4(obj.matrixWorld);
      _anchoredScaleLocalBox
        .copy(_anchoredScaleWorldBox)
        .applyMatrix4(_anchoredScaleInvWorld);
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
    return !(
      st.mode === "landing_preview" &&
      st.selectedId === LANDING_DOOR_OPENING_PROXY_ID
    );
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
    if (!attached || attached !== levelEditorAnchoredScaleGesture.object)
      return;
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
  let levelClickCandidate: {
    x: number;
    y: number;
    id: string | null;
    target: THREE.Object3D | null;
    hitFloorDocId: string | null;
    hitLevelIndex: number | null;
  } | null = null;
  let preferredPreviewSelectionTarget: THREE.Object3D | null = null;

  const { frameObject, frameFocusedStoryObject, findBestSelectionTarget } =
    createEditorSceneSelectionFraming({
      camera,
      orbitControls,
      getBuildingRoot: () => structuralState.buildingRoot,
      scene,
      getPreferredPreviewSelectionTarget: () => preferredPreviewSelectionTarget,
      setPreferredPreviewSelectionTarget: (v) => {
        preferredPreviewSelectionTarget = v;
      },
      landingKitPickOptions,
    });

  registerEditorNavigationBridge({
    frameEditorBuilding: () => frameObject(structuralState.buildingRoot),
    frameEditorSelection: () => frameObject(findBestSelectionTarget()),
    frameFocusedStory: frameFocusedStoryObject,
  });

  function applyLevelEditorMouseButtons(
    st: ReturnType<typeof useEditorStore.getState>,
  ): void {
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

  function shouldUseEditorHdri(
    st: ReturnType<typeof useEditorStore.getState>,
  ): boolean {
    return (
      !isFpMode(st.mode) &&
      !isSharedPreviewMode(st.mode) &&
      st.useHdriEnvironment
    );
  }

  function shouldShowEditorGrid(
    st: ReturnType<typeof useEditorStore.getState>,
  ): boolean {
    return !isFpMode(st.mode) && !isSharedPreviewMode(st.mode);
  }

  function syncTransformsFromStore(): void {
    syncEditorPlacementTransformsFromStore(
      structuralState,
      useEditorStore.getState(),
    );
  }

  function rebuildStructural(): void {
    rebuildEditorStructuralIfNeeded(structuralState, {
      contentRoot,
      textureLoader,
      syncTransformAttachment,
      frameFocusedStoryObject,
      frameObject,
    });
  }

  function syncTransformAttachment(): void {
    withProgrammaticTransformControls(() => {
      const s = useEditorStore.getState();
      transformControls.detach();
      transformControls.showX = true;
      transformControls.showY = true;
      transformControls.showZ = true;
      if (isFpMode(s.mode)) {
        fp.syncFpTransformAttachment();
        return;
      }
      if (s.mode === "my_apartment_layout") {
        const g =
          getEditorMyApartmentSelectionGroup(s.selectedId) ??
          getEditorMyApartmentPieceGroup(s.myApartmentLayoutPiece);
        if (!g) {
          transformControls.detach();
          return;
        }
        transformControls.attach(g);
        const decorSelected = parseMyApartmentLayoutDecorSelectedId(s.selectedId) !== null;
        const wallSelected = parseMyApartmentLayoutWallSelectedId(s.selectedId) !== null;
        const apartmentFreeVertical = decorSelected || wallSelected;
        transformControls.setMode(s.transformMode);
        transformControls.setSpace(
          s.transformMode === "rotate" ? "local" : "world",
        );
        if (s.transformMode === "translate") {
          transformControls.showX = true;
          transformControls.showY = apartmentFreeVertical;
          transformControls.showZ = true;
        } else if (s.transformMode === "rotate") {
          transformControls.showX = apartmentFreeVertical;
          transformControls.showY = true;
          transformControls.showZ = false;
        } else {
          transformControls.showX = true;
          transformControls.showY = true;
          transformControls.showZ = true;
        }
        const snap = s.gridSnapM;
        transformControls.setTranslationSnap(snap > 0 ? snap : null);
        if (s.transformMode === "rotate") {
          if (apartmentFreeVertical) {
            transformControls.setRotationSnap(
              snap > 0 ? EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD : null,
            );
          } else {
            transformControls.setRotationSnap(Math.PI / 4);
          }
        } else {
          transformControls.setRotationSnap(null);
        }
        transformControls.setScaleSnap(snap > 0 ? snap : null);
        transformControls.setSize(1);
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
          s.mode === "landing_preview" &&
          s.selectedId === LANDING_DOOR_OPENING_PROXY_ID;
        transformControls.setSize(opening ? 1.35 : 1);
        if (opening) {
          transformControls.setTranslationSnap(null);
          transformControls.setRotationSnap(null);
          transformControls.setScaleSnap(null);
        } else {
          const snap = s.gridSnapM;
          transformControls.setTranslationSnap(snap > 0 ? snap : null);
          transformControls.setRotationSnap(
            snap > 0 ? THREE.MathUtils.degToRad(15) : null,
          );
          transformControls.setScaleSnap(snap > 0 ? snap : null);
        }
      }
    });
  }

  const commitLevelEditorAttachedTransformToStore = () =>
    commitEditorAttachedTransform({
      getProgrammaticTransformControlsDepth: () =>
        programmaticTransformControlsDepth,
      transformControls,
      contentRoot,
    });

  let rewireCanvasPrimaryPointerListeners: () => void = () => {};

  const fp = createEditorFpAuthoringLifecycle({
    scene,
    camera,
    orbitControls,
    contentRoot,
    grid,
    transformControls,
    withProgrammaticTransformControls,
    rewireCanvasPrimaryPointerListeners: () => rewireCanvasPrimaryPointerListeners(),
    setLevelEditorTransformGesture: (v) => {
      levelEditorTransformGesture = v;
    },
    clearFpClickCandidate: () => {
      fpClickCandidate = null;
    },
    fpSelectionOutline,
    syncTransformAttachment,
    structuralState,
  });

  transformControls.addEventListener("mouseDown", () => {
    if (isFpMode(useEditorStore.getState().mode)) return;
    levelEditorTransformGesture = true;
    primeAnchoredScaleGesture();
    const st = useEditorStore.getState();
    const attached = transformControls.object as THREE.Object3D | undefined;
    if (
      st.mode === "my_apartment_layout" &&
      st.transformMode === "scale" &&
      attached?.userData.mammothEditorMyApartmentWallId
    ) {
      const mesh = findEditorMyApartmentWallSlabMesh(attached);
      wallSlabScaleGesture = mesh
        ? { object: attached, meshStart: mesh.scale.clone() }
        : null;
    } else {
      wallSlabScaleGesture = null;
    }
  });
  transformControls.addEventListener("mouseUp", () => {
    if (isFpMode(useEditorStore.getState().mode)) return;
    levelEditorTransformGesture = false;
    levelEditorAnchoredScaleGesture = null;
    /** No `objectChange` if the pointer never moved; still persist rest pose. */
    commitLevelEditorAttachedTransformToStore();
    wallSlabScaleGesture = null;
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
    if (active) {
      useEditorStore.getState().beginTransaction();
    } else {
      useEditorStore.getState().commitTransaction();
    }
  });
  transformControls.addEventListener("objectChange", () => {
    const aptSt = useEditorStore.getState();
    const aptObj = transformControls.object as THREE.Object3D | undefined;
    if (aptSt.mode === "my_apartment_layout" && aptObj) {
      if (aptObj.userData.mammothEditorMyApartmentPiece) {
        constrainMyApartmentFurnitureRootPose(aptObj);
      } else if (aptObj.userData.mammothEditorMyApartmentDecorId) {
        constrainMyApartmentDecorRootPose(aptObj);
      } else if (aptObj.userData.mammothEditorMyApartmentWallId) {
        if (aptSt.transformMode === "scale") {
          const axis = (transformControls as unknown as { axis?: string | null })
            .axis;
          if (
            wallSlabScaleGesture &&
            wallSlabScaleGesture.object === aptObj &&
            transformControls.dragging &&
            axis &&
            axis !== "XYZ" &&
            !axis.includes("E")
          ) {
            if (axis.indexOf("X") === -1) aptObj.scale.x = 1;
            if (axis.indexOf("Y") === -1) aptObj.scale.y = 1;
            if (axis.indexOf("Z") === -1) aptObj.scale.z = 1;
          }
        }
        const scaleDrag =
          aptSt.transformMode === "scale" &&
          wallSlabScaleGesture &&
          wallSlabScaleGesture.object === aptObj &&
          transformControls.dragging
            ? { meshScaleAtGestureStart: wallSlabScaleGesture.meshStart }
            : undefined;
        constrainMyApartmentWallRootPose(aptObj, scaleDrag);
      }
    }
    applyAnchoredScaleGesture();
    commitLevelEditorAttachedTransformToStore();
  });
  transformControls.addEventListener("change", () => {
    if (programmaticTransformControlsDepth > 0) return;
    const store = useEditorStore.getState();
    if (isWeaponFpAuthoringState(store)) {
      const pres = fp.getFpSession()?.getPresenter();
      const attached = transformControls.object as THREE.Object3D | undefined;
      if (pres && attached) {
        const pid = pres
          .getAuthoringPickList()
          .find((p) => p.object === attached)?.id;
        if (pid === "rigRoot") pres.syncAuthoringRigRestFromAttachedRig();
        else if (pid === "weapon") pres.syncFpWeaponMountBaselineFromRoot();
      }
      store.bumpFpAuthorLive();
    }
  });
  const transformHelper = transformControls.getHelper();
  scene.add(transformHelper);

  const setSize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const weaponSession = fp.getFpSession();
    if (weaponSession) {
      const g = weaponSession.getGameplayCamera();
      g.aspect = w / h;
      g.updateProjectionMatrix();
    }
    const consumableSession = fp.getFpConsumableSession();
    if (consumableSession) {
      const g = consumableSession.getGameplayCamera();
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
      isWeaponFpAuthoringState(st) &&
      st.fpAuthorCamera === "gameplay" &&
      fp.getFpSession()
        ? fp.getFpSession()!.getGameplayCamera()
        : isConsumableFpAuthoringState(st) &&
            st.fpAuthorCamera === "gameplay" &&
            fp.getFpConsumableSession()
          ? fp.getFpConsumableSession()!.getGameplayCamera()
          : camera;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    forward.normalize();
    return {
      position: cam.position.toArray() as [number, number, number],
      forward: forward.toArray() as [number, number, number],
    };
  });

  const unsub = subscribeEditorSceneStore({
    structuralState,
    rebuildStructural,
    syncTransformsFromStore,
    getBuildingRoot: () => structuralState.buildingRoot,
    transformControls,
    getLevelEditorTransformGesture: () => levelEditorTransformGesture,
    setLevelEditorTransformGesture: (v) => {
      levelEditorTransformGesture = v;
    },
    orbitControls,
    flyControls,
    applyFpOrbitMouseButtons,
    applyLevelEditorMouseButtons,
    renderer,
    dir,
    scene,
    applyEnvironment,
    shouldUseEditorHdri,
    shouldShowEditorGrid,
    fp,
    contentRoot,
    grid,
    camera,
    syncTransformAttachment,
  });

  const disposeMyApartmentAuthoring =
    createEditorSceneMyApartmentLifecycle({
      getStructuralRoot: () => structuralState.buildingRoot,
      getShouldHoldReplicaResync: () =>
        programmaticTransformControlsDepth > 0 ||
        transformControls.dragging === true ||
        levelEditorTransformGesture,
      syncTransformAttachment,
    }).dispose;

  // Subscribers are not invoked on register — cold-start default FP modes must bootstrap here.
  {
    const st = useEditorStore.getState();
    if (isWeaponFpAuthoringState(st)) {
      fp.ensureFpSession();
    } else if (isConsumableFpAuthoringState(st)) {
      fp.ensureFpConsumableSession();
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

  const pointers = createEditorSceneCanvasPointerHandlers({
    canvas,
    camera,
    raycaster,
    pointer,
    transformControls,
    getLevelEditorTransformGesture: () => levelEditorTransformGesture,
    setFpClickCandidate: (v) => {
      fpClickCandidate = v;
    },
    getFpClickCandidate: () => fpClickCandidate,
    setLevelClickCandidate: (v) => {
      levelClickCandidate = v;
    },
    getLevelClickCandidate: () => levelClickCandidate,
    getBuildingRoot: () => structuralState.buildingRoot,
    landingKitPickOptions,
    getPreferredPreviewSelectionTarget: () => preferredPreviewSelectionTarget,
    setPreferredPreviewSelectionTarget: (v) => {
      preferredPreviewSelectionTarget = v;
    },
    previewSelectionOutline,
    syncTransformAttachment,
    fp,
    withProgrammaticTransformControls,
    orbitControls,
  });
  rewireCanvasPrimaryPointerListeners =
    pointers.rewireCanvasPrimaryPointerListeners;
  rewireCanvasPrimaryPointerListeners();
  canvas.addEventListener("pointerup", pointers.onPointerUp);

  const stopRenderLoop = startEditorSceneRenderLoop({
    canvas,
    scene,
    renderer,
    camera,
    transformControls,
    orbitControls,
    flyControls,
    fp,
    previewSelectionOutline,
    fpSelectionOutline,
    findBestSelectionTarget,
    withProgrammaticTransformControls,
    isFpMode,
  });

  return () => {
    registerEditorSpawnCalculator(null);
    registerEditorNavigationBridge(null);
    fp.teardownFpSession();
    orbitControls.dispose();
    stopRenderLoop();
    canvas.removeEventListener("pointerdown", pointers.onPointerDown);
    canvas.removeEventListener("pointerup", pointers.onPointerUp);
    unsub();
    ro.disconnect();
    scene.remove(transformHelper);
    transformControls.dispose();
    fpSelectionOutline.geometry.dispose();
    (fpSelectionOutline.material as THREE.Material).dispose();
    scene.remove(fpSelectionOutline);
    previewSelectionOutline.dispose();
    scene.remove(previewSelectionOutline);
    disposeMyApartmentAuthoring();
    disposeEditorStructuralRoot(structuralState, contentRoot);
    pmrem.dispose();
    applyEnvironment(false);
    disposeSceneEnvironment(scene);
    renderer.dispose();
    scene.clear();
  };
}

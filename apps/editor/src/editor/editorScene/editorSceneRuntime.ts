import * as THREE from "three";
import { MOUSE } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  assertWebGpuAdapterOrThrow,
  assertWebGpuRendererBackend,
  createFPCamera,
  applyMammothApartmentInteriorEditorLayoutPresentation,
  applyMammothApartmentInteriorLightLayersToGlobalRig,
  applyMammothApartmentInteriorScene,
  applyApartmentInteriorFloorReceiveShadowUnder,
  captureMammothApartmentInteriorSceneAtmosphere,
  ensureMammothApartmentDecorShadowRenderer,
  frameMammothApartmentInteriorGameplayPreview,
  mountMammothApartmentInteriorSceneRig,
  requestMammothRendererShadowMapUpdate,
  syncMammothApartmentInteriorMetallicEnv,
} from "@the-mammoth/engine";
import { LANDING_DOOR_OPENING_PROXY_ID } from "@the-mammoth/world";
import { useEditorStore } from "../../state/editorStore.js";
import { disposeSceneEnvironment } from "../scene/disposeSubtree.js";
import { registerEditorSpawnCalculator } from "../bridges/spawnBridge.js";
import {
  registerEditorSelectionTargetResolver,
  unregisterEditorSelectionTargetResolver,
} from "../scene/editorSelectionTargetBridge.js";
import { registerEditorNavigationBridge } from "../bridges/editorNavigationBridge.js";
import { FpSelectionAabbOutline } from "../fpAuthoring/fpSelectionAabbOutline.js";
import { PreviewSelectionShapeOutline } from "../scene/previewSelectionShapeOutline.js";
import {
  anchoredScaleAnchorLocalPoint,
  type AnchoredScaleAxis,
  anchoredScaleAxisFromTransformAxis,
  computeAnchoredScalePosition,
} from "../scene/anchoredScaleGizmo.js";
import {
  addEditorSceneLighting,
  EDITOR_ORBIT_LIGHTING_BASE,
} from "../scene/editorSceneLighting.js";
import { createEditorPmremEnvironment } from "../scene/editorSceneEnvironment.js";
import {
  commitEditorAttachedTransform,
  persistAllMyApartmentWallPlacementsFromScene,
} from "../scene/editorSceneCommitAttachedTransform.js";
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
import { registerEditorTransformModeDigitHotkeys } from "./editorSceneTransformModeHotkeys.js";
import { registerEditorApartmentLayoutDeleteHotkeys } from "./editorSceneApartmentDeleteHotkeys.js";
import { registerEditorHistoryHotkeys } from "./editorSceneHistoryHotkeys.js";
import { createEditorOrbitKeyboardMove } from "./editorOrbitKeyboardMove.js";
import {
  attachEditorOrbitSnappyFeel,
} from "./editorOrbitSnappyFeel.js";
import { createEditorOrbitDistanceSpeedBinder } from "./editorOrbitDistanceSpeedBinder.js";
import { EDITOR_ORBIT_MIN_DISTANCE_M } from "./editorOrbitSpeeds.js";
import { startEditorSceneRenderLoop } from "./editorSceneRenderLoop.js";
import { demandEditorSceneRender } from "./editorSceneRenderDemand.js";
import { createEditorSceneMyApartmentLifecycle } from "../myApartment/editorSceneMyApartmentLifecycle.js";
import {
  clampMyApartmentDecorEulerLimits,
  constrainMyApartmentDecorScaleFromGizmo,
  type MyApartmentDecorScaleGesturePin,
  constrainMyApartmentDecorVerticalBounds,
  constrainMyApartmentMirrorRootPose,
  constrainMyApartmentWallRootPose,
  EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD,
  findEditorMyApartmentMirrorSurfaceMesh,
  findEditorMyApartmentWallSlabMesh,
  clampMyApartmentWallOpeningProxyPose,
  snapMyApartmentDecorEulerToGrid,
} from "../myApartment/editorMyApartmentMeshes.js";
import { applyMyApartmentDecorNeighborSnap } from "../myApartment/editorMyApartmentDecorSnap.js";
import {
  bakeMyApartmentGroupManipScaleIntoDecorChildren,
} from "../myApartment/editorMyApartmentDecorScale.js";
import {
  captureWallScalePinnedSpanFromGesture,
  parseTransformControlsWorldScaleAxis,
  type WallScalePinnedSpan,
} from "../myApartment/editorMyApartmentWallSnap.js";
import {
  getEditorMyApartmentFurnitureMountRoot,
  getEditorMyApartmentSelectionGroup,
  registerEditorMyApartmentDecorShadowRenderer,
  registerEditorMyApartmentLayoutPersistFromSceneRequest,
  registerEditorFillWallOpeningRequest,
  resyncEditorMyApartmentDecorShadows,
} from "../myApartment/editorMyApartmentPieceGroupBridge.js";
import { editorMyApartmentSelectedIdForWall } from "../myApartment/editorMyApartmentSelection.js";
import {
  MY_APARTMENT_OBJECT_GROUP_MANIP_UD,
  syncApartmentSavedObjectGroupManipulator,
  teardownApartmentSavedObjectGroupManipulator,
} from "../myApartment/editorMyApartmentSavedGroupManip.js";
import {
  parseMyApartmentLayoutDecorSelectedId,
  parseMyApartmentLayoutMirrorSelectedId,
  parseMyApartmentLayoutSavedObjectGroupId,
  parseMyApartmentLayoutWallOpeningSelectedId,
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
  registerEditorMyApartmentDecorShadowRenderer(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  const EDITOR_REST_PIXEL_RATIO = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(EDITOR_REST_PIXEL_RATIO);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { hemi, fill, dir, grid } = addEditorSceneLighting(scene);
  applyMammothApartmentInteriorLightLayersToGlobalRig({ hemi, fill, dir });

  const textureLoader = new THREE.TextureLoader();
  const { pmrem, applyEnvironment: applyPmremEnvironment } =
    createEditorPmremEnvironment(scene, renderer);

  /**
   * `RoomEnvironment` already carries omnidirectional diffuse; stacking it under the orbit sun +
   * hemisphere reads like showroom lighting rather than smoky panel slabs.
   */
  const EDITOR_HDRI_SCENE_IBL_INTENSITY = 0.34;
  const EDITOR_ORBIT_EXPOSURE = 1.02;
  const EDITOR_HDRI_KEYLIGHT_FACTOR = {
    hemi: 0.54,
    fill: 0.42,
    dir: 0.46,
  } as const;
  const apartmentInteriorSceneRig = mountMammothApartmentInteriorSceneRig(
    scene,
    "editor_apartment_interior",
  );
  const editorStudioAtmosphere =
    captureMammothApartmentInteriorSceneAtmosphere(scene);
  let editorCameraFovBeforeApartment: number | null = null;

  const contentRoot = new THREE.Group();

  const shouldPreviewFpApartmentLighting = (
    st: ReturnType<typeof useEditorStore.getState>,
  ): boolean => st.mode === "my_apartment_layout";

  const syncEditorLightingStack = (
    st: ReturnType<typeof useEditorStore.getState>,
    roomEnvOn: boolean,
  ): void => {
    const b = EDITOR_ORBIT_LIGHTING_BASE;
    if (shouldPreviewFpApartmentLighting(st)) {
      if (editorCameraFovBeforeApartment == null) {
        editorCameraFovBeforeApartment = camera.fov;
      }
      /** Lighting + PMREM handled in {@link applyEnvironment} via presentation helper. */
      return;
    }

    if (editorCameraFovBeforeApartment != null) {
      camera.fov = editorCameraFovBeforeApartment;
      camera.updateProjectionMatrix();
      editorCameraFovBeforeApartment = null;
    }

    applyMammothApartmentInteriorScene({
      scene,
      renderer,
      interiorProximity01: 0,
      bounce: apartmentInteriorSceneRig,
      global: { hemi, fill, dir },
      atmosphereRestore: editorStudioAtmosphere,
      exteriorHemiIntensity: b.hemiIntensity,
      exteriorFillIntensity: b.fillIntensity,
      exteriorDirIntensity: b.dirIntensity,
    });
    renderer.toneMappingExposure = EDITOR_ORBIT_EXPOSURE;
    scene.environmentIntensity = roomEnvOn ? EDITOR_HDRI_SCENE_IBL_INTENSITY : 1;
    if (roomEnvOn) {
      hemi.color.setHex(0xf2f6fb);
      hemi.groundColor.setHex(0xd0d8e2);
      hemi.intensity = b.hemiIntensity * EDITOR_HDRI_KEYLIGHT_FACTOR.hemi;
      fill.color.setHex(0xe8eef4);
      fill.intensity = b.fillIntensity * EDITOR_HDRI_KEYLIGHT_FACTOR.fill;
      dir.color.setHex(0xfff8f2);
      dir.intensity = b.dirIntensity * EDITOR_HDRI_KEYLIGHT_FACTOR.dir;
    } else {
      hemi.color.setHex(0xf2f6fb);
      hemi.groundColor.setHex(0xd0d8e2);
      hemi.intensity = b.hemiIntensity;
      fill.color.setHex(0xe8eef4);
      fill.intensity = b.fillIntensity;
      dir.color.setHex(0xfff8f2);
      dir.intensity = b.dirIntensity;
    }
  };

  const structuralState: EditorStructuralState = {
    buildingRoot: null,
    lastBuiltContentEpoch: -1,
    shouldFrameAfterRebuild: true,
  };

  const applyApartmentEditorLayoutPresentation = (opts?: {
    reframeCamera?: boolean;
  }): void => {
    const st = useEditorStore.getState();
    if (!shouldPreviewFpApartmentLighting(st)) return;

    applyPmremEnvironment(true);
    const pmremTexture = scene.environment;
    syncEditorLightingStack(st, false);

    const decorRoots: THREE.Object3D[] = [contentRoot];
    const apartmentFurnitureRoot = getEditorMyApartmentFurnitureMountRoot();
    if (apartmentFurnitureRoot) decorRoots.push(apartmentFurnitureRoot);
    const shellRoots: THREE.Object3D[] = [];
    if (structuralState.buildingRoot) shellRoots.push(structuralState.buildingRoot);

    ensureMammothApartmentDecorShadowRenderer(renderer);
    dir.castShadow = false;
    if (structuralState.buildingRoot) {
      applyApartmentInteriorFloorReceiveShadowUnder(structuralState.buildingRoot);
    }
    applyMammothApartmentInteriorEditorLayoutPresentation({
      scene,
      renderer,
      bounce: apartmentInteriorSceneRig,
      global: { hemi, fill, dir },
      pmremTexture,
      shellRoots,
      decorRoots,
      view: { camera, raycasters: [raycaster, decorSupportRaycaster] },
      atmosphereRestore: editorStudioAtmosphere,
    });
    resyncEditorMyApartmentDecorShadows();
    ensureMammothApartmentDecorShadowRenderer(renderer);
    requestMammothRendererShadowMapUpdate(renderer);

    if (opts?.reframeCamera && structuralState.buildingRoot) {
      frameMammothApartmentInteriorGameplayPreview({
        camera,
        orbitControls,
        shellRoot: structuralState.buildingRoot,
      });
    }
  };

  const applyEnvironment = (st: ReturnType<typeof useEditorStore.getState>): void => {
    const fpApartmentPreview = shouldPreviewFpApartmentLighting(st);
    const globalHdriOn = shouldUseEditorHdri(st);
    applyPmremEnvironment(fpApartmentPreview || globalHdriOn);
    const pmremTexture = scene.environment;

    syncEditorLightingStack(st, globalHdriOn && !fpApartmentPreview);

    const decorRoots: THREE.Object3D[] = [contentRoot];
    const apartmentFurnitureRoot = getEditorMyApartmentFurnitureMountRoot();
    if (apartmentFurnitureRoot) decorRoots.push(apartmentFurnitureRoot);
    const shellRoots: THREE.Object3D[] = [];
    if (structuralState.buildingRoot) shellRoots.push(structuralState.buildingRoot);

    if (fpApartmentPreview) {
      applyApartmentEditorLayoutPresentation({ reframeCamera: true });
    } else {
      syncMammothApartmentInteriorMetallicEnv({
        scene,
        envTexture: globalHdriOn ? scene.environment : null,
        decorRoots,
        shellRoots,
      });
    }
  };

  const syncCurrentEditorLightingAttachment = (): void => {
    const envTexture =
      scene.userData.mammothFpMetallicReadableEnv instanceof THREE.Texture
        ? scene.userData.mammothFpMetallicReadableEnv
        : scene.environment;
    const decorRoots: THREE.Object3D[] = [contentRoot];
    const apartmentFurnitureRoot = getEditorMyApartmentFurnitureMountRoot();
    if (apartmentFurnitureRoot) decorRoots.push(apartmentFurnitureRoot);
    const shellRoots: THREE.Object3D[] = [];
    if (structuralState.buildingRoot) shellRoots.push(structuralState.buildingRoot);
    syncMammothApartmentInteriorMetallicEnv({
      scene,
      envTexture,
      decorRoots,
      shellRoots,
    });
  };

  contentRoot.name = "editorContentRoot";
  scene.add(contentRoot);

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
    pinnedSpan: WallScalePinnedSpan | null;
  } | null = null;

  /** Decor root scale at pointer-down — axis handles pin untouched axes (Y-only stretch, etc.). */
  const decorScaleGestureStartByUuid = new Map<string, MyApartmentDecorScaleGesturePin>();
  /** Saved-group manip scale at pointer-down — baked into decor children on mouseUp. */
  let groupManipScaleGesturePin: MyApartmentDecorScaleGesturePin | null = null;

  function readTransformControlsPointerStart(): THREE.Vector3 {
    const pointStart = (
      transformControls as unknown as { pointStart?: THREE.Vector3 | null }
    ).pointStart;
    return pointStart?.clone() ?? new THREE.Vector3(1, 0, 0);
  }

  function readTransformControlsPointerEnd(): THREE.Vector3 | null {
    const pointEnd = (
      transformControls as unknown as { pointEnd?: THREE.Vector3 | null }
    ).pointEnd;
    return pointEnd?.clone() ?? null;
  }

  function makeDecorScaleGesturePin(object: THREE.Object3D): MyApartmentDecorScaleGesturePin {
    return {
      startScale: object.scale.clone(),
      pointerStart: readTransformControlsPointerStart(),
    };
  }

  function primeDecorScaleGestureStarts(attached: THREE.Object3D): void {
    decorScaleGestureStartByUuid.clear();
    groupManipScaleGesturePin = null;
    const pinFor = (object: THREE.Object3D) => makeDecorScaleGesturePin(object);
    if (attached.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] === true) {
      groupManipScaleGesturePin = pinFor(attached);
      for (const child of attached.children) {
        if (!(child instanceof THREE.Group)) continue;
        if (!child.userData.mammothEditorMyApartmentDecorId) continue;
        decorScaleGestureStartByUuid.set(child.uuid, pinFor(child));
      }
      return;
    }
    decorScaleGestureStartByUuid.set(attached.uuid, pinFor(attached));
  }

  function groupManipScaleGesturePinFor(): MyApartmentDecorScaleGesturePin | null {
    return groupManipScaleGesturePin;
  }

  function bakeGroupManipScaleIntoDecorChildrenIfNeeded(
    attached: THREE.Object3D | undefined,
  ): void {
    if (
      !attached ||
      attached.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] !== true ||
      !groupManipScaleGesturePin
    ) {
      return;
    }
    const decorStarts = new Map<string, THREE.Vector3>();
    for (const [uuid, pin] of decorScaleGestureStartByUuid) {
      decorStarts.set(uuid, pin.startScale);
    }
    bakeMyApartmentGroupManipScaleIntoDecorChildren(
      attached,
      groupManipScaleGesturePin.startScale,
      decorStarts,
    );
    groupManipScaleGesturePin = null;
  }

  function decorScaleGesturePinFor(
    object: THREE.Object3D,
    transformMode: ReturnType<typeof useEditorStore.getState>["transformMode"],
  ): MyApartmentDecorScaleGesturePin | null {
    if (transformMode !== "scale" || !transformControls.dragging) {
      return null;
    }
    return decorScaleGestureStartByUuid.get(object.uuid) ?? null;
  }

  function constrainDecorScaleFromGizmo(
    root: THREE.Object3D,
    transformMode: ReturnType<typeof useEditorStore.getState>["transformMode"],
    gesturePin: MyApartmentDecorScaleGesturePin | null,
  ): void {
    withProgrammaticTransformControls(() => {
      constrainMyApartmentDecorScaleFromGizmo(root, {
        transformMode,
        axis: (transformControls as unknown as { axis?: string | null }).axis,
        dragging: transformControls.dragging,
        gesturePin,
        pointerEnd: readTransformControlsPointerEnd(),
      });
    });
  }

  function wallSlabScaleDragFor(
    object: THREE.Object3D,
    transformMode: ReturnType<typeof useEditorStore.getState>["transformMode"],
  ) {
    if (
      transformMode !== "scale" ||
      !wallSlabScaleGesture ||
      wallSlabScaleGesture.object !== object ||
      !transformControls.dragging
    ) {
      return undefined;
    }
    return {
      meshScaleAtGestureStart: wallSlabScaleGesture.meshStart,
      activeWorldAxis: parseTransformControlsWorldScaleAxis(
        (transformControls as unknown as { axis?: string | null }).axis,
      ),
      pinnedSpan: wallSlabScaleGesture.pinnedSpan,
    };
  }

  function mirrorSlabScaleDragFor(
    object: THREE.Object3D,
    transformMode: ReturnType<typeof useEditorStore.getState>["transformMode"],
  ) {
    if (
      transformMode !== "scale" ||
      !wallSlabScaleGesture ||
      wallSlabScaleGesture.object !== object ||
      !transformControls.dragging
    ) {
      return undefined;
    }
    return { meshScaleAtGestureStart: wallSlabScaleGesture.meshStart };
  }

  const decorSupportRaycaster = new THREE.Raycaster();
  const decorSupportBox = new THREE.Box3();
  const decorSupportSize = new THREE.Vector3();
  const decorSupportRayOrigin = new THREE.Vector3();
  const decorSupportRayDirection = new THREE.Vector3(0, -1, 0);
  const decorSupportNormalMatrix = new THREE.Matrix3();
  const decorSupportWorldNormal = new THREE.Vector3();
  const decorSupportSamples = Array.from({ length: 5 }, () => new THREE.Vector3());
  const DECOR_SUPPORT_SURFACE_EPS_M = 0.01;
  const DECOR_SUPPORT_RAY_START_ABOVE_M = 3;

  function objectIsDescendantOf(
    object: THREE.Object3D,
    ancestor: THREE.Object3D,
  ): boolean {
    for (let cur: THREE.Object3D | null = object; cur; cur = cur.parent) {
      if (cur === ancestor) return true;
    }
    return false;
  }

  function objectAndAncestorsVisible(object: THREE.Object3D): boolean {
    for (let cur: THREE.Object3D | null = object; cur; cur = cur.parent) {
      if (!cur.visible) return false;
    }
    return true;
  }

  function supportHitHasUpwardWorldNormal(hit: THREE.Intersection): boolean {
    if (!hit.face) return false;
    decorSupportNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
    decorSupportWorldNormal
      .copy(hit.face.normal)
      .applyMatrix3(decorSupportNormalMatrix)
      .normalize();
    return decorSupportWorldNormal.y > 0.65;
  }

  function constrainMyApartmentDecorToSupportSurfaces(root: THREE.Object3D): void {
    const decorId = root.userData.mammothEditorMyApartmentDecorId;
    if (typeof decorId === "string") {
      const item = useEditorStore
        .getState()
        .ownedApartmentBuiltins.placedItems.find((placed) => placed.id === decorId);
      if (item?.ignoreSupportSurfaces === true) return;
    }
    const supportRoot = structuralState.buildingRoot;
    if (!supportRoot) return;
    root.updateMatrixWorld(true);
    decorSupportBox.setFromObject(root);
    if (decorSupportBox.isEmpty()) return;
    decorSupportBox.getSize(decorSupportSize);

    const minX = decorSupportBox.min.x;
    const maxX = decorSupportBox.max.x;
    const minZ = decorSupportBox.min.z;
    const maxZ = decorSupportBox.max.z;
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const cornerInsetX = Math.min(Math.max(decorSupportSize.x * 0.15, 0.02), decorSupportSize.x * 0.45);
    const cornerInsetZ = Math.min(Math.max(decorSupportSize.z * 0.15, 0.02), decorSupportSize.z * 0.45);
    const sampleY = decorSupportBox.max.y + DECOR_SUPPORT_RAY_START_ABOVE_M;
    decorSupportSamples[0]!.set(centerX, sampleY, centerZ);
    decorSupportSamples[1]!.set(minX + cornerInsetX, sampleY, minZ + cornerInsetZ);
    decorSupportSamples[2]!.set(maxX - cornerInsetX, sampleY, minZ + cornerInsetZ);
    decorSupportSamples[3]!.set(minX + cornerInsetX, sampleY, maxZ - cornerInsetZ);
    decorSupportSamples[4]!.set(maxX - cornerInsetX, sampleY, maxZ - cornerInsetZ);

    let supportY = -Infinity;
    const supportProbeMaxY =
      decorSupportBox.max.y + Math.max(0.25, decorSupportSize.y * 0.5);
    for (const sample of decorSupportSamples) {
      decorSupportRayOrigin.copy(sample);
      decorSupportRaycaster.set(decorSupportRayOrigin, decorSupportRayDirection);
      decorSupportRaycaster.near = 0;
      decorSupportRaycaster.far = DECOR_SUPPORT_RAY_START_ABOVE_M + decorSupportSize.y + 4;
      const hits = decorSupportRaycaster.intersectObject(supportRoot, true);
      for (const hit of hits) {
        if (objectIsDescendantOf(hit.object, root)) continue;
        if (!objectAndAncestorsVisible(hit.object)) continue;
        if (!supportHitHasUpwardWorldNormal(hit)) continue;
        if (hit.point.y > supportProbeMaxY) continue;
        supportY = Math.max(supportY, hit.point.y);
        break;
      }
    }

    if (
      Number.isFinite(supportY) &&
      decorSupportBox.min.y < supportY - DECOR_SUPPORT_SURFACE_EPS_M
    ) {
      root.position.y += supportY - decorSupportBox.min.y;
    }
  }

  function snapMyApartmentDecorNeighborsDuringTranslate(root: THREE.Object3D): void {
    if (!root.userData.mammothEditorMyApartmentDecorId) return;
    const aptSt = useEditorStore.getState();
    if (
      aptSt.mode !== "my_apartment_layout" ||
      aptSt.transformMode !== "translate" ||
      !aptSt.decorNeighborAlignSnap
    ) {
      return;
    }
    applyMyApartmentDecorNeighborSnap(root, getEditorMyApartmentFurnitureMountRoot(), {
      gapM: aptSt.gridSnapM > 0 ? aptSt.gridSnapM : undefined,
      inferGapFromNeighbors: aptSt.gridSnapM <= 0,
    });
  }

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
  orbitControls.target.set(0, 1.45, 0);
  orbitControls.minDistance = EDITOR_ORBIT_MIN_DISTANCE_M;
  orbitControls.maxDistance = ORBIT_MAX_DISTANCE;
  const applyDistanceInvariantOrbitSpeeds = createEditorOrbitDistanceSpeedBinder({
    camera,
    orbitControls,
  });
  applyDistanceInvariantOrbitSpeeds();
  const detachOrbitSnappyFeel = attachEditorOrbitSnappyFeel(orbitControls);
  orbitControls.update();
  const orbitKeyboardMove = createEditorOrbitKeyboardMove({
    camera,
    orbitControls,
    getSpeedMps: () => useEditorStore.getState().flySpeedMps,
    getEnabled: () => orbitControls.enabled,
  });

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

  registerEditorSelectionTargetResolver(() => {
    const attached = transformControls.object as THREE.Object3D | undefined;
    return findBestSelectionTarget() ?? attached ?? null;
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
    /** Shared previews keep a fixed look; all other modes obey the HDRI toggle (incl. FP authoring). */
    return !isSharedPreviewMode(st.mode) && st.useHdriEnvironment;
  }

  function shouldShowEditorGrid(
    st: ReturnType<typeof useEditorStore.getState>,
  ): boolean {
    return (
      !isFpMode(st.mode) &&
      !isSharedPreviewMode(st.mode) &&
      st.mode !== "my_apartment_layout"
    );
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
      frameApartmentGameplayPreview: (shellRoot) => {
        if (!shouldPreviewFpApartmentLighting(useEditorStore.getState())) return;
        frameMammothApartmentInteriorGameplayPreview({
          camera,
          orbitControls,
          shellRoot,
        });
      },
    });
    syncCurrentEditorLightingAttachment();
  }

  /** Decor / slab wall / saved-group aggregated flags for TransformControls limits in apartment authoring. */
  function myApartmentGizmoSemantics(st: ReturnType<
    typeof useEditorStore.getState
  >): {
    apartmentFreeVertical: boolean;
    /** Local Z rotate handle only for décors (matches single-selection behavior). */
    decorRotateHandleZ: boolean;
    /** True when walls participate but no décors — governs yaw snap presets. */
    wallOnlyAggregate: boolean;
  } {
    const decorSel = parseMyApartmentLayoutDecorSelectedId(st.selectedId) !== null;
    const mirrorSel = parseMyApartmentLayoutMirrorSelectedId(st.selectedId) !== null;
    const wallSel = parseMyApartmentLayoutWallSelectedId(st.selectedId) !== null;
    let hasDecorMember = decorSel || mirrorSel;
    let hasWallMember = wallSel;

    const savedGroupKey = parseMyApartmentLayoutSavedObjectGroupId(st.selectedId);
    if (savedGroupKey) {
      const def = st.ownedApartmentBuiltins.objectGroups.find((g) => g.id === savedGroupKey);
      if (def) {
        hasDecorMember =
          hasDecorMember ||
          def.memberSelectedIds.some(
            (id) =>
              parseMyApartmentLayoutDecorSelectedId(id) !== null ||
              parseMyApartmentLayoutMirrorSelectedId(id) !== null,
          );
        hasWallMember =
          hasWallMember ||
          def.memberSelectedIds.some(
            (id) => parseMyApartmentLayoutWallSelectedId(id) !== null,
          );
      }
    }

    return {
      apartmentFreeVertical: hasDecorMember || hasWallMember,
      decorRotateHandleZ: hasDecorMember,
      wallOnlyAggregate: hasWallMember && !hasDecorMember,
    };
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
        if (!s.myApartmentLayoutTransformArmed) {
          teardownApartmentSavedObjectGroupManipulator();
          transformControls.detach();
          return;
        }
        syncApartmentSavedObjectGroupManipulator({
          selectedId: s.selectedId,
          doc: s.ownedApartmentBuiltins,
        });
        const g = getEditorMyApartmentSelectionGroup(s.selectedId);
        if (!g) {
          transformControls.detach();
          return;
        }
        transformControls.attach(g);
        const openingSel = parseMyApartmentLayoutWallOpeningSelectedId(s.selectedId);
        if (openingSel) {
          transformControls.setMode("translate");
          transformControls.setSpace("local");
          transformControls.showX = true;
          transformControls.showY = false;
          transformControls.showZ = false;
          const snap = s.gridSnapM;
          transformControls.setTranslationSnap(snap > 0 ? snap : null);
          transformControls.setRotationSnap(null);
          transformControls.setScaleSnap(null);
          transformControls.setSize(1.35);
          return;
        }
        const gx = myApartmentGizmoSemantics(s);
        const apartmentFreeVertical = gx.apartmentFreeVertical;
        transformControls.setMode(s.transformMode);
        transformControls.setSpace("world");
        if (s.transformMode === "translate") {
          transformControls.showX = true;
          transformControls.showY = apartmentFreeVertical;
          transformControls.showZ = true;
        } else if (s.transformMode === "rotate") {
          if (gx.wallOnlyAggregate) {
            /** Slab walls: yaw on world Y; optional pitch on X (no roll ring). */
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = false;
          } else {
            transformControls.showX = true;
            transformControls.showY = true;
            transformControls.showZ = gx.decorRotateHandleZ;
          }
        } else {
          transformControls.showX = true;
          transformControls.showY = true;
          transformControls.showZ = true;
        }
        const snap = s.gridSnapM;
        transformControls.setTranslationSnap(snap > 0 ? snap : null);
        if (s.transformMode === "rotate") {
          if (gx.decorRotateHandleZ) {
            transformControls.setRotationSnap(EDITOR_MY_APARTMENT_DECOR_YAW_SNAP_RAD);
          } else if (gx.wallOnlyAggregate) {
            transformControls.setRotationSnap(Math.PI / 2);
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
          const rotationSnapRad = THREE.MathUtils.degToRad(15);
          transformControls.setTranslationSnap(snap > 0 ? snap : null);
          if (s.transformMode === "rotate") {
            const floorPlanMode =
              s.mode === "floor" || s.mode === "floor_override";
            transformControls.setRotationSnap(
              floorPlanMode || snap > 0 ? rotationSnapRad : null,
            );
          } else {
            transformControls.setRotationSnap(null);
          }
          transformControls.setScaleSnap(snap > 0 ? snap : null);
        }
      }
    });
  }

  const commitLevelEditorAttachedTransformToStore = () =>
    commitEditorAttachedTransform({
      getProgrammaticTransformControlsDepth: () =>
        programmaticTransformControlsDepth,
      getLevelEditorTransformGesture: () => levelEditorTransformGesture,
      transformControls,
      contentRoot,
    });

  registerEditorMyApartmentLayoutPersistFromSceneRequest(() => {
    commitLevelEditorAttachedTransformToStore();
    persistAllMyApartmentWallPlacementsFromScene();
  });

  registerEditorFillWallOpeningRequest((wallId) => {
    const group = getEditorMyApartmentSelectionGroup(
      editorMyApartmentSelectedIdForWall(wallId),
    );
    if (!group) return;
    constrainMyApartmentWallRootPose(group, undefined, {
      autoYaw: false,
      neighborSnap: false,
      fillRunBracket: true,
    });
    commitLevelEditorAttachedTransformToStore();
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
    if (st.mode === "my_apartment_layout" && st.transformMode === "scale" && attached) {
      primeDecorScaleGestureStarts(attached);
    } else {
      decorScaleGestureStartByUuid.clear();
    }
    if (
      st.mode === "my_apartment_layout" &&
      st.transformMode === "scale" &&
      (attached?.userData.mammothEditorMyApartmentWallId ||
        attached?.userData.mammothEditorMyApartmentMirrorId)
    ) {
      const mesh =
        findEditorMyApartmentWallSlabMesh(attached) ??
        findEditorMyApartmentMirrorSurfaceMesh(attached);
      const tcAxis = (transformControls as unknown as { axis?: string | null }).axis;
      const pointStart = (
        transformControls as unknown as { pointStart?: THREE.Vector3 | null }
      ).pointStart;
      wallSlabScaleGesture = mesh
        ? {
            object: attached,
            meshStart: mesh.scale.clone(),
            pinnedSpan:
              attached.userData.mammothEditorMyApartmentWallId
                ? captureWallScalePinnedSpanFromGesture({
                    root: attached,
                    transformAxis: tcAxis,
                    pointStart: pointStart ?? null,
                  })
                : null,
          }
        : null;
    } else {
      wallSlabScaleGesture = null;
    }
  });
  transformControls.addEventListener("mouseUp", () => {
    if (isFpMode(useEditorStore.getState().mode)) return;
    levelEditorTransformGesture = false;
    levelEditorAnchoredScaleGesture = null;
    const attached = transformControls.object as THREE.Object3D | undefined;
    bakeGroupManipScaleIntoDecorChildrenIfNeeded(attached);
    /** No `objectChange` if the pointer never moved; still persist rest pose. */
    commitLevelEditorAttachedTransformToStore();
    wallSlabScaleGesture = null;
    decorScaleGestureStartByUuid.clear();
    groupManipScaleGesturePin = null;
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
    /** Immediate camera off so orbit release before the next Zustand tick. */
    orbitControls.enabled = !active;
    if (!active) levelEditorTransformGesture = false;
    if (!active) levelEditorAnchoredScaleGesture = null;
    if (active) {
      useEditorStore.getState().beginTransaction();
    } else {
      useEditorStore.getState().commitTransaction();
      if (st.mode === "my_apartment_layout") {
        commitLevelEditorAttachedTransformToStore();
        myApartmentAuthoring.flushDeferredMountSync();
        myApartmentAuthoring.flushPendingWallsVisualSync();
      }
    }
  });
  transformControls.addEventListener("objectChange", () => {
    const aptSt = useEditorStore.getState();
    const aptObj = transformControls.object as THREE.Object3D | undefined;
    if (aptSt.mode === "my_apartment_layout" && aptObj) {
      if (aptObj.userData.editorMyApartmentWallOpeningProxy === true) {
        const openingId = aptObj.userData.mammothEditorMyApartmentWallOpeningId as
          | string
          | undefined;
        let wallRoot: THREE.Object3D | null = aptObj.parent;
        while (wallRoot && !wallRoot.userData.mammothEditorMyApartmentWallId) {
          wallRoot = wallRoot.parent;
        }
        const wallId = wallRoot?.userData.mammothEditorMyApartmentWallId as string | undefined;
        if (wallId && openingId && wallRoot) {
          const wallItem = aptSt.ownedApartmentBuiltins.wallItems.find((w) => w.id === wallId);
          if (wallItem) {
            clampMyApartmentWallOpeningProxyPose(aptObj, wallRoot, wallItem, openingId);
          }
        }
        /** Persist on mouseUp only — store sync rebuilds the proxy mesh mid-drag. */
        return;
      } else if (aptObj.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] === true) {
        if (aptSt.transformMode === "scale") {
          constrainDecorScaleFromGizmo(
            aptObj,
            aptSt.transformMode,
            groupManipScaleGesturePinFor(),
          );
        }
        for (const child of [...aptObj.children]) {
          if (!(child instanceof THREE.Group)) continue;
          if (
            child.userData.mammothEditorMyApartmentDecorId ||
            child.userData.mammothEditorMyApartmentMirrorId
          ) {
            if (aptSt.transformMode === "rotate") {
              clampMyApartmentDecorEulerLimits(child);
              if (aptSt.gridSnapM > 0) {
                snapMyApartmentDecorEulerToGrid(child);
              }
            }
            if (
              aptSt.transformMode !== "rotate" &&
              child.userData.mammothEditorMyApartmentDecorId
            ) {
              snapMyApartmentDecorNeighborsDuringTranslate(child);
              constrainMyApartmentDecorVerticalBounds(child);
              constrainMyApartmentDecorToSupportSurfaces(child);
            }
            if (child.userData.mammothEditorMyApartmentMirrorId) {
              if (aptSt.transformMode === "scale") {
                const axis = (transformControls as unknown as { axis?: string | null }).axis;
                if (
                  wallSlabScaleGesture &&
                  wallSlabScaleGesture.object === child &&
                  transformControls.dragging &&
                  axis &&
                  axis !== "XYZ" &&
                  !axis.includes("E")
                ) {
                  if (axis.indexOf("X") === -1) child.scale.x = 1;
                  if (axis.indexOf("Y") === -1) child.scale.y = 1;
                  if (axis.indexOf("Z") === -1) child.scale.z = 1;
                }
              }
              const scaleDrag = mirrorSlabScaleDragFor(child, aptSt.transformMode);
              constrainMyApartmentMirrorRootPose(child, scaleDrag);
            }
          } else if (child.userData.mammothEditorMyApartmentWallId) {
            if (aptSt.transformMode === "scale") {
              const axis = (transformControls as unknown as { axis?: string | null })
                .axis;
              if (
                wallSlabScaleGesture &&
                wallSlabScaleGesture.object === child &&
                transformControls.dragging &&
                axis &&
                axis !== "XYZ" &&
                !axis.includes("E")
              ) {
                if (axis.indexOf("X") === -1) child.scale.x = 1;
                if (axis.indexOf("Y") === -1) child.scale.y = 1;
                if (axis.indexOf("Z") === -1) child.scale.z = 1;
              }
            }
            const scaleDrag = wallSlabScaleDragFor(child, aptSt.transformMode);
            constrainMyApartmentWallRootPose(child, scaleDrag, { autoYaw: false });
          }
        }
      } else if (
        aptObj.userData.mammothEditorMyApartmentDecorId ||
        aptObj.userData.mammothEditorMyApartmentMirrorId
      ) {
        if (aptObj.userData.mammothEditorMyApartmentDecorId) {
          constrainDecorScaleFromGizmo(
            aptObj,
            aptSt.transformMode,
            decorScaleGesturePinFor(aptObj, aptSt.transformMode),
          );
        } else if (aptSt.transformMode === "scale") {
          constrainDecorScaleFromGizmo(aptObj, aptSt.transformMode, null);
        }
        if (aptSt.transformMode === "rotate") {
          clampMyApartmentDecorEulerLimits(aptObj);
          if (aptSt.gridSnapM > 0) {
            snapMyApartmentDecorEulerToGrid(aptObj);
          }
        }
        if (aptSt.transformMode !== "rotate" && aptObj.userData.mammothEditorMyApartmentDecorId) {
          snapMyApartmentDecorNeighborsDuringTranslate(aptObj);
          constrainMyApartmentDecorVerticalBounds(aptObj);
          constrainMyApartmentDecorToSupportSurfaces(aptObj);
        }
        if (aptObj.userData.mammothEditorMyApartmentMirrorId) {
          if (aptSt.transformMode === "scale") {
            const axis = (transformControls as unknown as { axis?: string | null }).axis;
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
          const scaleDrag = mirrorSlabScaleDragFor(aptObj, aptSt.transformMode);
          constrainMyApartmentMirrorRootPose(aptObj, scaleDrag);
        }
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
        const scaleDrag = wallSlabScaleDragFor(aptObj, aptSt.transformMode);
        constrainMyApartmentWallRootPose(aptObj, scaleDrag, { autoYaw: false });
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
    demandEditorSceneRender();
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
    applyFpOrbitMouseButtons,
    applyLevelEditorMouseButtons,
    renderer,
    dir,
    scene,
    applyEnvironment,
    shouldShowEditorGrid,
    fp,
    contentRoot,
    grid,
    camera,
    syncTransformAttachment,
  });

  const myApartmentAuthoring = createEditorSceneMyApartmentLifecycle({
    getStructuralRoot: () => structuralState.buildingRoot,
    getShouldHoldReplicaResync: () =>
      programmaticTransformControlsDepth > 0 ||
      transformControls.dragging === true ||
      levelEditorTransformGesture,
  syncLightingAttachment: syncCurrentEditorLightingAttachment,
    syncApartmentLayoutPresentation: () => applyApartmentEditorLayoutPresentation(),
    syncTransformAttachment,
    requestDecorShadowMapBake: () => {
      requestMammothRendererShadowMapUpdate(renderer);
    },
  });
  const disposeMyApartmentAuthoring = myApartmentAuthoring.dispose;

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
  myApartmentAuthoring.flushDeferredMountSync();
  applyEnvironment(useEditorStore.getState());
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
    orbitKeyboardMove,
    fp,
    previewSelectionOutline,
    fpSelectionOutline,
    findBestSelectionTarget,
    withProgrammaticTransformControls,
    isFpMode,
    beforeOrbitControlsUpdate: applyDistanceInvariantOrbitSpeeds,
  });

  const disposeTransformModeDigitHotkeys = registerEditorTransformModeDigitHotkeys({
    getTransformControlsDragging: () => transformControls.dragging === true,
  });
  const disposeApartmentLayoutDeleteHotkeys = registerEditorApartmentLayoutDeleteHotkeys({
    getTransformControlsDragging: () => transformControls.dragging === true,
  });
  const disposeHistoryHotkeys = registerEditorHistoryHotkeys({
    getTransformControlsDragging: () => transformControls.dragging === true,
  });

  return () => {
    registerEditorSpawnCalculator(null);
    registerEditorNavigationBridge(null);
    fp.teardownFpSession();
    orbitKeyboardMove.dispose();
    detachOrbitSnappyFeel();
    orbitControls.dispose();
    stopRenderLoop();
    disposeTransformModeDigitHotkeys();
    disposeApartmentLayoutDeleteHotkeys();
    disposeHistoryHotkeys();
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
    registerEditorMyApartmentLayoutPersistFromSceneRequest(null);
    registerEditorFillWallOpeningRequest(null);
    unregisterEditorSelectionTargetResolver();
    disposeMyApartmentAuthoring();
    apartmentInteriorSceneRig.dispose();
    disposeEditorStructuralRoot(structuralState, contentRoot);
    pmrem.dispose();
    applyPmremEnvironment(false);
    syncMammothApartmentInteriorMetallicEnv({
      scene,
      envTexture: null,
      decorRoots: [contentRoot],
      shellRoots: [],
    });
    disposeSceneEnvironment(scene);
    renderer.dispose();
    scene.clear();
  };
}

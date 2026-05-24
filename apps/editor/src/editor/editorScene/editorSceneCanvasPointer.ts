import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useEditorStore } from "../../state/editorStore.js";
import { getFpViewmodelAuthoringPicks } from "../fpAuthoring/fpViewmodelAuthoringBridge.js";
import { resolveFpAuthorPickId } from "../fpAuthoring/fpAuthorPickResolve.js";
import { demandEditorSceneRender } from "./editorSceneRenderDemand.js";
import { PreviewSelectionShapeOutline } from "../scene/previewSelectionShapeOutline.js";
import { editorAncestorPlateLevelIndex } from "./editorAncestorLevelIndex.js";
import {
  resolveCabPartId,
  resolveCabPartTarget,
  resolveGizmoFloorDocId,
  resolveLandingKitPickId,
  resolveLandingKitPickTarget,
  resolvePlacedId,
  resolveStairWellPartId,
  resolveStairWellPartTarget,
} from "../placement/editorPlacementKeys.js";
import { resolveEditorMyApartmentLayoutPick } from "../myApartment/editorMyApartmentPointerResolve.js";
import {
  isConsumableFpAuthoringState,
  isFpMode,
  isWeaponFpAuthoringState,
} from "./editorStoreModeGuards.js";
import type { EditorFpAuthoringLifecycle } from "./editorSceneFpAuthoringLifecycle.js";

export function createEditorSceneCanvasPointerHandlers(deps: {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  transformControls: TransformControls;
  getLevelEditorTransformGesture: () => boolean;
  setFpClickCandidate: (v: { x: number; y: number } | null) => void;
  getFpClickCandidate: () => { x: number; y: number } | null;
  setLevelClickCandidate: (
    v: {
      x: number;
      y: number;
      id: string | null;
      target: THREE.Object3D | null;
      hitFloorDocId: string | null;
      hitLevelIndex: number | null;
    } | null,
  ) => void;
  getLevelClickCandidate: () => {
    x: number;
    y: number;
    id: string | null;
    target: THREE.Object3D | null;
    hitFloorDocId: string | null;
    hitLevelIndex: number | null;
  } | null;
  getBuildingRoot: () => THREE.Group | null;
  landingKitPickOptions: () => { solidLeafAsWhole?: boolean } | undefined;
  getPreferredPreviewSelectionTarget: () => THREE.Object3D | null;
  setPreferredPreviewSelectionTarget: (v: THREE.Object3D | null) => void;
  previewSelectionOutline: PreviewSelectionShapeOutline;
  syncTransformAttachment: () => void;
  fp: EditorFpAuthoringLifecycle;
  withProgrammaticTransformControls: <T>(fn: () => T) => T;
  orbitControls: OrbitControls;
}): {
  onPointerDown: (ev: PointerEvent) => void;
  onPointerUp: (ev: PointerEvent) => void;
  rewireCanvasPrimaryPointerListeners: () => void;
} {
  const {
    canvas,
    camera,
    raycaster,
    pointer,
    transformControls,
    getLevelEditorTransformGesture,
    setFpClickCandidate,
    getFpClickCandidate,
    setLevelClickCandidate,
    getLevelClickCandidate,
    getBuildingRoot,
    landingKitPickOptions,
    getPreferredPreviewSelectionTarget,
    setPreferredPreviewSelectionTarget,
    previewSelectionOutline,
    syncTransformAttachment,
    fp,
    withProgrammaticTransformControls,
    orbitControls,
  } = deps;

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (ev.currentTarget !== canvas) return;
    const st = useEditorStore.getState();
    const pickCam =
      isWeaponFpAuthoringState(st) &&
      st.fpAuthorCamera === "gameplay" &&
      fp.getFpSession()
        ? fp.getFpSession()!.getGameplayCamera()
        : isConsumableFpAuthoringState(st) &&
            st.fpAuthorCamera === "gameplay" &&
            fp.getFpConsumableSession()
          ? fp.getFpConsumableSession()!.getGameplayCamera()
          : camera;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, pickCam);
    if (transformControls.dragging || getLevelEditorTransformGesture()) {
      setFpClickCandidate(null);
      setLevelClickCandidate(null);
      return;
    }

    if (isFpMode(st.mode)) {
      setFpClickCandidate({ x: ev.clientX, y: ev.clientY });
      setLevelClickCandidate(null);
      return;
    }
    setFpClickCandidate(null);
    const targets: THREE.Object3D[] = [];
    const root = getBuildingRoot();
    if (root) targets.push(root);
    const intersects = raycaster.intersectObjects(targets, true);
    const hit = intersects[0] ?? null;
    const store = useEditorStore.getState();
    setLevelClickCandidate({
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
                : store.mode === "my_apartment_layout"
                  ? (resolveEditorMyApartmentLayoutPick(hit.object)?.id ?? null)
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
                : store.mode === "my_apartment_layout"
                  ? (resolveEditorMyApartmentLayoutPick(hit.object)?.target ?? null)
                  : null,
      hitFloorDocId:
        hit && store.mode === "floor"
          ? resolveGizmoFloorDocId(hit.object, store.activeFloorDocId)
          : null,
      hitLevelIndex:
        hit && (store.mode === "floor" || store.mode === "floor_override" || store.mode === "my_apartment_layout")
          ? editorAncestorPlateLevelIndex(hit.object)
          : null,
    });
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

  const onPointerUp = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const st = useEditorStore.getState();

    if (ev.currentTarget !== canvas) return;

    if (isFpMode(st.mode)) {
      const cand = getFpClickCandidate();
      if (!cand) return;
      const dx = ev.clientX - cand.x;
      const dy = ev.clientY - cand.y;
      setFpClickCandidate(null);
      setLevelClickCandidate(null);
      if (Math.hypot(dx, dy) > 5) return;

      const pickCam =
        st.fpAuthorCamera === "gameplay" &&
        isWeaponFpAuthoringState(st) &&
        fp.getFpSession()
          ? fp.getFpSession()!.getGameplayCamera()
          : st.fpAuthorCamera === "gameplay" &&
              isConsumableFpAuthoringState(st) &&
              fp.getFpConsumableSession()
            ? fp.getFpConsumableSession()!.getGameplayCamera()
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

    const levelCandidate = getLevelClickCandidate();
    if (!levelCandidate) return;
    const dx = ev.clientX - levelCandidate.x;
    const dy = ev.clientY - levelCandidate.y;
    setFpClickCandidate(null);
    setLevelClickCandidate(null);
    if (Math.hypot(dx, dy) > 5) return;

    const pickCam = camera;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, pickCam);

    if (!levelCandidate.id) {
      setPreferredPreviewSelectionTarget(null);
      const stClear = useEditorStore.getState();
      if (stClear.mode === "my_apartment_layout") {
        stClear.pickMyApartmentLayoutFromCanvas(null, { additive: false });
      } else {
        useEditorStore.getState().setSelectedId(null);
      }
      previewSelectionOutline.setFromObject(null);
      syncTransformAttachment();
      return;
    }
    const store = useEditorStore.getState();
    setPreferredPreviewSelectionTarget(levelCandidate.target);
    if (store.mode === "floor" && levelCandidate.hitFloorDocId) {
      if (levelCandidate.hitFloorDocId !== store.activeFloorDocId) {
        useEditorStore
          .getState()
          .setActiveFloorDocId(levelCandidate.hitFloorDocId);
      }
      if (
        levelCandidate.hitLevelIndex !== null &&
        levelCandidate.hitLevelIndex !== store.focusedStoryLevelIndex
      ) {
        useEditorStore
          .getState()
          .setFocusedStoryLevelIndex(levelCandidate.hitLevelIndex);
      }
    } else if (
      (store.mode === "floor_override" || store.mode === "my_apartment_layout") &&
      levelCandidate.hitLevelIndex !== null &&
      levelCandidate.hitLevelIndex !== store.focusedStoryLevelIndex
    ) {
      useEditorStore
        .getState()
        .setFocusedStoryLevelIndex(levelCandidate.hitLevelIndex);
    }
    if (
      store.mode === "cab" ||
      store.mode === "landing_preview" ||
      store.mode === "stairwell_preview"
    ) {
      useEditorStore.getState().setTransformMode("translate");
    }
    const additivePick = ev.ctrlKey === true || ev.metaKey === true;
    if (store.mode === "my_apartment_layout") {
      const pickId = levelCandidate.id;

      if (store.myApartmentLayoutHidePickMode && pickId) {
        useEditorStore.getState().hideMyApartmentLayoutPlacementFromCanvas(pickId);
        useEditorStore.getState().setMyApartmentLayoutTransformArmed(false);
        previewSelectionOutline.setFromObject(null);
        syncTransformAttachment();
        return;
      }
      useEditorStore
        .getState()
        .pickMyApartmentLayoutFromCanvas(pickId, { additive: additivePick });
      demandEditorSceneRender();
    } else {
      useEditorStore.getState().setSelectedId(levelCandidate.id);
      previewSelectionOutline.setFromObject(getPreferredPreviewSelectionTarget());
    }
    syncTransformAttachment();
  };

  return { onPointerDown, onPointerUp, rewireCanvasPrimaryPointerListeners };
}

import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useEditorStore } from "../../state/editorStore.js";
import {
  adoptWeaponPresentationFileText,
  getLastWeaponPresentationFileText,
} from "../fpAuthoring/weaponPresentationEditorSync.js";
import { objectLivesUnderScene } from "../scene/sceneGraphUtils.js";
import { FpSelectionAabbOutline } from "../fpAuthoring/fpSelectionAabbOutline.js";
import type { PreviewSelectionShapeOutline } from "../scene/previewSelectionShapeOutline.js";
import { apartmentLayoutOutlineTargetGroups } from "../myApartment/editorMyApartmentSelectionHighlight.js";
import { getEditorFishTankBridge } from "../myApartment/editorMyApartmentPieceGroupBridge.js";
import type { EditorFpAuthoringLifecycle } from "./editorSceneFpAuthoringLifecycle.js";
import {
  isConsumableFpAuthoringState,
  isWeaponFpAuthoringState,
} from "./editorStoreModeGuards.js";
import { registerEditorSceneRenderWake } from "./editorSceneRenderDemand.js";

export function startEditorSceneRenderLoop(deps: {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  transformControls: TransformControls;
  orbitControls: OrbitControls;
  orbitKeyboardMove: { update: (dt: number) => void; isActive: () => boolean };
  fp: EditorFpAuthoringLifecycle;
  previewSelectionOutline: PreviewSelectionShapeOutline;
  fpSelectionOutline: FpSelectionAabbOutline;
  findBestSelectionTarget: () => THREE.Object3D | null;
  withProgrammaticTransformControls: <T>(fn: () => T) => T;
  isFpMode: (mode: ReturnType<typeof useEditorStore.getState>["mode"]) => boolean;
  beforeOrbitControlsUpdate?: () => void;
}): () => void {
  const {
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
    isFpMode: isFpModeFn,
    beforeOrbitControlsUpdate,
  } = deps;

  let raf = 0;
  let lastTickMs = performance.now();
  let lastWeaponPresentationPollMs = 0;
  let lastAptLayoutOutlineSelectionKey = "";
  let lastRenderAspect = 0;
  let lastTransformControlsCamera: THREE.Camera | null = null;

  let orbitPointerDown = false;

  const scheduleFrame = (): void => {
    if (raf !== 0) return;
    raf = requestAnimationFrame(tick);
  };

  const onOrbitStart = (): void => {
    orbitPointerDown = true;
    scheduleFrame();
  };

  const onOrbitEnd = (): void => {
    orbitPointerDown = false;
    scheduleFrame();
  };

  orbitControls.addEventListener("start", onOrbitStart);
  orbitControls.addEventListener("end", onOrbitEnd);
  orbitControls.addEventListener("change", scheduleFrame);

  transformControls.addEventListener("dragging-changed", scheduleFrame);
  transformControls.addEventListener("change", scheduleFrame);

  const unregisterWake = registerEditorSceneRenderWake(scheduleFrame);

  const tick = () => {
    raf = 0;
    const now = performance.now();
    const dt = Math.min((now - lastTickMs) / 1000, 0.05);
    lastTickMs = now;
    const st = useEditorStore.getState();
    const tcDragging = transformControls.dragging === true;
    const inFpMode = isFpModeFn(st.mode);
    const fpSessionActive =
      (isWeaponFpAuthoringState(st) && fp.getFpSession()?.getPresenter()) ||
      (isConsumableFpAuthoringState(st) && fp.getFpConsumableSession()?.isReady());

    if (isWeaponFpAuthoringState(st) && fp.getFpSession()?.getPresenter()) {
      previewSelectionOutline.setFromObject(null);
      const pres = fp.getFpSession()!.getPresenter()!;
      pres.setFpAuthorGripAnchoredToLiveHandPose(st.fpAuthorTargetId !== "hand");
      if (!tcDragging) {
        pres.setFpSwingAuthoringOverlay({
          previewPhase01: null,
          keyframes: null,
        });
        const tPoll = performance.now();
        if (tPoll - lastWeaponPresentationPollMs >= 600) {
          lastWeaponPresentationPollMs = tPoll;
          const weaponId = st.fpAuthorWeaponId;
          void (async () => {
            try {
              const r = await fetch(
                `/content/weapons/${weaponId}.presentation.json`,
                {
                  cache: "no-store",
                },
              );
              if (!r.ok) return;
              const text = await r.text();
              if (text === getLastWeaponPresentationFileText(weaponId)) return;
              adoptWeaponPresentationFileText(pres, weaponId, text);
              fp.maybeSyncFpGizmoFromStore();
            } catch {
              /* ignore */
            }
          })();
        }
      }
      const picksMeta = pres
        .getAuthoringPickList()
        .map((p) => ({ id: p.id, label: p.label }));
      useEditorStore.getState().setFpAuthorPickList(picksMeta);
      if (tcDragging) {
        fp.getFpSession()!.applyAuthoringPitchOnly(st.fpAuthorPitchRad);
      } else {
        fp.getFpSession()!.tick(dt, st.fpAuthorPitchRad);
        fp.maybeSyncFpGizmoFromStore();
      }
      const picksAfter = pres.getAuthoringPickList();
      const sel = picksAfter.find(
        (p) => p.id === useEditorStore.getState().fpAuthorTargetId,
      )?.object;
      fpSelectionOutline.setFromObject(sel ?? null);
    } else if (
      isConsumableFpAuthoringState(st) &&
      fp.getFpConsumableSession()?.isReady()
    ) {
      previewSelectionOutline.setFromObject(null);
      const picksMeta = fp
        .getFpConsumableSession()!
        .getPickList()
        .map((p) => ({ id: p.id, label: p.label }));
      useEditorStore.getState().setFpAuthorPickList(picksMeta);
      if (tcDragging) {
        fp
          .getFpConsumableSession()!
          .applyAuthoringPitchOnly(st.fpAuthorPitchRad);
      } else {
        fp.getFpConsumableSession()!.tick(dt, st.fpAuthorPitchRad);
        fp.maybeSyncFpGizmoFromStore();
      }
      const picks = fp.getFpConsumableSession()!.getPickList();
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
      } else if (st.mode === "my_apartment_layout") {
        fpSelectionOutline.setFromObject(null);
        const fishBridge = getEditorFishTankBridge();
        if (fishBridge?.hasActiveSchools()) {
          fishBridge.tick(dt);
        }
        const selectionKey = `${st.selectedId ?? ""}\0${st.myApartmentMultiselectExtraIds.join("\0")}`;
        if (tcDragging || selectionKey !== lastAptLayoutOutlineSelectionKey) {
          if (!tcDragging) lastAptLayoutOutlineSelectionKey = selectionKey;
          const targets = apartmentLayoutOutlineTargetGroups(st);
          if (targets.length === 0) previewSelectionOutline.setFromObject(null);
          else previewSelectionOutline.setFromRoots(targets);
        }
      } else {
        previewSelectionOutline.setFromObject(null);
      }
    }
    const renderCam =
      isWeaponFpAuthoringState(st) &&
      st.fpAuthorCamera === "gameplay" &&
      fp.getFpSession()
        ? fp.getFpSession()!.getGameplayCamera()
        : isConsumableFpAuthoringState(st) &&
            st.fpAuthorCamera === "gameplay" &&
            fp.getFpConsumableSession()
          ? fp.getFpConsumableSession()!.getGameplayCamera()
          : camera;
    if (
      isWeaponFpAuthoringState(st) &&
      st.fpAuthorCamera === "gameplay" &&
      fp.getFpSession()
    ) {
      fp.getFpSession()!.syncWorldMatrices();
    } else if (
      isConsumableFpAuthoringState(st) &&
      st.fpAuthorCamera === "gameplay" &&
      fp.getFpConsumableSession()
    ) {
      fp.getFpConsumableSession()!.syncWorldMatrices();
    }
    const nextAspect = canvas.clientWidth / canvas.clientHeight;
    if (
      Number.isFinite(nextAspect) &&
      nextAspect > 0 &&
      nextAspect !== lastRenderAspect
    ) {
      lastRenderAspect = nextAspect;
      renderCam.aspect = nextAspect;
      renderCam.updateProjectionMatrix();
    }
    if (lastTransformControlsCamera !== renderCam) {
      lastTransformControlsCamera = renderCam;
      (transformControls as unknown as { camera: THREE.Camera }).camera =
        renderCam;
    }
    if (!tcDragging) {
      if (inFpMode && st.fpAuthorCamera === "orbit") {
        beforeOrbitControlsUpdate?.();
        orbitControls.update();
        orbitKeyboardMove.update(dt);
      } else if (!inFpMode) {
        beforeOrbitControlsUpdate?.();
        orbitControls.update();
        orbitKeyboardMove.update(dt);
      }
    }

    const attached = transformControls.object as THREE.Object3D | undefined;
    if (attached && !objectLivesUnderScene(attached, scene)) {
      withProgrammaticTransformControls(() => transformControls.detach());
    }
    renderer.render(scene, renderCam);

    const orbitMotionActive =
      orbitPointerDown || orbitKeyboardMove.isActive();

    const keepAnimating =
      fpSessionActive ||
      tcDragging ||
      orbitMotionActive ||
      (st.mode === "my_apartment_layout" && (getEditorFishTankBridge()?.hasActiveSchools() ?? false));

    if (keepAnimating) {
      scheduleFrame();
    }
  };

  scheduleFrame();

  return () => {
    cancelAnimationFrame(raf);
    unregisterWake();
    orbitControls.removeEventListener("start", onOrbitStart);
    orbitControls.removeEventListener("end", onOrbitEnd);
    orbitControls.removeEventListener("change", scheduleFrame);
  };
}

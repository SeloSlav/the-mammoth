import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { useEditorStore } from "../../state/editorStore.js";
import type { LocalFirstPersonPresenter } from "@the-mammoth/engine";
import { FpViewmodelEditorSession } from "../fpAuthoring/fpViewmodelEditorSession.js";
import { registerFpViewmodelAuthoringBridge } from "../fpAuthoring/fpViewmodelAuthoringBridge.js";
import {
  adoptWeaponPresentationFileText,
  registerWeaponPresentationPostSaveApply,
  resetWeaponPresentationEditorSyncStateForTeardown,
} from "../fpAuthoring/weaponPresentationEditorSync.js";
import { isWeaponFpAuthoringState } from "./editorStoreModeGuards.js";

type WeaponFpSessionRef = {
  current: FpViewmodelEditorSession | null;
};

type WeaponFpLoadingRef = { current: boolean };

export function createWeaponFpAuthoringSessionActions(opts: {
  scene: THREE.Scene;
  contentRoot: THREE.Group;
  grid: THREE.GridHelper;
  transformControls: TransformControls;
  withProgrammaticTransformControls: <T>(fn: () => T) => T;
  rewireCanvasPrimaryPointerListeners: () => void;
  setLevelEditorTransformGesture: (v: boolean) => void;
  clearFpClickCandidate: () => void;
  fpSelectionOutline: { setFromObject: (o: THREE.Object3D | null) => void };
  syncTransformAttachment: () => void;
  session: WeaponFpSessionRef;
  loading: WeaponFpLoadingRef;
  runExclusiveTeardown: (fn: () => void) => void;
  rigAnchor: {
    attach: (pres: LocalFirstPersonPresenter) => void;
    dispose: () => void;
  };
  maybeSyncFpGizmoFromStore: () => void;
  clearFpGizmoAttachKey: () => void;
  frameOrbitOnFpViewmodel: () => void;
}): {
  ensureFpSession: () => void;
  disposeFpViewmodelRuntimeOnly: () => void;
  frameMountIntoGameplayView: () => void;
} {
  const {
    scene,
    contentRoot,
    grid,
    transformControls,
    withProgrammaticTransformControls,
    rewireCanvasPrimaryPointerListeners,
    setLevelEditorTransformGesture,
    clearFpClickCandidate,
    fpSelectionOutline,
    syncTransformAttachment,
    session,
    loading,
    runExclusiveTeardown,
    rigAnchor,
    maybeSyncFpGizmoFromStore,
    clearFpGizmoAttachKey,
    frameOrbitOnFpViewmodel,
  } = opts;

  function frameMountIntoGameplayView(): void {
    const pres = session.current?.getPresenter();
    const cam = session.current?.getGameplayCamera();
    if (!pres || !cam) return;
    pres.snapRigRootToAuthoringDefaults();
    if (!pres.frameWeaponMountIntoGameplayCamera(scene, cam)) {
      useEditorStore
        .getState()
        .showFpAuthorToast(
          "Could not align mount to gameplay camera (mesh not ready).",
          6500,
        );
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

  function disposeFpViewmodelRuntimeOnly(): void {
    runExclusiveTeardown(() => {
      setLevelEditorTransformGesture(false);
      transformControls.enabled = true;
      rewireCanvasPrimaryPointerListeners();
      resetWeaponPresentationEditorSyncStateForTeardown();
      rigAnchor.dispose();
      registerFpViewmodelAuthoringBridge(null);
      registerWeaponPresentationPostSaveApply(null);
      clearFpGizmoAttachKey();
      clearFpClickCandidate();
      fpSelectionOutline.setFromObject(null);
      withProgrammaticTransformControls(() => transformControls.detach());
      session.current?.dispose();
      session.current = null;
      loading.current = false;
      useEditorStore.getState().setFpAuthorPickList([]);
    });
  }

  function ensureFpSession(): void {
    if (session.current || loading.current) return;
    loading.current = true;
    const requestedWeaponId = useEditorStore.getState().fpAuthorWeaponId;
    useEditorStore.getState().setFpAuthorInitMessage("Loading FP viewmodels…");
    void FpViewmodelEditorSession.create(scene, requestedWeaponId)
      .then((s) => {
        loading.current = false;
        const store = useEditorStore.getState();
        if (
          !isWeaponFpAuthoringState(store) ||
          store.fpAuthorWeaponId !== requestedWeaponId
        ) {
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
        session.current = s;
        useEditorStore.getState().setFpAuthorInitMessage(null);
        useEditorStore.getState().bumpFpAuthorLive();
        registerWeaponPresentationPostSaveApply((weaponId, json) => {
          const pres = session.current?.getPresenter();
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
            const pres = session.current?.getPresenter();
            if (!pres) return;
            adoptWeaponPresentationFileText(pres, wid, text);
            maybeSyncFpGizmoFromStore();
          } catch {
            /* ignore */
          }
        })();
        registerFpViewmodelAuthoringBridge({
          getPicks: () =>
            session.current?.getPresenter()?.getAuthoringPickList() ?? [],
          getPresenter: () => session.current?.getPresenter(),
          frameOrbitOnViewmodel: frameOrbitOnFpViewmodel,
          frameMountIntoGameplayView,
        });
        contentRoot.visible = false;
        grid.visible = false;
        const presReady = session.current.getPresenter();
        if (presReady) rigAnchor.attach(presReady);
        frameOrbitOnFpViewmodel();
        syncTransformAttachment();
      })
      .catch((e) => {
        loading.current = false;
        const store = useEditorStore.getState();
        if (
          !isWeaponFpAuthoringState(store) ||
          store.fpAuthorWeaponId !== requestedWeaponId
        ) {
          if (isWeaponFpAuthoringState(store)) ensureFpSession();
          return;
        }
        useEditorStore
          .getState()
          .setFpAuthorInitMessage(e instanceof Error ? e.message : String(e));
      });
  }

  return {
    ensureFpSession,
    disposeFpViewmodelRuntimeOnly,
    frameMountIntoGameplayView,
  };
}

import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { useEditorStore } from "../../state/editorStore.js";
import { FpConsumableEditorSession } from "../fpAuthoring/fpConsumableEditorSession.js";
import {
  registerFpViewmodelAuthoringBridge,
} from "../fpAuthoring/fpViewmodelAuthoringBridge.js";
import { registerFpConsumableAuthoringBridge } from "../fpAuthoring/fpConsumableAuthoringBridge.js";
import { isConsumableFpAuthoringState } from "./editorStoreModeGuards.js";

type ConsumableFpSessionRef = {
  current: FpConsumableEditorSession | null;
};

type ConsumableFpLoadingRef = { current: boolean };

export function createConsumableFpAuthoringSessionActions(opts: {
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
  session: ConsumableFpSessionRef;
  loading: ConsumableFpLoadingRef;
  runExclusiveTeardown: (fn: () => void) => void;
  clearFpGizmoAttachKey: () => void;
  frameOrbitOnActiveFpSession: () => void;
}): {
  ensureFpConsumableSession: () => void;
  disposeFpConsumableRuntimeOnly: () => void;
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
    clearFpGizmoAttachKey,
    frameOrbitOnActiveFpSession,
  } = opts;

  function disposeFpConsumableRuntimeOnly(): void {
    runExclusiveTeardown(() => {
      setLevelEditorTransformGesture(false);
      transformControls.enabled = true;
      rewireCanvasPrimaryPointerListeners();
      registerFpConsumableAuthoringBridge(null);
      registerFpViewmodelAuthoringBridge(null);
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

  function ensureFpConsumableSession(): void {
    if (session.current || loading.current) return;
    loading.current = true;
    const requestedConsumableId =
      useEditorStore.getState().fpAuthorConsumableId;
    useEditorStore.getState().setFpAuthorInitMessage("Loading FP consumable…");
    void FpConsumableEditorSession.create(scene, requestedConsumableId)
      .then((s) => {
        loading.current = false;
        const store = useEditorStore.getState();
        if (
          !isConsumableFpAuthoringState(store) ||
          store.fpAuthorConsumableId !== requestedConsumableId
        ) {
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
        session.current = s;
        useEditorStore.getState().setFpAuthorInitMessage(null);
        useEditorStore.getState().bumpFpAuthorLive();

        void (async () => {
          try {
            const r = await fetch(
              `/content/consumables/${requestedConsumableId}.presentation.json`,
              { cache: "no-store" },
            );
            if (!r.ok) return;
            const doc = JSON.parse(await r.text()) as {
              firstPerson?: { mount?: unknown };
            };
            const mount = doc?.firstPerson?.mount;
            if (mount && typeof mount === "object") {
              session.current?.applyMount(
                mount as Parameters<FpConsumableEditorSession["applyMount"]>[0],
              );
            }
          } catch {
            /* ignore — session starts at default position */
          }
        })();

        registerFpConsumableAuthoringBridge({
          getSession: () => session.current,
        });
        registerFpViewmodelAuthoringBridge({
          getPicks: () => session.current?.getPickList() ?? [],
          frameOrbitOnViewmodel: frameOrbitOnActiveFpSession,
        });
        contentRoot.visible = false;
        grid.visible = false;
        frameOrbitOnActiveFpSession();
        syncTransformAttachment();
      })
      .catch((e) => {
        loading.current = false;
        const store = useEditorStore.getState();
        if (
          !isConsumableFpAuthoringState(store) ||
          store.fpAuthorConsumableId !== requestedConsumableId
        ) {
          if (isConsumableFpAuthoringState(store)) ensureFpConsumableSession();
          return;
        }
        useEditorStore
          .getState()
          .setFpAuthorInitMessage(e instanceof Error ? e.message : String(e));
      });
  }

  return {
    ensureFpConsumableSession,
    disposeFpConsumableRuntimeOnly,
  };
}

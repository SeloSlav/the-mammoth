import * as THREE from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { useEditorStore } from "../../state/editorStore.js";
import { objectLivesUnderScene } from "../scene/sceneGraphUtils.js";
import type { FpConsumableEditorSession } from "../fpAuthoring/fpConsumableEditorSession.js";
import type { FpViewmodelEditorSession } from "../fpAuthoring/fpViewmodelEditorSession.js";
import {
  isConsumableFpAuthoringState,
  isWeaponFpAuthoringState,
} from "./editorStoreModeGuards.js";

export function createFpAuthoringTransformGizmoAttachment(deps: {
  scene: THREE.Scene;
  transformControls: TransformControls;
  withProgrammaticTransformControls: <T>(fn: () => T) => T;
  getFpSession: () => FpViewmodelEditorSession | null;
  getFpConsumableSession: () => FpConsumableEditorSession | null;
}): {
  syncFpTransformAttachment: () => void;
  maybeSyncFpGizmoFromStore: () => void;
  clearFpGizmoAttachKey: () => void;
} {
  const {
    scene,
    transformControls,
    withProgrammaticTransformControls,
    getFpSession,
    getFpConsumableSession,
  } = deps;

  let lastFpGizmoAttachKey = "";

  function clearFpGizmoAttachKey(): void {
    lastFpGizmoAttachKey = "";
  }

  function syncFpTransformAttachment(): void {
    withProgrammaticTransformControls(() => {
      const s = useEditorStore.getState();
      const picks = isWeaponFpAuthoringState(s)
        ? (getFpSession()?.getPresenter()?.getAuthoringPickList() ?? [])
        : isConsumableFpAuthoringState(s)
          ? (getFpConsumableSession()?.getPickList() ?? [])
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
        transformControls.setSpace("world");
        transformControls.setSize(
          s.fpAuthorCamera === "gameplay" ? 0.62 : 2.25,
        );
        const snap = s.gridSnapM;
        transformControls.setTranslationSnap(snap > 0 ? snap : null);
        transformControls.setRotationSnap(
          snap > 0 ? THREE.MathUtils.degToRad(15) : null,
        );
        transformControls.setScaleSnap(snap > 0 ? snap : null);
        lastFpGizmoAttachKey = `${s.fpAuthorTargetId}\0${s.transformMode}\0${s.gridSnapM}\0${s.fpAuthorCamera}`;
      } else {
        lastFpGizmoAttachKey = "";
        transformControls.enabled = true;
      }
    });
  }

  /** Re-attach gizmo when store-driven target/mode/snap changed (runs from RAF; avoids missed zustand subscribe edges). */
  function maybeSyncFpGizmoFromStore(): void {
    const s = useEditorStore.getState();
    const hasFpPicks =
      (isWeaponFpAuthoringState(s) && getFpSession()?.getPresenter() != null) ||
      (isConsumableFpAuthoringState(s) && getFpConsumableSession()?.isReady());
    if (!hasFpPicks) {
      lastFpGizmoAttachKey = "";
      return;
    }
    const key = `${s.fpAuthorTargetId}\0${s.transformMode}\0${s.gridSnapM}\0${s.fpAuthorCamera}`;
    if (key === lastFpGizmoAttachKey) return;
    syncFpTransformAttachment();
  }

  return {
    syncFpTransformAttachment,
    maybeSyncFpGizmoFromStore,
    clearFpGizmoAttachKey,
  };
}

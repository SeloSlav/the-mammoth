import * as THREE from "three";
import { MOUSE } from "three";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { FpConsumableEditorSession } from "../fpAuthoring/fpConsumableEditorSession.js";
import type { FpViewmodelEditorSession } from "../fpAuthoring/fpViewmodelEditorSession.js";
import type { EditorStructuralState } from "./editorSceneStructuralRebuild.js";
import { createEditorFpDefaultRigAnchorLines } from "./editorSceneFpAuthoringRigAnchor.js";
import { createFrameOrbitOnActiveFpSession } from "./editorSceneFpAuthoringFrameOrbit.js";
import { createFpAuthoringTransformGizmoAttachment } from "./editorSceneFpAuthoringGizmoAttachment.js";
import { createWeaponFpAuthoringSessionActions } from "./editorSceneFpWeaponAuthoringSession.js";
import { createConsumableFpAuthoringSessionActions } from "./editorSceneFpConsumableAuthoringSession.js";

export type EditorFpAuthoringLifecycle = ReturnType<
  typeof createEditorFpAuthoringLifecycle
>;

export function createEditorFpAuthoringLifecycle(deps: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbitControls: OrbitControls;
  contentRoot: THREE.Group;
  grid: THREE.GridHelper;
  transformControls: TransformControls;
  withProgrammaticTransformControls: <T>(fn: () => T) => T;
  rewireCanvasPrimaryPointerListeners: () => void;
  setLevelEditorTransformGesture: (v: boolean) => void;
  clearFpClickCandidate: () => void;
  fpSelectionOutline: { setFromObject: (o: THREE.Object3D | null) => void };
  syncTransformAttachment: () => void;
  structuralState: EditorStructuralState;
}) {
  const {
    scene,
    camera,
    orbitControls,
    contentRoot,
    grid,
    transformControls,
    withProgrammaticTransformControls,
    rewireCanvasPrimaryPointerListeners,
    setLevelEditorTransformGesture,
    clearFpClickCandidate,
    fpSelectionOutline,
    syncTransformAttachment,
    structuralState,
  } = deps;

  const weaponSession: { current: FpViewmodelEditorSession | null } = {
    current: null,
  };
  const weaponLoading = { current: false };
  const consumableSession: { current: FpConsumableEditorSession | null } = {
    current: null,
  };
  const consumableLoading = { current: false };

  let fpTeardownInProgress = false;
  function runExclusiveTeardown(fn: () => void): void {
    if (fpTeardownInProgress) return;
    fpTeardownInProgress = true;
    try {
      fn();
    } finally {
      fpTeardownInProgress = false;
    }
  }

  const rigAnchor = createEditorFpDefaultRigAnchorLines();

  const frameOrbitOnActiveFpSession = createFrameOrbitOnActiveFpSession({
    scene,
    camera,
    orbitControls,
    getFpSession: () => weaponSession.current,
    getFpConsumableSession: () => consumableSession.current,
  });

  /** Kept for compatibility with existing weapon authoring bridge registration. */
  const frameOrbitOnFpViewmodel = frameOrbitOnActiveFpSession;

  const gizmo = createFpAuthoringTransformGizmoAttachment({
    scene,
    transformControls,
    withProgrammaticTransformControls,
    getFpSession: () => weaponSession.current,
    getFpConsumableSession: () => consumableSession.current,
  });

  const weapon = createWeaponFpAuthoringSessionActions({
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
    session: weaponSession,
    loading: weaponLoading,
    runExclusiveTeardown,
    rigAnchor,
    maybeSyncFpGizmoFromStore: gizmo.maybeSyncFpGizmoFromStore,
    clearFpGizmoAttachKey: gizmo.clearFpGizmoAttachKey,
    frameOrbitOnFpViewmodel,
  });

  const consumable = createConsumableFpAuthoringSessionActions({
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
    session: consumableSession,
    loading: consumableLoading,
    runExclusiveTeardown,
    clearFpGizmoAttachKey: gizmo.clearFpGizmoAttachKey,
    frameOrbitOnActiveFpSession,
  });

  function teardownFpSession(): void {
    weapon.disposeFpViewmodelRuntimeOnly();
    consumable.disposeFpConsumableRuntimeOnly();
    contentRoot.visible = true;
    grid.visible = true;
    structuralState.shouldFrameAfterRebuild = true;
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

  return {
    ensureFpSession: weapon.ensureFpSession,
    ensureFpConsumableSession: consumable.ensureFpConsumableSession,
    disposeFpViewmodelRuntimeOnly: weapon.disposeFpViewmodelRuntimeOnly,
    disposeFpConsumableRuntimeOnly: consumable.disposeFpConsumableRuntimeOnly,
    teardownFpSession,
    syncFpTransformAttachment: gizmo.syncFpTransformAttachment,
    maybeSyncFpGizmoFromStore: gizmo.maybeSyncFpGizmoFromStore,
    frameOrbitOnActiveFpSession,
    frameOrbitOnFpViewmodel,
    frameMountIntoGameplayView: weapon.frameMountIntoGameplayView,
    getFpSession: () => weaponSession.current,
    getFpConsumableSession: () => consumableSession.current,
    get fpSessionLoading() {
      return weaponLoading.current;
    },
    get fpConsumableSessionLoading() {
      return consumableLoading.current;
    },
    get fpTeardownInProgress() {
      return fpTeardownInProgress;
    },
  };
}

import * as THREE from "three";
import { MOUSE } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { rebuildStairWellPreviewRoot } from "@the-mammoth/world";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "@the-mammoth/engine";
import {
  resyncEditorMyApartmentDecorShadows,
  resyncEditorMyApartmentPracticalLights,
  applyEditorMyApartmentLayoutHiddenPlacements,
} from "../myApartment/editorMyApartmentPieceGroupBridge.js";
import { useEditorStore } from "../../state/editorStore.js";
import { demandEditorSceneRender } from "./editorSceneRenderDemand.js";
import type { EditorStructuralState } from "./editorSceneStructuralRebuild.js";
import type { EditorFpAuthoringLifecycle } from "./editorSceneFpAuthoringLifecycle.js";
import {
  isConsumableFpAuthoringState,
  isFpMode,
  isWeaponFpAuthoringState,
  type EditorStoreSnapshot,
} from "./editorStoreModeGuards.js";

export function subscribeEditorSceneStore(deps: {
  structuralState: EditorStructuralState;
  rebuildStructural: () => void;
  syncTransformsFromStore: () => void;
  getBuildingRoot: () => THREE.Group | null;
  transformControls: TransformControls;
  getLevelEditorTransformGesture: () => boolean;
  setLevelEditorTransformGesture: (v: boolean) => void;
  orbitControls: OrbitControls;
  applyFpOrbitMouseButtons: () => void;
  applyLevelEditorMouseButtons: (st: EditorStoreSnapshot) => void;
  renderer: THREE.WebGPURenderer;
  dir: THREE.DirectionalLight;
  scene: THREE.Scene;
  applyEnvironment: (st: EditorStoreSnapshot) => void;
  shouldShowEditorGrid: (st: EditorStoreSnapshot) => boolean;
  fp: EditorFpAuthoringLifecycle;
  contentRoot: THREE.Object3D;
  grid: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  syncTransformAttachment: () => void;
}): () => void {
  const {
    structuralState,
    rebuildStructural,
    syncTransformsFromStore,
    getBuildingRoot,
    transformControls,
    getLevelEditorTransformGesture,
    setLevelEditorTransformGesture,
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
  } = deps;

  let editorStoreSyncDepth = 0;
  let prev = useEditorStore.getState();

  return useEditorStore.subscribe((s) => {
    editorStoreSyncDepth++;
    try {
      if (s.mode !== prev.mode && !isFpMode(s.mode)) {
        structuralState.shouldFrameAfterRebuild = true;
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
          ((hadWeapon && s.fpAuthorWeaponId !== prev.fpAuthorWeaponId) ||
            hadConsumable) &&
          (fp.getFpSession() || fp.fpSessionLoading)
        ) {
          fp.disposeFpViewmodelRuntimeOnly();
        }
        if (
          hadConsumable &&
          (fp.getFpConsumableSession() || fp.fpConsumableSessionLoading)
        ) {
          fp.disposeFpConsumableRuntimeOnly();
        }
        fp.ensureFpSession();
        if (fp.getFpSession()?.getPresenter()) {
          contentRoot.visible = false;
          grid.visible = false;
        }
      } else if (hadWeapon && !wantsConsumable && !fp.fpTeardownInProgress) {
        fp.disposeFpViewmodelRuntimeOnly();
        if (!isFpMode(s.mode)) {
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
      }

      if (wantsConsumable) {
        if (
          editorStoreSyncDepth === 1 &&
          ((hadConsumable &&
            s.fpAuthorConsumableId !== prev.fpAuthorConsumableId) ||
            hadWeapon) &&
          (fp.getFpConsumableSession() || fp.fpConsumableSessionLoading)
        ) {
          fp.disposeFpConsumableRuntimeOnly();
        }
        if (hadWeapon && (fp.getFpSession() || fp.fpSessionLoading)) {
          fp.disposeFpViewmodelRuntimeOnly();
        }
        fp.ensureFpConsumableSession();
        if (fp.getFpConsumableSession()?.isReady()) {
          contentRoot.visible = false;
          grid.visible = false;
        }
      } else if (hadConsumable && !wantsWeapon && !fp.fpTeardownInProgress) {
        fp.disposeFpConsumableRuntimeOnly();
        if (!isFpMode(s.mode)) {
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
      }

      if (!isFpMode(s.mode)) {
        if (isFpMode(prev.mode)) {
          setLevelEditorTransformGesture(false);
          transformControls.enabled = true;
        }
        if (s.contentStructureEpoch !== prev.contentStructureEpoch) {
          rebuildStructural();
          demandEditorSceneRender();
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
            !getLevelEditorTransformGesture()
          ) {
            const stairOpeningChanged =
              s.mode === "stairwell_preview" &&
              (JSON.stringify(s.stairWellDef.entryOpening) !==
                JSON.stringify(prev.stairWellDef.entryOpening) ||
                JSON.stringify(s.stairWellDef.groundEntryOpening) !==
                  JSON.stringify(prev.stairWellDef.groundEntryOpening) ||
                JSON.stringify(s.stairWellDef.secondaryEntryOpening) !==
                  JSON.stringify(prev.stairWellDef.secondaryEntryOpening));
            const stairPreviewRoot = getBuildingRoot()?.getObjectByName(
              "editor_stair_well_preview",
            );
            if (
              stairOpeningChanged &&
              stairPreviewRoot instanceof THREE.Group
            ) {
              rebuildStairWellPreviewRoot(stairPreviewRoot, s.stairWellDef);
            }
            syncTransformsFromStore();
            demandEditorSceneRender();
          }
        }
      }

      const tcFp =
        isFpMode(s.mode) &&
        (wantsWeapon
          ? Boolean(fp.getFpSession()?.getPresenter())
          : wantsConsumable
            ? fp.getFpConsumableSession()?.isReady() === true
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
          s.myApartmentMultiselectExtraIds !== prev.myApartmentMultiselectExtraIds ||
          s.myApartmentLayoutTransformArmed !== prev.myApartmentLayoutTransformArmed ||
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
        tcLevel && !transformControls.dragging && !getLevelEditorTransformGesture();
      if (tcFp || shouldSyncLevelAttachment) {
        syncTransformAttachment();
        demandEditorSceneRender();
      }

      /**
       * While dragging the level-editor gizmo, Orbit must stay off — it uses the primary
       * button and would steal pointer capture from {@link TransformControls}.
       */
      const gizmoDragging = transformControls.dragging === true;
      const wantOrbit =
        (isFpMode(s.mode) && s.fpAuthorCamera === "orbit") || !isFpMode(s.mode);
      orbitControls.enabled = !gizmoDragging && wantOrbit;
      if (isFpMode(s.mode) && s.fpAuthorCamera === "orbit") {
        applyFpOrbitMouseButtons();
      } else {
        applyLevelEditorMouseButtons(s);
        camera.up.set(0, 1, 0);
      }

      if (
        s.apartmentBakedFloorShadowsEnabled !== prev.apartmentBakedFloorShadowsEnabled &&
        s.mode === "my_apartment_layout"
      ) {
        resyncEditorMyApartmentDecorShadows();
      }
      if (
        s.apartmentPracticalLightsEnabled !== prev.apartmentPracticalLightsEnabled &&
        s.mode === "my_apartment_layout"
      ) {
        const shellRoot = getBuildingRoot();
        if (shellRoot) resyncEditorMyApartmentPracticalLights(shellRoot);
      }
      if (
        s.mode === "my_apartment_layout" &&
        (s.myApartmentLayoutHiddenPlacementIds !== prev.myApartmentLayoutHiddenPlacementIds ||
          s.mode !== prev.mode)
      ) {
        applyEditorMyApartmentLayoutHiddenPlacements(
          new Set(s.myApartmentLayoutHiddenPlacementIds),
        );
      }
      if (s.shadowsEnabled !== prev.shadowsEnabled) {
        const apartmentDecorShadows =
          s.mode === "my_apartment_layout" &&
          APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow.enabled;
        renderer.shadowMap.enabled = s.shadowsEnabled || apartmentDecorShadows;
        dir.castShadow = s.shadowsEnabled && !apartmentDecorShadows;
        if (!apartmentDecorShadows) {
          scene.traverse((o) => {
            if (o instanceof THREE.Mesh) o.castShadow = s.shadowsEnabled;
          });
        }
      }
      if (
        s.useHdriEnvironment !== prev.useHdriEnvironment ||
        s.mode !== prev.mode ||
        s.workspace !== prev.workspace
      ) {
        applyEnvironment(s);
        grid.visible = shouldShowEditorGrid(s);
        demandEditorSceneRender();
      }
      if (
        s.contentStructureEpoch !== prev.contentStructureEpoch ||
        s.shadowsEnabled !== prev.shadowsEnabled ||
        s.apartmentBakedFloorShadowsEnabled !== prev.apartmentBakedFloorShadowsEnabled ||
        s.apartmentPracticalLightsEnabled !== prev.apartmentPracticalLightsEnabled ||
        s.myApartmentLayoutHiddenPlacementIds !== prev.myApartmentLayoutHiddenPlacementIds
      ) {
        demandEditorSceneRender();
      }
      prev = s;
    } finally {
      editorStoreSyncDepth--;
    }
  });
}

import * as THREE from "three";
import { useEditorStore } from "../../state/editorStore.js";
import {
  disposeSubtreeGpuAssets,
} from "../scene/disposeSubtree.js";
import { emptyFloorDoc } from "../placement/editorEmptyFloorDoc.js";
import { buildEditorStructuralRoot } from "../content/editorBuildingContentMount.js";
import { syncEditorTransformsFromStore } from "./editorSceneSyncTransformsFromStore.js";
import { isFpMode } from "./editorStoreModeGuards.js";
import type { EditorStoreSnapshot } from "./editorStoreModeGuards.js";
import { registerEditorMyApartmentUnitStatsRoot } from "../myApartment/editorMyApartmentPieceGroupBridge.js";

export type EditorStructuralState = {
  buildingRoot: THREE.Group | null;
  lastBuiltContentEpoch: number;
  shouldFrameAfterRebuild: boolean;
};

export function rebuildEditorStructuralIfNeeded(
  state: EditorStructuralState,
  deps: {
    contentRoot: THREE.Group;
    textureLoader: THREE.TextureLoader;
    syncTransformAttachment: () => void;
    frameFocusedStoryObject: () => void;
    frameObject: (o: THREE.Object3D | null) => void;
    frameApartmentGameplayPreview?: (shellRoot: THREE.Object3D) => void;
  },
): void {
  const s = useEditorStore.getState();
  if (isFpMode(s.mode)) return;
  const ep = s.contentStructureEpoch;
  if (ep === state.lastBuiltContentEpoch) return;
  state.lastBuiltContentEpoch = ep;

  if (state.buildingRoot) {
    deps.contentRoot.remove(state.buildingRoot);
    disposeSubtreeGpuAssets(state.buildingRoot);
    state.buildingRoot = null;
    registerEditorMyApartmentUnitStatsRoot(null);
  }

  state.buildingRoot = buildEditorStructuralRoot({
    mode: s.mode,
    workspace: s.workspace,
    ownedApartmentBuiltins: s.ownedApartmentBuiltins,
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
    myApartmentPreviewUnitId: s.myApartmentPreviewUnitId,
    myApartmentAuthoringTarget: s.myApartmentAuthoringTarget,
    myApartmentCorridorLevelIndex: s.myApartmentCorridorLevelIndex,
    textureLoader: deps.textureLoader,
    emptyFloorDoc,
  });

  deps.contentRoot.add(state.buildingRoot);
  registerEditorMyApartmentUnitStatsRoot(
    s.mode === "my_apartment_layout" ? state.buildingRoot : null,
  );
  syncEditorTransformsFromStore(state.buildingRoot, s);
  deps.syncTransformAttachment();
  if (state.shouldFrameAfterRebuild) {
    state.shouldFrameAfterRebuild = false;
    if (s.mode === "my_apartment_layout") {
      if (deps.frameApartmentGameplayPreview) {
        deps.frameApartmentGameplayPreview(state.buildingRoot);
      } else {
        deps.frameObject(state.buildingRoot);
      }
    } else if (s.mode === "floor" || s.mode === "floor_override") {
      deps.frameFocusedStoryObject();
    } else {
      deps.frameObject(state.buildingRoot);
    }
  }
}

export function disposeEditorStructuralRoot(
  state: EditorStructuralState,
  contentRoot: THREE.Group,
): void {
  if (!state.buildingRoot) return;
  contentRoot.remove(state.buildingRoot);
  disposeSubtreeGpuAssets(state.buildingRoot);
  state.buildingRoot = null;
  registerEditorMyApartmentUnitStatsRoot(null);
}

export function syncEditorPlacementTransformsFromStore(
  state: Pick<EditorStructuralState, "buildingRoot">,
  s: EditorStoreSnapshot,
): void {
  if (!state.buildingRoot) return;
  syncEditorTransformsFromStore(state.buildingRoot, s);
}

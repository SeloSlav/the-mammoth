import * as THREE from "three";
import { useEditorStore } from "../../state/editorStore.js";
import {
  disposeSubtreeGpuAssets,
} from "../scene/disposeSubtree.js";
import { emptyFloorDoc } from "../placement/editorEmptyFloorDoc.js";
import {
  buildEditorStructuralRoot,
  buildStairwellEditorPreviewGroup,
  type BuildEditorStructuralRootArgs,
} from "../content/editorBuildingContentMount.js";
import { syncEditorTransformsFromStore } from "./editorSceneSyncTransformsFromStore.js";
import { isFpMode } from "./editorStoreModeGuards.js";
import type { EditorStoreSnapshot } from "./editorStoreModeGuards.js";
import { registerEditorMyApartmentUnitStatsRoot } from "../myApartment/editorMyApartmentPieceGroupBridge.js";

export type EditorStructuralState = {
  buildingRoot: THREE.Group | null;
  lastBuiltContentEpoch: number;
  shouldFrameAfterRebuild: boolean;
};

function disposeSubtreeGpuAssetsAfterSubmittedFrames(root: THREE.Object3D): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      disposeSubtreeGpuAssets(root);
    });
  });
}

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
    disposeSubtreeGpuAssetsAfterSubmittedFrames(state.buildingRoot);
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
    if (s.mode === "my_apartment_layout" || s.mode === "stairwell_preview") {
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

/** Swap typical ↔ ground preview without disposing shared/cached WebGPU resources. */
export function rebuildEditorStairwellScopePreview(
  state: Pick<EditorStructuralState, "buildingRoot">,
  args: Pick<
    BuildEditorStructuralRootArgs,
    "building" | "floorDocs" | "emptyFloorDoc" | "stairWellDef" | "stairWellAuthorScope"
  >,
  deps: {
    syncTransformAttachment: () => void;
  },
): boolean {
  if (!state.buildingRoot) return false;
  const preview = buildStairwellEditorPreviewGroup(args);
  const existing = state.buildingRoot.getObjectByName("editor_stair_well_preview");
  if (existing) {
    state.buildingRoot.remove(existing);
  }
  if (preview) state.buildingRoot.add(preview);
  const s = useEditorStore.getState();
  syncEditorTransformsFromStore(state.buildingRoot, s);
  deps.syncTransformAttachment();
  return preview !== null;
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

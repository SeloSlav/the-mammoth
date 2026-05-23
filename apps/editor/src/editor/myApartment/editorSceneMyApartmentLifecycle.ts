import * as THREE from "three";

import { prepareMammothApartmentInteriorContentRoots, applyApartmentInteriorFloorReceiveShadowUnder, applyApartmentDecorCastShadowFlags } from "@the-mammoth/engine";
import { useEditorStore } from "../../state/editorStore.js";

import {
  loadEditorMyApartmentDecorTemplates,
  listMissingEditorDecorTemplatePaths,
  loadMissingEditorDecorTemplates,

  apartmentUnitBoundsFromAuthoringFractionMapping,
  mountEditorMyApartmentFurnitureUnder,
  syncEditorMyApartmentDecorOnMount,
  syncEditorMyApartmentMirrorsOnMount,
  syncEditorMyApartmentWallsOnMount,
  updateEditorMyApartmentMountFromDoc,

  type EditorMyApartmentFurnitureMount,

  type EditorMyApartmentDecorTemplateMap,

} from "./editorMyApartmentMeshes.js";

import {

  ownedApartmentFractionMappingForEditor,

  resolveOwnedApartmentAuthoringLayoutForEditor,

} from "./editorMyApartmentAuthoringShell.js";

import { TYPICAL_FLOOR_DOC_ID } from "@the-mammoth/world";

import {
  registerEditorMyApartmentDecorShadowResync,
  registerEditorMyApartmentWallsMountSyncRequest,
  setEditorMyApartmentPieceGroups,
  applyEditorMyApartmentLayoutHiddenPlacements,
} from "./editorMyApartmentPieceGroupBridge.js";
import { teardownApartmentSavedObjectGroupManipulator } from "./editorMyApartmentSavedGroupManip.js";

import { listMyApartmentPlacedItemModelRelPaths } from "./editorOwnedApartmentSceneLayout.js";

import {

  classifyApartmentMountSyncChange,
  captureApartmentMountSyncInputs,
  type ApartmentMountSyncInputs,

} from "./editorMyApartmentMountSync.js";
import {
  collectOwnedApartmentWallIdsWithOpeningChanges,
  collectWallIdsNeedingEditorMountSync,
} from "./preserveOwnedApartmentMountPlacementRefs.js";
import { editorMyApartmentSelectedIdForWall } from "./editorMyApartmentSelection.js";
import { pruneMyApartmentLayoutHiddenPlacementIds } from "./editorMyApartmentLayoutVisibility.js";



export type EditorMyApartmentLifecycleDeps = {

  getStructuralRoot: () => THREE.Group | null;

  getShouldHoldReplicaResync: () => boolean;

  syncLightingAttachment: () => void;

  /** Full FP-matched apartment rig (scene lights, PMREM, layers) after shell/decor remount. */
  syncApartmentLayoutPresentation: () => void;

  syncTransformAttachment: () => void;

  requestDecorShadowMapBake: () => void;

};



/**

 * Owned-apartment GLB previews for {@link EditorMode.my_apartment_layout}.

 * Persisted poses live in disk JSON ({@link OwnedApartmentBuiltinsDoc}), not SpaceTime.

 */

export function createEditorSceneMyApartmentLifecycle(

  deps: EditorMyApartmentLifecycleDeps,

): { dispose: () => void; flushDeferredMountSync: () => void; flushPendingWallsVisualSync: () => void } {

  let disposed = false;

  let syncGeneration = 0;

  let mount: EditorMyApartmentFurnitureMount | null = null;

  let decorTemplates: EditorMyApartmentDecorTemplateMap = new Map();

  let prevMountInputs = captureApartmentMountSyncInputs(useEditorStore.getState());
  let pendingWallsVisualSync = false;

  function runWallsMountSyncIfReady(): void {
    if (deps.getShouldHoldReplicaResync()) {
      pendingWallsVisualSync = true;
      return;
    }
    pendingWallsVisualSync = false;
    syncPlacementIncremental("walls-only");
    prevMountInputs = captureApartmentMountSyncInputs(useEditorStore.getState());
  }

  registerEditorMyApartmentWallsMountSyncRequest(runWallsMountSyncIfReady);

  function teardownFurniture(): void {

    mount?.dispose();

    mount = null;

    registerEditorMyApartmentDecorShadowResync(null);

    setEditorMyApartmentPieceGroups(null);

  }

  function setApartmentLayoutLoadingMessage(message: string | null): void {
    useEditorStore.getState().setMyApartmentLayoutLoadingMessage(message);
  }

  function clearApartmentLayoutLoadingIfCurrent(gen: number): void {
    if (gen === syncGeneration && !disposed) {
      setApartmentLayoutLoadingMessage(null);
    }
  }



  async function reconcile(): Promise<void> {

    if (disposed) return;

    if (deps.getShouldHoldReplicaResync()) return;



    const myGen = ++syncGeneration;

    const st = useEditorStore.getState();

    const parent = deps.getStructuralRoot();

    if (st.mode !== "my_apartment_layout" || !parent) {

      setApartmentLayoutLoadingMessage(null);

      teardownFurniture();

      return;

    }



    if (mount && mount.root.parent !== parent) {

      teardownFurniture();

    }

    setApartmentLayoutLoadingMessage("Loading this apartment's lighting and décor…");



    try {

      if (disposed || myGen !== syncGeneration) return;

      const doc = st.ownedApartmentBuiltins;

      decorTemplates = await loadEditorMyApartmentDecorTemplates(

        listMyApartmentPlacedItemModelRelPaths(doc),

      );

      if (disposed || myGen !== syncGeneration) return;

      if (deps.getShouldHoldReplicaResync()) return;



      const layout = resolveOwnedApartmentAuthoringLayoutForEditor({

        floorDoc: st.floorDocs[TYPICAL_FLOOR_DOC_ID],

        building: st.building,

        previewUnitId: st.myApartmentPreviewUnitId,

      });

      const authoringFractionMapping = ownedApartmentFractionMappingForEditor({

        layout,

        builtinsFallbackPreviewM: doc.previewSizeM,

      });
      const unitBounds = apartmentUnitBoundsFromAuthoringFractionMapping(
        authoringFractionMapping,
        layout?.shellPlan.vh ?? 3,
      );

      if (!mount) {

        mount = mountEditorMyApartmentFurnitureUnder(

          parent,

          decorTemplates,

          doc,

          authoringFractionMapping,

          parent,

          unitBounds,

        );

      } else {
        updateEditorMyApartmentMountFromDoc(
          mount,
          decorTemplates,
          doc,
          authoringFractionMapping,
          parent,
          unitBounds,
        );
      }

      if (disposed || myGen !== syncGeneration) return;

      if (deps.getShouldHoldReplicaResync()) return;

      deps.syncApartmentLayoutPresentation();
      if (mount && parent) {
        mount.resyncPracticalLights(parent);
        mount.resyncDecorShadows(unitBounds);
        deps.requestDecorShadowMapBake();
      }

      setEditorMyApartmentPieceGroups(mount.selectionGroups);
      registerEditorMyApartmentDecorShadowResync((bounds) => {
        mount?.resyncDecorShadows(bounds);
      });

      syncLayoutHiddenPlacementsFromStore();
      deps.syncTransformAttachment();
      clearApartmentLayoutLoadingIfCurrent(myGen);

    } catch (err) {
      console.error("[editor my apartment] reconcile failed", err);
      clearApartmentLayoutLoadingIfCurrent(myGen);
    }

  }



  function syncLayoutHiddenPlacementsFromStore(): void {
    const st = useEditorStore.getState();
    if (st.mode !== "my_apartment_layout" || !mount) return;
    const knownIds = new Set(Object.keys(mount.selectionGroups));
    const pruned = pruneMyApartmentLayoutHiddenPlacementIds(
      st.myApartmentLayoutHiddenPlacementIds,
      knownIds,
    );
    if (pruned !== st.myApartmentLayoutHiddenPlacementIds) {
      useEditorStore.setState({ myApartmentLayoutHiddenPlacementIds: pruned });
    }
    applyEditorMyApartmentLayoutHiddenPlacements(new Set(pruned));
  }

  function resyncMountPresentationAfterMeshEdit(
    shellRoot: THREE.Object3D,
    authoringFractionMapping: ReturnType<typeof ownedApartmentFractionMappingForEditor>,
    layout: ReturnType<typeof resolveOwnedApartmentAuthoringLayoutForEditor>,
  ): void {
    if (!mount) return;
    prepareMammothApartmentInteriorContentRoots({ shellRoot, decorRoot: mount.root });
    applyApartmentInteriorFloorReceiveShadowUnder(shellRoot);
    for (const group of Object.values(mount.selectionGroups)) {
      const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
      if (typeof modelRelPath !== "string") continue;
      applyApartmentDecorCastShadowFlags(group, modelRelPath);
    }
    const unitBounds = apartmentUnitBoundsFromAuthoringFractionMapping(
      authoringFractionMapping,
      layout?.shellPlan.vh ?? 3,
    );
    mount.resyncPracticalLights(shellRoot);
    mount.resyncDecorShadows(unitBounds);
    deps.requestDecorShadowMapBake();
    deps.syncApartmentLayoutPresentation();
    syncLayoutHiddenPlacementsFromStore();
  }

  async function syncPlacementIncrementalAsync(
    kind: "decor-only" | "walls-only" | "mirrors-only",
  ): Promise<void> {
    const parent = deps.getStructuralRoot();
    if (!parent || !mount) {
      void reconcile();
      return;
    }
    /** Members may still be parented under the centroid manipulator — `place*Group` assumes furniture root. */
    teardownApartmentSavedObjectGroupManipulator();
    const st = useEditorStore.getState();
    const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
      floorDoc: st.floorDocs[TYPICAL_FLOOR_DOC_ID],
      building: st.building,
      previewUnitId: st.myApartmentPreviewUnitId,
    });
    const authoringFractionMapping = ownedApartmentFractionMappingForEditor({
      layout,
      builtinsFallbackPreviewM: st.ownedApartmentBuiltins.previewSizeM,
    });
    const doc = st.ownedApartmentBuiltins;
    if (kind === "decor-only") {
      const missing = listMissingEditorDecorTemplatePaths(doc, decorTemplates);
      if (missing.length > 0) {
        await loadMissingEditorDecorTemplates(decorTemplates, missing);
      }
      if (disposed || deps.getShouldHoldReplicaResync()) return;
      syncEditorMyApartmentDecorOnMount(
        mount,
        decorTemplates,
        doc,
        authoringFractionMapping,
      );
    } else if (kind === "walls-only") {
      if (disposed || deps.getShouldHoldReplicaResync()) return;
      const mountedWallKeys = new Set<string>();
      for (const wall of doc.wallItems) {
        const selId = editorMyApartmentSelectedIdForWall(wall.id);
        if (mount.selectionGroups[selId]) mountedWallKeys.add(selId);
      }
      const changedWallIds = collectWallIdsNeedingEditorMountSync(
        prevMountInputs.wallItems,
        doc.wallItems,
        mountedWallKeys,
      );
      for (const wallId of collectOwnedApartmentWallIdsWithOpeningChanges(
        prevMountInputs.wallItems,
        doc.wallItems,
      )) {
        changedWallIds.add(wallId);
      }
      syncEditorMyApartmentWallsOnMount(mount, doc, authoringFractionMapping, {
        onlyWallIds: changedWallIds,
        prevWallItems: prevMountInputs.wallItems,
      });
    } else {
      if (disposed || deps.getShouldHoldReplicaResync()) return;
      syncEditorMyApartmentMirrorsOnMount(mount, doc, authoringFractionMapping);
    }
    if (disposed || deps.getShouldHoldReplicaResync()) return;
    resyncMountPresentationAfterMeshEdit(parent, authoringFractionMapping, layout);
    setEditorMyApartmentPieceGroups(mount.selectionGroups);
    deps.syncTransformAttachment();
  }

  function syncPlacementIncremental(kind: "decor-only" | "walls-only" | "mirrors-only"): void {
    void syncPlacementIncrementalAsync(kind);
  }

  function onStoreChange(nextMountInputs: ApartmentMountSyncInputs): void {
    const kind = classifyApartmentMountSyncChange(prevMountInputs, nextMountInputs);
    if (kind === "none") return;
    if (kind === "decor-only" || kind === "walls-only" || kind === "mirrors-only") {
      /** Gizmo drags patch the store every frame — rebuilding meshes mid-gesture resets pose. */
      if (deps.getShouldHoldReplicaResync()) return;
      prevMountInputs = nextMountInputs;
      syncPlacementIncremental(kind);
      return;
    }
    prevMountInputs = nextMountInputs;
    if (deps.getShouldHoldReplicaResync()) return;
    void reconcile();
  }

  /** Reconcile store → meshes after a held gizmo gesture (commit landed while dragging was still true). */
  function flushDeferredMountSync(): void {
    if (!mount && useEditorStore.getState().mode === "my_apartment_layout") {
      void reconcile();
      prevMountInputs = captureApartmentMountSyncInputs(useEditorStore.getState());
      return;
    }
    onStoreChange(captureApartmentMountSyncInputs(useEditorStore.getState()));
  }

  function flushPendingWallsVisualSync(): void {
    if (!pendingWallsVisualSync) return;
    runWallsMountSyncIfReady();
  }



  const unsubStore = useEditorStore.subscribe((s) => {

    onStoreChange(captureApartmentMountSyncInputs(s));

  });



  void reconcile();



  return {

    flushDeferredMountSync,

    flushPendingWallsVisualSync,

    dispose: () => {

      disposed = true;

      setApartmentLayoutLoadingMessage(null);

      registerEditorMyApartmentWallsMountSyncRequest(null);

      unsubStore();

      teardownFurniture();

    },

  };

}



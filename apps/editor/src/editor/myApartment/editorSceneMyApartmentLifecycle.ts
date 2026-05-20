import * as THREE from "three";

import { useEditorStore } from "../../state/editorStore.js";

import {

  loadEditorMyApartmentDecorTemplates,

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
  registerEditorMyApartmentWallsMountSyncRequest,
  setEditorMyApartmentPieceGroups,
} from "./editorMyApartmentPieceGroupBridge.js";

import { listMyApartmentPlacedItemModelRelPaths } from "./editorOwnedApartmentSceneLayout.js";

import {

  classifyApartmentMountSyncChange,
  captureApartmentMountSyncInputs,
  type ApartmentMountSyncInputs,

} from "./editorMyApartmentMountSync.js";
import { collectChangedOwnedApartmentWallIds } from "./preserveOwnedApartmentMountPlacementRefs.js";



export type EditorMyApartmentLifecycleDeps = {

  getStructuralRoot: () => THREE.Group | null;

  getShouldHoldReplicaResync: () => boolean;

  syncLightingAttachment: () => void;

  syncTransformAttachment: () => void;

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
    prevMountInputs = captureApartmentMountSyncInputs(useEditorStore.getState());
    syncPlacementIncremental("walls-only");
  }

  registerEditorMyApartmentWallsMountSyncRequest(runWallsMountSyncIfReady);

  function teardownFurniture(): void {

    mount?.dispose();

    mount = null;

    setEditorMyApartmentPieceGroups(null);

  }



  async function reconcile(): Promise<void> {

    if (disposed) return;

    if (deps.getShouldHoldReplicaResync()) return;



    const myGen = ++syncGeneration;

    const st = useEditorStore.getState();

    const parent = deps.getStructuralRoot();

    if (st.mode !== "my_apartment_layout" || !parent) {

      teardownFurniture();

      return;

    }



    if (mount && mount.root.parent !== parent) {

      teardownFurniture();

    }



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

      deps.syncLightingAttachment();

      setEditorMyApartmentPieceGroups(mount.selectionGroups);

      deps.syncTransformAttachment();

    } catch {

      teardownFurniture();

    }

  }



  function syncPlacementIncremental(kind: "decor-only" | "walls-only" | "mirrors-only"): void {
    const parent = deps.getStructuralRoot();
    if (!parent || !mount) {
      void reconcile();
      return;
    }
    const st = useEditorStore.getState();
    const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
      floorDoc: st.floorDocs[TYPICAL_FLOOR_DOC_ID],
      building: st.building,
    });
    const authoringFractionMapping = ownedApartmentFractionMappingForEditor({
      layout,
      builtinsFallbackPreviewM: st.ownedApartmentBuiltins.previewSizeM,
    });
    const doc = st.ownedApartmentBuiltins;
    if (kind === "decor-only") {
      syncEditorMyApartmentDecorOnMount(
        mount,
        decorTemplates,
        doc,
        authoringFractionMapping,
      );
    } else if (kind === "walls-only") {
      const changedWallIds = collectChangedOwnedApartmentWallIds(
        prevMountInputs.wallItems,
        doc.wallItems,
      );
      syncEditorMyApartmentWallsOnMount(mount, doc, authoringFractionMapping, {
        onlyWallIds: changedWallIds,
      });
    } else {
      syncEditorMyApartmentMirrorsOnMount(mount, doc, authoringFractionMapping);
    }
    setEditorMyApartmentPieceGroups(mount.selectionGroups);
    deps.syncTransformAttachment();
  }

  function onStoreChange(nextMountInputs: ApartmentMountSyncInputs): void {
    const kind = classifyApartmentMountSyncChange(prevMountInputs, nextMountInputs);
    if (kind === "none") return;
    if (kind === "decor-only" || kind === "walls-only" || kind === "mirrors-only") {
      /** Gizmo drags patch the store every frame — rebuilding meshes mid-gesture resets pose. */
      if (deps.getShouldHoldReplicaResync()) {
        prevMountInputs = nextMountInputs;
        return;
      }
      prevMountInputs = nextMountInputs;
      syncPlacementIncremental(kind);
      return;
    }
    prevMountInputs = nextMountInputs;
    void reconcile();
  }

  /** Reconcile store → meshes after a held gizmo gesture (commit landed while dragging was still true). */
  function flushDeferredMountSync(): void {
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

      registerEditorMyApartmentWallsMountSyncRequest(null);

      unsubStore();

      teardownFurniture();

    },

  };

}



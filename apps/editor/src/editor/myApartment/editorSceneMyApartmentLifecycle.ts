import * as THREE from "three";
import { useEditorStore } from "../../state/editorStore.js";
import {
  loadEditorMyApartmentDecorTemplates,
  mountEditorMyApartmentFurnitureUnder,
  updateEditorMyApartmentMountFromDoc,
  type EditorMyApartmentFurnitureMount,
  type EditorMyApartmentDecorTemplateMap,
} from "./editorMyApartmentMeshes.js";
import {
  ownedApartmentFractionMappingForEditor,
  resolveOwnedApartmentAuthoringLayoutForEditor,
} from "./editorMyApartmentAuthoringShell.js";
import { TYPICAL_FLOOR_DOC_ID } from "@the-mammoth/world";
import { setEditorMyApartmentPieceGroups } from "./editorMyApartmentPieceGroupBridge.js";
import { listMyApartmentPlacedItemModelRelPaths } from "./editorOwnedApartmentSceneLayout.js";

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
): { dispose: () => void } {
  let disposed = false;
  let syncGeneration = 0;
  let mount: EditorMyApartmentFurnitureMount | null = null;
  let decorTemplates: EditorMyApartmentDecorTemplateMap = new Map();

  function teardownFurniture(): void {
    mount?.dispose();
    mount = null;
    setEditorMyApartmentPieceGroups(null);
  }

  async function reconcile(): Promise<void> {
    if (disposed) return;
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
      const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
        floorDoc: st.floorDocs[TYPICAL_FLOOR_DOC_ID],
        building: st.building,
      });
      const authoringFractionMapping = ownedApartmentFractionMappingForEditor({
        layout,
        builtinsFallbackPreviewM: doc.previewSizeM,
      });
      if (!mount) {
        mount = mountEditorMyApartmentFurnitureUnder(
          parent,
          decorTemplates,
          doc,
          authoringFractionMapping,
        );
      } else if (!deps.getShouldHoldReplicaResync()) {
        updateEditorMyApartmentMountFromDoc(
          mount,
          decorTemplates,
          doc,
          authoringFractionMapping,
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

  const unsubStore = useEditorStore.subscribe(() => void reconcile());

  void reconcile();

  return {
    dispose: () => {
      disposed = true;
      unsubStore();
      teardownFurniture();
    },
  };
}

import * as THREE from "three";
import { useEditorStore } from "../../state/editorStore.js";
import {
  loadEditorMyApartmentGltfTemplates,
  loadEditorMyApartmentDecorTemplates,
  mountEditorMyApartmentFurnitureUnder,
  updateEditorMyApartmentMountFromDoc,
  type EditorMyApartmentFurnitureMount,
  type EditorMyApartmentDecorTemplateMap,
  type EditorMyApartmentGltfTemplates,
} from "./editorMyApartmentMeshes.js";
import {
  ownedApartmentFractionMappingForEditor,
  resolveOwnedApartmentAuthoringLayoutForEditor,
} from "./editorMyApartmentAuthoringShell.js";
import { TYPICAL_FLOOR_DOC_ID } from "@the-mammoth/world";
import { setEditorMyApartmentPieceGroups } from "./editorMyApartmentPieceGroupBridge.js";

export type EditorMyApartmentLifecycleDeps = {
  getStructuralRoot: () => THREE.Group | null;
  getShouldHoldReplicaResync: () => boolean;
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
  let templates: EditorMyApartmentGltfTemplates | null = null;
  let templatesLoad: Promise<EditorMyApartmentGltfTemplates> | null = null;
  let decorTemplates: EditorMyApartmentDecorTemplateMap = new Map();

  async function ensureTemplatesLoaded(): Promise<EditorMyApartmentGltfTemplates> {
    if (templates) return templates;
    if (!templatesLoad) templatesLoad = loadEditorMyApartmentGltfTemplates();
    templates = await templatesLoad;
    return templates;
  }

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
      const t = await ensureTemplatesLoaded();
      if (disposed || myGen !== syncGeneration) return;
      const doc = st.ownedApartmentBuiltins;
      decorTemplates = await loadEditorMyApartmentDecorTemplates(
        doc.decorItems.map((item) => item.modelRelPath),
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
          t,
          decorTemplates,
          doc,
          authoringFractionMapping,
        );
      } else if (!deps.getShouldHoldReplicaResync()) {
        updateEditorMyApartmentMountFromDoc(
          mount,
          t,
          decorTemplates,
          doc,
          authoringFractionMapping,
        );
      }
      if (disposed || myGen !== syncGeneration) return;
      if (deps.getShouldHoldReplicaResync()) return;
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

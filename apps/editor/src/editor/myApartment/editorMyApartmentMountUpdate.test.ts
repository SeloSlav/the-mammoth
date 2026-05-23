import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC } from "@the-mammoth/schemas";
import { updateEditorMyApartmentMountFromDoc } from "./editorMyApartmentMountUpdate.js";
import {
  mountEditorMyApartmentFurnitureUnder,
  type EditorMyApartmentDecorTemplateMap,
} from "./editorMyApartmentMeshes.js";
import { ownedApartmentFractionMappingForEditor } from "./editorMyApartmentAuthoringShell.js";

describe("updateEditorMyApartmentMountFromDoc", () => {
  it("patches the mount in place without replacing the furniture root", () => {
    const parent = new THREE.Group();
    const decorTemplates: EditorMyApartmentDecorTemplateMap = new Map();
    const doc = DEFAULT_OWNED_APARTMENT_BUILTINS_DOC;
    const spans = ownedApartmentFractionMappingForEditor({
      layout: null,
      builtinsFallbackPreviewM: doc.previewSizeM,
    });

    const mount = mountEditorMyApartmentFurnitureUnder(
      parent,
      decorTemplates,
      doc,
      spans,
      parent,
    );
    const rootBefore = mount.root;
    const disposeBefore = mount.dispose;
    const resyncLightsBefore = mount.resyncPracticalLights;

    updateEditorMyApartmentMountFromDoc(
      mount,
      decorTemplates,
      doc,
      spans,
      "full",
      doc.placedItems,
    );

    expect(mount.root).toBe(rootBefore);
    expect(mount.dispose).toBe(disposeBefore);
    expect(mount.resyncPracticalLights).toBe(resyncLightsBefore);
    mount.dispose();
  });
});

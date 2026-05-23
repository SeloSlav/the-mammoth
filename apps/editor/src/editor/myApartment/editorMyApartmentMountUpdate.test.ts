import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  ownedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import { updateEditorMyApartmentMountFromDoc } from "./editorMyApartmentMountUpdate.js";
import {
  mountEditorMyApartmentFurnitureUnder,
  type EditorMyApartmentDecorTemplateMap,
} from "./editorMyApartmentMeshes.js";
import { createEditorApartmentFishTankBridge } from "./editorApartmentFishTankBridge.js";
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
      createEditorApartmentFishTankBridge(),
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

  it("does not share cached template geometry with mounted decor clones", () => {
    const parent = new THREE.Group();
    const modelRelPath = "static/models/objects/test.glb";
    const templateGeometry = new THREE.BoxGeometry(1, 1, 1);
    const templateMaterial = new THREE.MeshStandardMaterial();
    const template = new THREE.Group();
    template.add(new THREE.Mesh(templateGeometry, templateMaterial));
    const decorTemplates: EditorMyApartmentDecorTemplateMap = new Map([[modelRelPath, template]]);
    const doc = ownedApartmentBuiltinsDoc({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "decor-a",
          modelRelPath,
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
    });
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
      createEditorApartmentFishTankBridge(),
    );
    const mountedMesh = mount.root.getObjectByProperty("isMesh", true) as THREE.Mesh;

    expect(mountedMesh.geometry).not.toBe(templateGeometry);
    expect(mountedMesh.material).not.toBe(templateMaterial);

    mount.dispose();
    expect((template.children[0] as THREE.Mesh).geometry).toBe(templateGeometry);
  });
});

import * as THREE from "three";
import type { BuildingDoc, FloorDoc, InteriorDoc } from "@the-mammoth/schemas";
import { buildInteriorMeshes, instantiateBuildingFloorStack } from "@the-mammoth/world";
import { applyEditorMaterialsToFloorPlacement } from "./applyEditorMaterials.js";
import type { EditorMode } from "../state/editorStore.js";

export function buildEditorStructuralRoot(args: {
  mode: EditorMode;
  building: BuildingDoc;
  floorDocs: Record<string, FloorDoc>;
  activeInteriorDocId: string;
  interiorDocs: Record<string, InteriorDoc>;
  textureLoader: THREE.TextureLoader;
  emptyFloorDoc: (floorDocId: string) => FloorDoc;
}): THREE.Group {
  if (args.mode === "floor") {
    const buildingRoot = instantiateBuildingFloorStack(args.building, (floorDocId) => {
      return args.floorDocs[floorDocId] ?? args.emptyFloorDoc(floorDocId);
    });
    for (const doc of Object.values(args.floorDocs)) {
      for (const obj of doc.objects) {
        applyEditorMaterialsToFloorPlacement(
          buildingRoot,
          doc.id,
          obj,
          args.textureLoader,
        );
      }
    }
    return buildingRoot;
  }
  const doc = args.interiorDocs[args.activeInteriorDocId];
  return doc ? buildInteriorMeshes(doc) : new THREE.Group();
}

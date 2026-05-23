import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  EDITOR_MY_APARTMENT_FURNITURE_ROOT_NAME,
  getEditorMyApartmentFurnitureMountRoot,
  getEditorFishTankBridge,
  registerEditorFishTankBridge,
  resolveEditorMyApartmentFurnitureMountRootFromObject,
  setEditorMyApartmentPieceGroups,
} from "./editorMyApartmentPieceGroupBridge.js";
import { createEditorApartmentFishTankBridge } from "./editorApartmentFishTankBridge.js";
import { MY_APARTMENT_OBJECT_GROUP_MANIP_UD } from "./editorMyApartmentSavedGroupManip.js";

describe("editorMyApartmentPieceGroupBridge furniture root", () => {
  it("resolves the named furniture root when members are under a saved-group manipulator", () => {
    const furnitureRoot = new THREE.Group();
    furnitureRoot.name = EDITOR_MY_APARTMENT_FURNITURE_ROOT_NAME;

    const manip = new THREE.Group();
    manip.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] = true;
    furnitureRoot.add(manip);

    const decorA = new THREE.Group();
    const decorB = new THREE.Group();
    manip.add(decorA);
    manip.add(decorB);

    setEditorMyApartmentPieceGroups({
      decorA,
      decorB,
    });

    expect(getEditorMyApartmentFurnitureMountRoot()).toBe(furnitureRoot);
    expect(resolveEditorMyApartmentFurnitureMountRootFromObject(decorA)).toBe(
      furnitureRoot,
    );
  });

  it("does not treat the saved-group manipulator as the furniture mount root", () => {
    const furnitureRoot = new THREE.Group();
    furnitureRoot.name = EDITOR_MY_APARTMENT_FURNITURE_ROOT_NAME;

    const manip = new THREE.Group();
    manip.userData[MY_APARTMENT_OBJECT_GROUP_MANIP_UD] = true;
    furnitureRoot.add(manip);

    const decor = new THREE.Group();
    manip.add(decor);

    expect(resolveEditorMyApartmentFurnitureMountRootFromObject(manip)).toBe(
      furnitureRoot,
    );
    expect(resolveEditorMyApartmentFurnitureMountRootFromObject(manip)).not.toBe(
      manip,
    );
  });
});

describe("editorMyApartmentPieceGroupBridge fish tank bridge", () => {
  it("registers and retrieves the active fish tank bridge", () => {
    registerEditorFishTankBridge(null);
    expect(getEditorFishTankBridge()).toBeNull();

    const bridge = createEditorApartmentFishTankBridge();
    registerEditorFishTankBridge(bridge);
    expect(getEditorFishTankBridge()).toBe(bridge);

    registerEditorFishTankBridge(null);
    expect(getEditorFishTankBridge()).toBeNull();
  });
});

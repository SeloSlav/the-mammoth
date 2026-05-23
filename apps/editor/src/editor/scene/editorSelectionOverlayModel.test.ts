import * as THREE from "three";
import { describe, expect, it, beforeEach } from "vitest";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForSavedObjectGroup,
} from "../myApartment/editorMyApartmentSelection.js";
import {
  setEditorMyApartmentPieceGroups,
} from "../myApartment/editorMyApartmentPieceGroupBridge.js";
import { buildEditorSelectionOverlayModel } from "./editorSelectionOverlayModel.js";

function boxGroup(name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  return group;
}

describe("buildEditorSelectionOverlayModel", () => {
  beforeEach(() => {
    setEditorMyApartmentPieceGroups(null);
  });

  it("builds a single-selection model for one decor", () => {
    const decorId = "fish-1";
    const selectionId = editorMyApartmentSelectedIdForDecor(decorId);
    const group = boxGroup("fish");
    group.userData.mammothApartmentDecorModelRelPath = "static/models/objects/fish.glb";
    setEditorMyApartmentPieceGroups({ [selectionId]: group });

    const model = buildEditorSelectionOverlayModel({
      mode: "my_apartment_layout",
      selectedId: selectionId,
      myApartmentMultiselectExtraIds: [],
      objectGroups: [],
      placedItems: [{ id: decorId, modelRelPath: "static/models/objects/fish.glb" }],
      fallbackTarget: null,
    });

    expect(model?.kind).toBe("single");
    expect(model?.title).toBe("Fish");
    expect(model?.entries).toHaveLength(1);
    expect(model?.totals.triangles).toBe(12);
  });

  it("stacks ctrl multiselect entries with combined totals", () => {
    const decorA = editorMyApartmentSelectedIdForDecor("a");
    const decorB = editorMyApartmentSelectedIdForDecor("b");
    const groupA = boxGroup("a");
    groupA.userData.mammothApartmentDecorModelRelPath = "static/models/objects/fish.glb";
    const groupB = boxGroup("b");
    groupB.userData.mammothApartmentDecorModelRelPath = "static/models/objects/table-side.glb";
    groupB.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2)));
    setEditorMyApartmentPieceGroups({
      [decorA]: groupA,
      [decorB]: groupB,
    });

    const model = buildEditorSelectionOverlayModel({
      mode: "my_apartment_layout",
      selectedId: decorA,
      myApartmentMultiselectExtraIds: [decorB],
      objectGroups: [],
      placedItems: [
        { id: "a", modelRelPath: "static/models/objects/fish.glb" },
        { id: "b", modelRelPath: "static/models/objects/table-side.glb" },
      ],
      fallbackTarget: null,
    });

    expect(model?.kind).toBe("multi");
    expect(model?.entries).toHaveLength(2);
    expect(model?.entries.map((entry) => entry.name)).toEqual(["Fish", "Table Side"]);
    expect(model?.totals.triangles).toBe(12 + 12 + 2);
  });

  it("shows saved group members under the group name", () => {
    const decorA = editorMyApartmentSelectedIdForDecor("a");
    const decorB = editorMyApartmentSelectedIdForDecor("b");
    const groupA = boxGroup("a");
    groupA.userData.mammothApartmentDecorModelRelPath = "static/models/objects/fish.glb";
    const groupB = boxGroup("b");
    groupB.userData.mammothApartmentDecorModelRelPath = "static/models/objects/sofa.glb";
    setEditorMyApartmentPieceGroups({
      [decorA]: groupA,
      [decorB]: groupB,
    });

    const savedGroupId = "group-living";
    const model = buildEditorSelectionOverlayModel({
      mode: "my_apartment_layout",
      selectedId: editorMyApartmentSelectedIdForSavedObjectGroup(savedGroupId),
      myApartmentMultiselectExtraIds: [],
      objectGroups: [
        {
          id: savedGroupId,
          name: "Living cluster",
          memberSelectedIds: [decorA, decorB],
        },
      ],
      placedItems: [
        { id: "a", modelRelPath: "static/models/objects/fish.glb" },
        { id: "b", modelRelPath: "static/models/objects/sofa.glb" },
      ],
      fallbackTarget: null,
    });

    expect(model?.kind).toBe("group");
    expect(model?.title).toBe("Living cluster");
    expect(model?.entries.map((entry) => entry.name)).toEqual(["Fish", "Sofa"]);
    expect(model?.totals.triangles).toBe(24);
  });
});

import { describe, expect, it } from "vitest";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC } from "@the-mammoth/schemas";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForSavedObjectGroup,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";
import { cloneMyApartmentLayoutSelectionInDoc } from "./cloneMyApartmentLayoutPlacements.js";

describe("cloneMyApartmentLayoutSelectionInDoc", () => {
  const modelRelPath = "static/models/objects/obj.glb" as const;

  function baseDoc(): OwnedApartmentBuiltinsDoc {
    return {
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "decor-a",
          modelRelPath,
          fx: 0.4,
          fz: 0.5,
          dy: 0.1,
          yawRad: 0.2,
          pitchRad: 0.1,
          rollRad: 0,
          uniformScale: 1.2,
          ignoreSupportSurfaces: true,
          itemKind: "plain",
        },
      ],
      wallItems: [
        {
          id: "wall-a",
          fx: 0.5,
          fz: 0.7,
          dy: 0,
          yawRad: 1.1,
          pitchRad: 0,
          sizeX: 2,
          sizeY: 2.5,
          sizeZ: 0.07,
          material: { useMetalnessMap: true, useHeightMap: false },
        },
      ],
    };
  }

  it("clones a single décor placement and selects the copy", () => {
    let n = 0;
    const out = cloneMyApartmentLayoutSelectionInDoc(baseDoc(), {
      selectedId: editorMyApartmentSelectedIdForDecor("decor-a"),
      myApartmentMultiselectExtraIds: [],
      createEntityId: () => `new-${++n}`,
    });
    expect(out).not.toBeNull();
    expect(out!.doc.placedItems).toHaveLength(2);
    expect(out!.doc.placedItems[1]).toMatchObject({
      id: "new-1",
      fx: 0.46,
      fz: 0.56,
      modelRelPath,
    });
    expect(out!.selectedId).toBe(editorMyApartmentSelectedIdForDecor("new-1"));
    expect(out!.myApartmentMultiselectExtraIds).toEqual([]);
  });

  it("clones a saved object group", () => {
    const doc: OwnedApartmentBuiltinsDoc = {
      ...baseDoc(),
      objectGroups: [
        {
          id: "grp-src",
          name: "Set",
          memberSelectedIds: [
            editorMyApartmentSelectedIdForDecor("decor-a"),
            editorMyApartmentSelectedIdForWall("wall-a"),
          ],
        },
      ],
    };
    let n = 0;
    const out = cloneMyApartmentLayoutSelectionInDoc(doc, {
      selectedId: "mammoth_editor_my_apartment_group:grp-src",
      myApartmentMultiselectExtraIds: [],
      createEntityId: () => `new-${++n}`,
    });
    expect(out).not.toBeNull();
    expect(out!.doc.objectGroups).toHaveLength(2);
    expect(out!.doc.objectGroups[1]?.name).toBe("Set copy");
    expect(out!.selectedId).toBe(editorMyApartmentSelectedIdForSavedObjectGroup("new-1"));
  });
});

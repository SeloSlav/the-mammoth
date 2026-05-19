import { describe, expect, it } from "vitest";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  finalizeOwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";
import {
  deleteMyApartmentLayoutPlacementsInDoc,
  deleteMyApartmentObjectGroupMembersInDoc,
  isMyApartmentLayoutDeletionSelection,
} from "./deleteMyApartmentLayoutPlacements.js";

describe("deleteMyApartmentLayoutPlacementsInDoc", () => {
  const modelRelPath = "static/models/objects/obj.glb" as const;

  function sampleDoc(): OwnedApartmentBuiltinsDoc {
    return {
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
        {
          id: "decor-a",
          modelRelPath,
          fx: 0.4,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
        {
          id: "decor-b",
          modelRelPath,
          fx: 0.6,
          fz: 0.55,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
      wallItems: [
        {
          id: "wall-a",
          fx: 0.5,
          fz: 0.7,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          sizeX: 2,
          sizeY: 2.5,
          sizeZ: 0.07,
          material: { useMetalnessMap: false, useHeightMap: false },
        },
      ],
      mirrorItems: [
        {
          id: "mirror-a",
          fx: 0.3,
          fz: 0.4,
          dy: 0.9,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          sizeX: 1.2,
          sizeY: 1.8,
        },
      ],
      objectGroups: [
        {
          id: "grp-a",
          name: "Set A",
          memberSelectedIds: [
            editorMyApartmentSelectedIdForDecor("decor-a"),
            editorMyApartmentSelectedIdForWall("wall-a"),
          ],
        },
      ],
    };
  }

  it("removes mixed placement selections", () => {
    const out = deleteMyApartmentLayoutPlacementsInDoc(sampleDoc(), [
      editorMyApartmentSelectedIdForDecor("decor-a"),
      editorMyApartmentSelectedIdForMirror("mirror-a"),
    ]);
    expect(out).not.toBeNull();
    expect(out!.placedItems.some((d) => d.id === "decor-a")).toBe(false);
    expect(out!.placedItems.some((d) => d.id === "decor-b")).toBe(true);
    expect(out!.mirrorItems).toHaveLength(0);
    expect(out!.wallItems).toHaveLength(1);
  });

  it("deletes every group member and removes the saved group", () => {
    const out = deleteMyApartmentObjectGroupMembersInDoc(sampleDoc(), "grp-a");
    expect(out).not.toBeNull();

    const finalized = finalizeOwnedApartmentBuiltinsDoc(out!);
    expect(finalized.placedItems.some((d) => d.id === "decor-a")).toBe(false);
    expect(finalized.wallItems.some((w) => w.id === "wall-a")).toBe(false);
    expect(finalized.objectGroups).toHaveLength(0);
  });

  it("detects deletable apartment selections", () => {
    expect(
      isMyApartmentLayoutDeletionSelection({
        selectedId: editorMyApartmentSelectedIdForDecor("decor-a"),
        myApartmentMultiselectExtraIds: [],
      }),
    ).toBe(true);
    expect(
      isMyApartmentLayoutDeletionSelection({
        selectedId: "mammoth_editor_my_apartment_group:grp-a",
        myApartmentMultiselectExtraIds: [],
      }),
    ).toBe(true);
    expect(
      isMyApartmentLayoutDeletionSelection({
        selectedId: null,
        myApartmentMultiselectExtraIds: [],
      }),
    ).toBe(false);
  });
});

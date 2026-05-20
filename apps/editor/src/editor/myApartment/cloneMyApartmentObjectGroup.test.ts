import { describe, expect, it } from "vitest";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  finalizeOwnedApartmentBuiltinsDoc,
  ownedApartmentBuiltinsDoc,
  type OwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";
import { cloneMyApartmentObjectGroupInDoc } from "./cloneMyApartmentObjectGroup.js";

describe("cloneMyApartmentObjectGroupInDoc", () => {
  const modelRelPath = "static/models/objects/obj.glb" as const;

  function baseDoc(): OwnedApartmentBuiltinsDoc {
    return ownedApartmentBuiltinsDoc({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
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
        {
          id: "decor-b",
          modelRelPath,
          fx: 0.6,
          fz: 0.55,
          dy: 0,
          yawRad: -0.3,
          pitchRad: 0,
          rollRad: 0.05,
          uniformScale: 0.8,
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
          yawRad: 1.1,
          pitchRad: 0,
          sizeX: 2,
          sizeY: 2.5,
          sizeZ: 0.07,
          material: { useMetalnessMap: true, useHeightMap: false, roughness: 0.4 },
        },
      ],
      mirrorItems: [
        {
          id: "mirror-a",
          fx: 0.3,
          fz: 0.4,
          dy: 0.9,
          yawRad: 0.5,
          pitchRad: 0,
          rollRad: 0,
          sizeX: 1.2,
          sizeY: 1.8,
        },
      ],
      objectGroups: [
        {
          id: "grp-src",
          name: "Living set",
          memberSelectedIds: [
            editorMyApartmentSelectedIdForDecor("decor-a"),
            editorMyApartmentSelectedIdForWall("wall-a"),
            editorMyApartmentSelectedIdForMirror("mirror-a"),
          ],
        },
      ],
    });
  }

  it("clones every member type, offsets placement, and creates a new saved group", () => {
    let n = 0;
    const createEntityId = () => `new-${++n}`;

    const out = cloneMyApartmentObjectGroupInDoc(baseDoc(), "grp-src", {
      newGroupId: "grp-clone",
      createEntityId,
      offsetFx: 0.06,
      offsetFz: -0.04,
    });
    expect(out).not.toBeNull();

    const finalized = finalizeOwnedApartmentBuiltinsDoc(out!.doc);
    expect(finalized.placedItems).toHaveLength(
      DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems.length + 3,
    );
    expect(finalized.wallItems).toHaveLength(2);
    expect(finalized.mirrorItems).toHaveLength(2);
    expect(finalized.objectGroups).toHaveLength(2);

    const cloneGroup = finalized.objectGroups.find((g) => g.id === "grp-clone");
    expect(cloneGroup?.name).toBe("Living set copy");
    expect(cloneGroup?.memberSelectedIds).toEqual([
      editorMyApartmentSelectedIdForDecor("new-1"),
      editorMyApartmentSelectedIdForMirror("new-3"),
      editorMyApartmentSelectedIdForWall("new-2"),
    ]);

    const clonedDecor = finalized.placedItems.find((d) => d.id === "new-1");
    expect(clonedDecor).toMatchObject({
      fx: 0.46,
      fz: 0.46,
      dy: 0.1,
      yawRad: 0.2,
      pitchRad: 0.1,
      uniformScale: 1.2,
      ignoreSupportSurfaces: true,
    });

    const clonedWall = finalized.wallItems.find((w) => w.id === "new-2");
    expect(clonedWall?.fx).toBeCloseTo(0.56);
    expect(clonedWall?.fz).toBeCloseTo(0.66);
    expect(clonedWall).toMatchObject({
      sizeX: 2,
      material: { useMetalnessMap: true, useHeightMap: false, roughness: 0.4 },
    });

    const clonedMirror = finalized.mirrorItems.find((m) => m.id === "new-3");
    expect(clonedMirror?.fx).toBeCloseTo(0.36);
    expect(clonedMirror?.fz).toBeCloseTo(0.36);
    expect(clonedMirror).toMatchObject({
      sizeX: 1.2,
      sizeY: 1.8,
    });
  });

  it("returns null for unknown groups or when fewer than two members clone", () => {
    expect(cloneMyApartmentObjectGroupInDoc(baseDoc(), "missing")).toBeNull();

    const sparse = {
      ...baseDoc(),
      objectGroups: [
        {
          id: "grp-one",
          name: "One",
          memberSelectedIds: [editorMyApartmentSelectedIdForDecor("decor-a")],
        },
      ],
    };
    expect(cloneMyApartmentObjectGroupInDoc(sparse, "grp-one")).toBeNull();
  });
});

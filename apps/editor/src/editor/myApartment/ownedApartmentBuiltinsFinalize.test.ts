import { describe, expect, it } from "vitest";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  finalizeOwnedApartmentBuiltinsDoc,
  ownedApartmentBuiltinsDoc,
  ownedApartmentPlacedItem,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentPlacedItem,
} from "@the-mammoth/schemas";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";

describe("finalizeOwnedApartmentBuiltinsDoc (objectGroups)", () => {
  const modelRelPath = "static/models/objects/obj.glb" as const;

  const mkPlain = (id: string): OwnedApartmentPlacedItem =>
    ownedApartmentPlacedItem({
      id,
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
    });

  const mkWall = (id: string): OwnedApartmentBuiltinsDoc["wallItems"][number] => ({
    id,
    fx: 0.5,
    fz: 0.5,
    dy: 0,
    yawRad: 0,
    pitchRad: 0,
    sizeX: 1,
    sizeY: 1,
    sizeZ: 0.07,
    material: { useMetalnessMap: false, useHeightMap: false },
  });

  function docWith(groups: OwnedApartmentBuiltinsDoc["objectGroups"]): OwnedApartmentBuiltinsDoc {
    return ownedApartmentBuiltinsDoc({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
        mkPlain("decor-1"),
        mkPlain("decor-2"),
      ],
      wallItems: [mkWall("wall-1")],
      objectGroups: groups,
    });
  }

  it("drops groups with stale or unknown member ids while keeping ≥2 valid members", () => {
    const d1 = editorMyApartmentSelectedIdForDecor("decor-1");
    const d2 = editorMyApartmentSelectedIdForDecor("decor-2");
    const stale = editorMyApartmentSelectedIdForDecor("missing");
    const w1 = editorMyApartmentSelectedIdForWall("wall-1");

    const out = finalizeOwnedApartmentBuiltinsDoc(
      docWith([
        {
          id: "g-good",
          name: "Keeps two",
          memberSelectedIds: [d1, d2],
        },
        {
          id: "g-prune-one",
          name: "Loses stale",
          memberSelectedIds: [d1, stale],
        },
        {
          id: "g-bad-shape",
          name: "Invalid id shape",
          memberSelectedIds: [d1, "not-a-valid-selection-id"],
        },
        {
          id: "g-mixed-kept",
          name: "Wall + décor",
          memberSelectedIds: [d2, w1, stale],
        },
      ]),
    );

    const byId = new Map(out.objectGroups.map((g) => [g.id, g]));
    expect(byId.get("g-good")).toMatchObject({
      memberSelectedIds: [d1, d2],
    });
    expect(byId.has("g-prune-one")).toBe(false);
    expect(byId.has("g-bad-shape")).toBe(false);
    expect(byId.get("g-mixed-kept")).toMatchObject({
      memberSelectedIds: [d2, w1],
    });
  });

  it("dedupes member ids within a group", () => {
    const d1 = editorMyApartmentSelectedIdForDecor("decor-1");
    const d2 = editorMyApartmentSelectedIdForDecor("decor-2");
    const out = finalizeOwnedApartmentBuiltinsDoc(
      docWith([
        {
          id: "g-dup",
          name: "Duped",
          memberSelectedIds: [d1, d1, d2],
        },
      ]),
    );
    expect(out.objectGroups).toHaveLength(1);
    expect(out.objectGroups[0]?.memberSelectedIds).toEqual([d1, d2]);
  });

  it("keeps mirror members when the mirror row still exists", () => {
    const d1 = editorMyApartmentSelectedIdForDecor("decor-1");
    const d2 = editorMyApartmentSelectedIdForDecor("decor-2");
    const m1 = editorMyApartmentSelectedIdForMirror("mirror-1");
    const out = finalizeOwnedApartmentBuiltinsDoc({
      ...docWith([
        {
          id: "g-mirror",
          name: "Mirror mix",
          memberSelectedIds: [d1, m1, d2],
        },
      ]),
      mirrorItems: [
        {
          id: "mirror-1",
          fx: 0.5,
          fz: 0.5,
          dy: 0.9,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          sizeX: 1,
          sizeY: 1,
        },
      ],
    });
    expect(out.objectGroups).toHaveLength(1);
    expect(out.objectGroups[0]?.memberSelectedIds).toEqual([d1, m1, d2]);
  });
});

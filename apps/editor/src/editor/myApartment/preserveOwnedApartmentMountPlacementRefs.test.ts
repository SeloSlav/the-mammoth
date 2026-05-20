import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC } from "@the-mammoth/schemas";
import { defaultOwnedApartmentWallDoorOpening } from "@the-mammoth/world";
import {
  ownedApartmentWallItemsDeepEqual,
  ownedApartmentWallOpeningsSignature,
  preserveOwnedApartmentMountPlacementRefs,
} from "./preserveOwnedApartmentMountPlacementRefs.js";
import { editorMyApartmentSelectedIdForDecor } from "./editorMyApartmentSelection.js";
import { classifyApartmentMountSyncChange, captureApartmentMountSyncInputs } from "./editorMyApartmentMountSync.js";

describe("preserveOwnedApartmentMountPlacementRefs", () => {
  it("reuses placement arrays when only objectGroups changed", () => {
    const prev = DEFAULT_OWNED_APARTMENT_BUILTINS_DOC;
    const next = {
      ...prev,
      placedItems: [...prev.placedItems],
      wallItems: [...prev.wallItems],
      mirrorItems: [...prev.mirrorItems],
      objectGroups: [
        {
          id: "g1",
          name: "Group",
          memberSelectedIds: [
            editorMyApartmentSelectedIdForDecor("decor-a"),
            editorMyApartmentSelectedIdForDecor("decor-b"),
          ],
        },
      ],
    };

    const out = preserveOwnedApartmentMountPlacementRefs(prev, next);
    expect(out.placedItems).toBe(prev.placedItems);
    expect(out.wallItems).toBe(prev.wallItems);
    expect(out.mirrorItems).toBe(prev.mirrorItems);
    expect(out.objectGroups).toBe(next.objectGroups);
  });

  it("keeps new wallItems when door openings are added", () => {
    const wallId = "wall_a";
    const prev = {
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      wallItems: [
        {
          id: wallId,
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          sizeX: 3,
          sizeY: 2.6,
          sizeZ: 0.08,
          material: { useMetalnessMap: false, useHeightMap: false },
        },
      ],
    };
    const opening = defaultOwnedApartmentWallDoorOpening("door_a");
    const next = {
      ...prev,
      wallItems: [
        {
          ...prev.wallItems[0]!,
          openings: [opening],
        },
      ],
    };
    const out = preserveOwnedApartmentMountPlacementRefs(prev, next);
    expect(out.wallItems).toBe(next.wallItems);
    expect(out.wallItems[0]?.openings).toHaveLength(1);
    expect(ownedApartmentWallOpeningsSignature(prev.wallItems)).not.toBe(
      ownedApartmentWallOpeningsSignature(out.wallItems),
    );
  });

  it("classifies opening-only wall edits as walls-only sync", () => {
    const building = {} as never;
    const wallBase = {
      id: "wall_a",
      fx: 0.5,
      fz: 0.5,
      dy: 0,
      yawRad: 0,
      pitchRad: 0,
      sizeX: 3,
      sizeY: 2.6,
      sizeZ: 0.08,
      material: { useMetalnessMap: false, useHeightMap: false },
    };
    const prevInputs = captureApartmentMountSyncInputs({
      mode: "my_apartment_layout",
      contentStructureEpoch: 0,
      ownedApartmentBuiltins: {
        ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
        wallItems: [wallBase],
      },
      floorDocs: {},
      building,
    } as never);
    const nextInputs = captureApartmentMountSyncInputs({
      mode: "my_apartment_layout",
      contentStructureEpoch: 0,
      ownedApartmentBuiltins: {
        ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
        wallItems: [
          {
            ...wallBase,
            openings: [defaultOwnedApartmentWallDoorOpening("door_a")],
          },
        ],
      },
      floorDocs: {},
      building,
    } as never);
    expect(ownedApartmentWallItemsDeepEqual(prevInputs.wallItems, nextInputs.wallItems)).toBe(
      false,
    );
    expect(classifyApartmentMountSyncChange(prevInputs, nextInputs)).toBe("walls-only");
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC } from "@the-mammoth/schemas";
import { defaultOwnedApartmentWallDoorOpening } from "@the-mammoth/world";
import {
  collectOwnedApartmentWallIdsWithOpeningChanges,
  collectWallIdsNeedingEditorMountSync,
  ownedApartmentPlacedItemsOnlyPoseChanged,
  ownedApartmentWallItemsDeepEqual,
  ownedApartmentWallOpeningsSignature,
  preserveOwnedApartmentMountPlacementRefs,
} from "./preserveOwnedApartmentMountPlacementRefs.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";
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

describe("collectOwnedApartmentWallIdsWithOpeningChanges", () => {
  it("still detects a new door when prev mount inputs were advanced before diffing", () => {
    const wallId = "wall_a";
    const wallBase = {
      id: wallId,
      fx: 0.5,
      fz: 0.5,
      dy: 0,
      yawRad: 0,
      pitchRad: 0,
      sizeX: 6.82,
      sizeY: 2.8,
      sizeZ: 0.07,
      material: { useMetalnessMap: false, useHeightMap: false },
    };
    const withDoor = {
      ...wallBase,
      openings: [defaultOwnedApartmentWallDoorOpening("door_a")],
    };
    const advanced = [withDoor];
    const mountedKeys = new Set([editorMyApartmentSelectedIdForWall(wallId)]);
    expect(
      collectWallIdsNeedingEditorMountSync(advanced, advanced, mountedKeys).size,
    ).toBe(0);
    expect(collectOwnedApartmentWallIdsWithOpeningChanges(advanced, advanced).size).toBe(
      0,
    );
    expect(
      collectOwnedApartmentWallIdsWithOpeningChanges([wallBase], advanced).has(wallId),
    ).toBe(true);
    const mountIds = collectWallIdsNeedingEditorMountSync(
      [wallBase],
      advanced,
      mountedKeys,
    );
    expect(mountIds.has(wallId)).toBe(true);
  });
});

describe("collectWallIdsNeedingEditorMountSync", () => {
  it("includes new walls even when prev mount inputs already advanced without a mesh", () => {
    const prev = DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.wallItems;
    const next = [
      ...prev,
      {
        id: "wall-new",
        fx: 0.5,
        fz: 0.5,
        dy: 0,
        yawRad: 0,
        pitchRad: 0,
        sizeX: 2,
        sizeY: 2.6,
        sizeZ: 0.07,
        material: { useMetalnessMap: false, useHeightMap: false },
      },
    ];
    const mountedKeys = new Set(
      prev.map((w) => editorMyApartmentSelectedIdForWall(w.id)),
    );
    const ids = collectWallIdsNeedingEditorMountSync(prev, next, mountedKeys);
    expect(ids.has("wall-new")).toBe(true);
    expect(ids.size).toBe(1);
  });
});

describe("ownedApartmentPlacedItemsOnlyPoseChanged", () => {
  it("treats imported decor as structural so the editor mounts a scene group", () => {
    const next = [
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
      {
        id: "decor-new",
        modelRelPath: "static/models/objects/fish-tank.glb",
        fx: 0.5,
        fz: 0.5,
        dy: 0,
        yawRad: 0,
        pitchRad: 0,
        rollRad: 0,
        uniformScale: 1,
        verticalScaleMul: 1,
        ignoreSupportSurfaces: false,
        itemKind: "plain" as const,
      },
    ];

    expect(
      ownedApartmentPlacedItemsOnlyPoseChanged(
        DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
        next,
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { ApartmentUnit } from "../../module_bindings/types";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  ownedApartmentPlacedItemKindHasStash,
  OwnedApartmentBuiltinsDocSchema,
} from "@the-mammoth/schemas";
import {
  ownedApartmentDocUsesNonPlainPlacedItems,
  resolveApartmentDecorPoses,
  resolveApartmentMirrorPoses,
  resolveApartmentWallPoses,
} from "./fpOwnedApartmentBuiltinsFromContent";

function apartmentUnit(overrides: Partial<ApartmentUnit> = {}): ApartmentUnit {
  return {
    unitKey: "floor_a|18|unit_w_001",
    floorDocId: "floor_a",
    level: 18,
    unitId: "unit_w_001",
    state: 1,
    owner: null,
    claimProgressSecs: 0,
    claimStartedBy: null,
    lastClaimPulseMicros: 0n,
    reinforceProgressSecs: 0,
    reinforceBy: null,
    reinforced: 0,
    bedX: 1,
    bedY: 10,
    bedZ: 2,
    bedYaw: 0.5,
    footX: 3,
    footY: 10,
    footZ: 4,
    wardrobeX: 5,
    wardrobeZ: 6,
    stoveX: 2,
    stoveZ: 3,
    boundMinX: 100,
    boundMaxX: 112,
    boundMinZ: 200,
    boundMaxZ: 208,
    boundMinY: 30,
    boundMaxY: 33,
    ...overrides,
  } as ApartmentUnit;
}

describe("resolveApartmentDecorPoses", () => {
  it("maps normalized decor placements into world-space unit bounds", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      version: 2,
      previewSizeM: 10,
      placedItems: [
        {
          id: "decor_a",
          modelRelPath: "static/models/objects/cabinet-horizontal.glb",
          fx: 0.25,
          fz: 0.75,
          dy: 0.4,
          yawRad: 1.25,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1.5,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
      wallItems: [],
      objectGroups: [],
    });

    expect(resolveApartmentDecorPoses(apartmentUnit(), doc)).toEqual([
      {
        id: "decor_a",
        modelRelPath: "static/models/objects/cabinet-horizontal.glb",
        itemKind: "plain",
        x: 103,
        y: 30.4,
        z: 206,
        yaw: 1.25,
        pitch: 0,
        roll: 0,
        uniformScale: 1.5,
      },
    ]);
  });

  it("carries authored pitch into world-space decor poses", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      version: 2,
      previewSizeM: 10,
      placedItems: [
        {
          id: "decor_pitch",
          modelRelPath: "static/models/objects/tv.glb",
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: -0.25,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
      wallItems: [],
      objectGroups: [],
    });
    expect(resolveApartmentDecorPoses(apartmentUnit(), doc)[0]?.pitch).toBe(-0.25);
  });

  it("carries authored roll into world-space decor poses", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      version: 2,
      previewSizeM: 10,
      placedItems: [
        {
          id: "decor_roll",
          modelRelPath: "static/models/objects/tv.glb",
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0.33,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
      wallItems: [],
      objectGroups: [],
    });
    expect(resolveApartmentDecorPoses(apartmentUnit(), doc)[0]?.roll).toBeCloseTo(0.33, 5);
  });

  it("maps slight negative fractions outside the strict hull for wall-edge authoring", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
        {
          id: "decor_edge",
          modelRelPath: "static/models/objects/tv.glb",
          fx: 0.1,
          fz: -0.1,
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
    const poses = resolveApartmentDecorPoses(apartmentUnit(), doc);
    const edge = poses.find((p) => p.id === "decor_edge");
    expect(edge).toMatchObject({
      id: "decor_edge",
      x: 101.2,
      z: 199.2,
    });
  });

  it("returns no decor when the content file is absent", () => {
    expect(resolveApartmentDecorPoses(apartmentUnit(), null)).toEqual([]);
  });

  it("maps wall slab items into world-space poses", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      wallItems: [
        {
          id: "wall_a",
          fx: 0.5,
          fz: 0.25,
          dy: 0.05,
          yawRad: 0.1,
          pitchRad: -0.05,
          sizeX: 2,
          sizeY: 2.5,
          sizeZ: 0.08,
          material: {
            mapUrl: "/static/materials/shared/foo.webp",
            useMetalnessMap: false,
            useHeightMap: false,
          },
        },
      ],
    });
    expect(resolveApartmentWallPoses(apartmentUnit(), doc)[0]).toMatchObject({
      id: "wall_a",
      x: 106,
      y: 30.05,
      z: 202,
      yaw: 0.1,
      pitch: -0.05,
      sizeX: 2,
      sizeY: 2.5,
      sizeZ: 0.08,
      material: { mapUrl: "/static/materials/shared/foo.webp" },
    });
  });

  it("returns no walls when the doc omits wallItems", () => {
    expect(resolveApartmentWallPoses(apartmentUnit(), null)).toEqual([]);
  });

  it("resolves mirror fractions into world-space poses", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      version: 2,
      previewSizeM: 10,
      placedItems: [],
      wallItems: [],
      mirrorItems: [
        {
          id: "mirror_a",
          fx: 0.5,
          fz: 0.5,
          dy: 0.9,
          yawRad: 0.2,
          pitchRad: 0.1,
          rollRad: 0,
          sizeX: 0.72,
          sizeY: 1.28,
        },
      ],
      objectGroups: [],
    });
    expect(resolveApartmentMirrorPoses(apartmentUnit(), doc)).toEqual([
      {
        id: "mirror_a",
        x: 106,
        y: 30.9,
        z: 204,
        yaw: 0.2,
        pitch: 0.1,
        roll: 0,
        sizeX: 0.72,
        sizeY: 1.28,
      },
    ]);
  });
});

describe("ownedApartmentPlacedItemKindHasStash", () => {
  it("includes fridge alongside other storage furniture", () => {
    expect(ownedApartmentPlacedItemKindHasStash("fridge")).toBe(true);
    expect(ownedApartmentPlacedItemKindHasStash("plain")).toBe(false);
  });
});

describe("ownedApartmentDocUsesNonPlainPlacedItems", () => {
  it("returns true when authored gameplay furniture is present", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "authored_bed",
          modelRelPath: "static/models/objects/bed.glb",
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "bed",
        },
      ],
    });
    expect(ownedApartmentDocUsesNonPlainPlacedItems(doc)).toBe(true);
  });

  it("returns false when authored items are visual-only decor", () => {
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "plain_decor",
          modelRelPath: "static/models/objects/tv.glb",
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
    expect(ownedApartmentDocUsesNonPlainPlacedItems(doc)).toBe(false);
  });
});

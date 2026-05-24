import { describe, expect, it } from "vitest";
import type { ApartmentUnit } from "../../module_bindings/types";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  ApartmentUnitLayoutProfilesDocSchema,
  ownedApartmentPlacedItemKindHasStash,
  OwnedApartmentBuiltinsDocSchema,
} from "@the-mammoth/schemas";
import {
  resolveApartmentLayoutDocForUnit,
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

/** Display floor 12 — below the standard shutter band (13–19). */
function apartmentUnitWithoutStandardShutters(
  overrides: Partial<ApartmentUnit> = {},
): ApartmentUnit {
  return apartmentUnit({
    unitKey: "floor_a|13|unit_w_001",
    level: 13,
    ...overrides,
  });
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

    expect(resolveApartmentDecorPoses(apartmentUnitWithoutStandardShutters(), doc)).toEqual([
      {
        id: "decor_a",
        modelRelPath: "static/models/objects/cabinet-horizontal.glb",
        itemKind: "plain",
        x: 104.875,
        y: 30.4,
        z: 206,
        yaw: 1.25,
        pitch: 0,
        roll: 0,
        uniformScale: 1.5,
        verticalScaleMul: 1,
        scaleX: undefined,
        scaleY: undefined,
        scaleZ: undefined,
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
    expect(resolveApartmentDecorPoses(apartmentUnitWithoutStandardShutters(), doc)[0]?.pitch).toBe(-0.25);
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
    expect(resolveApartmentDecorPoses(apartmentUnitWithoutStandardShutters(), doc)[0]?.roll).toBeCloseTo(0.33, 5);
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
    const poses = resolveApartmentDecorPoses(apartmentUnitWithoutStandardShutters(), doc);
    const edge = poses.find((p) => p.id === "decor_edge");
    expect(edge).toMatchObject({
      id: "decor_edge",
      x: 103.45,
      z: 199.2,
    });
  });

  it("returns standard façade shutters for qualifying units even without a layout doc", () => {
    const west = resolveApartmentDecorPoses(apartmentUnit(), null);
    expect(west).toHaveLength(2);
    expect(west.every((pose) => pose.modelRelPath.endsWith("window-shutter.glb"))).toBe(true);

    const east = resolveApartmentDecorPoses(
      apartmentUnit({ unitId: "unit_e_001", unitKey: "floor_a|18|unit_e_001" }),
      null,
    );
    expect(east[0]!.x).toBeGreaterThan(west[0]!.x);
  });

  it("returns no decor for units outside the shutter floor band", () => {
    expect(
      resolveApartmentDecorPoses(
        apartmentUnit({ unitKey: "floor_a|13|unit_w_001", level: 13 }),
        null,
      ),
    ).toEqual([]);
  });

  it("resolves assigned unit profile before the owned apartment default", () => {
    const unit = apartmentUnit();
    const profileLayout = OwnedApartmentBuiltinsDocSchema.parse({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [],
    });
    const profiles = ApartmentUnitLayoutProfilesDocSchema.parse({
      version: 1,
      profiles: [{ id: "profile_a", name: "Profile A", layout: profileLayout }],
      assignments: [{ unitKey: unit.unitKey, profileId: "profile_a" }],
    });

    expect(
      resolveApartmentLayoutDocForUnit(
        unit,
        DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
        profiles,
      ),
    ).toEqual(profileLayout);
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
    expect(resolveApartmentWallPoses(apartmentUnitWithoutStandardShutters(), doc)[0]).toMatchObject({
      id: "wall_a",
      x: 107.25,
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
    expect(resolveApartmentMirrorPoses(apartmentUnitWithoutStandardShutters(), doc)).toEqual([
      {
        id: "mirror_a",
        x: 107.25,
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
    expect(ownedApartmentPlacedItemKindHasStash("water_tank")).toBe(true);
    expect(ownedApartmentPlacedItemKindHasStash("plain")).toBe(false);
  });
});


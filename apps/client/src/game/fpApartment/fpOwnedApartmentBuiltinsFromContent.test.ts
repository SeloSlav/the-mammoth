import { describe, expect, it } from "vitest";
import type { ApartmentUnit } from "../../module_bindings/types";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  type OwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import { resolveApartmentDecorPoses, resolveApartmentWallPoses } from "./fpOwnedApartmentBuiltinsFromContent";

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
    const doc: OwnedApartmentBuiltinsDoc = {
      version: 1,
      previewSizeM: 10,
      bedFx: 0.5,
      bedFz: 0.5,
      bedDy: 0,
      wardrobeFx: 0.25,
      wardrobeFz: 0.75,
      footFx: 0.75,
      footFz: 0.25,
      stoveFx: 0.08,
      stoveFz: 0.08,
      wardrobeDy: 0,
      footDy: 0,
      stoveDy: 0,
      bedYawRad: 0,
      wardrobeYawRad: 0,
      footYawRad: 0,
      stoveYawRad: 0,
      bedUniformScale: 1,
      wardrobeUniformScale: 1,
      footUniformScale: 1,
      stoveUniformScale: 1,
      wallItems: [],
      decorItems: [
        {
          id: "decor_a",
          modelRelPath: "static/models/objects/cabinet-horizontal.glb",
          fx: 0.25,
          fz: 0.75,
          dy: 0.4,
          yawRad: 1.25,
          pitchRad: 0,
          uniformScale: 1.5,
          ignoreSupportSurfaces: false,
        },
      ],
    };

    expect(resolveApartmentDecorPoses(apartmentUnit(), doc)).toEqual([
      {
        id: "decor_a",
        modelRelPath: "static/models/objects/cabinet-horizontal.glb",
        x: 103,
        y: 30.4,
        z: 206,
        yaw: 1.25,
        pitch: 0,
        uniformScale: 1.5,
      },
    ]);
  });

  it("carries authored pitch into world-space decor poses", () => {
    const doc: OwnedApartmentBuiltinsDoc = {
      version: 1,
      previewSizeM: 10,
      bedFx: 0.5,
      bedFz: 0.5,
      bedDy: 0,
      wardrobeFx: 0.25,
      wardrobeFz: 0.75,
      footFx: 0.75,
      footFz: 0.25,
      stoveFx: 0.08,
      stoveFz: 0.08,
      wardrobeDy: 0,
      footDy: 0,
      stoveDy: 0,
      bedYawRad: 0,
      wardrobeYawRad: 0,
      footYawRad: 0,
      stoveYawRad: 0,
      bedUniformScale: 1,
      wardrobeUniformScale: 1,
      footUniformScale: 1,
      stoveUniformScale: 1,
      wallItems: [],
      decorItems: [
        {
          id: "decor_pitch",
          modelRelPath: "static/models/objects/tv.glb",
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: -0.25,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
        },
      ],
    };
    expect(resolveApartmentDecorPoses(apartmentUnit(), doc)[0]?.pitch).toBe(-0.25);
  });

  it("maps slight negative fractions outside the strict hull for wall-edge authoring", () => {
    const doc: OwnedApartmentBuiltinsDoc = {
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      decorItems: [
        {
          id: "decor_edge",
          modelRelPath: "static/models/objects/tv.glb",
          fx: 0.1,
          fz: -0.1,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
        },
      ],
    };
    expect(resolveApartmentDecorPoses(apartmentUnit(), doc)[0]).toMatchObject({
      id: "decor_edge",
      x: 101.2,
      z: 199.2,
    });
  });

  it("returns no decor when the content file is absent", () => {
    expect(resolveApartmentDecorPoses(apartmentUnit(), null)).toEqual([]);
  });

  it("maps wall slab items into world-space poses", () => {
    const doc: OwnedApartmentBuiltinsDoc = {
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
    };
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
});

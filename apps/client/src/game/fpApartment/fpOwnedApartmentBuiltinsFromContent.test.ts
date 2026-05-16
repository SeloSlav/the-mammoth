import { describe, expect, it } from "vitest";
import type { ApartmentUnit } from "../../module_bindings/types";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import { resolveApartmentDecorPoses } from "./fpOwnedApartmentBuiltinsFromContent";

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
      decorItems: [
        {
          id: "decor_a",
          modelRelPath: "static/models/objects/cabinet-horizontal.glb",
          fx: 0.25,
          fz: 0.75,
          dy: 0.4,
          yawRad: 1.25,
          uniformScale: 1.5,
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
        uniformScale: 1.5,
      },
    ]);
  });

  it("returns no decor when the content file is absent", () => {
    expect(resolveApartmentDecorPoses(apartmentUnit(), null)).toEqual([]);
  });
});

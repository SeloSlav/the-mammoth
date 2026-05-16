import { describe, expect, it } from "vitest";
import { apartmentFurniturePlacementChanged } from "./fpApartmentFurniture";
import type { ApartmentUnit } from "../../module_bindings/types";

function apartmentUnit(overrides: Partial<ApartmentUnit> = {}): ApartmentUnit {
  return {
    unitKey: "floor_a|2|unit_w_001",
    floorDocId: "floor_a",
    level: 2,
    unitId: "unit_w_001",
    state: 0,
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
    stoveZ: 2,
    boundMinX: 0,
    boundMaxX: 10,
    boundMinZ: 0,
    boundMaxZ: 12,
    boundMinY: 10,
    boundMaxY: 13,
    ...overrides,
  } as ApartmentUnit;
}

describe("apartmentFurniturePlacementChanged", () => {
  it("ignores claim and reinforcement progress updates", () => {
    const oldUnit = apartmentUnit();
    const newUnit = apartmentUnit({
      claimProgressSecs: 12.5,
      claimStartedBy: {} as never,
      lastClaimPulseMicros: 123456n,
      reinforceProgressSecs: 4.5,
      reinforceBy: {} as never,
      reinforced: 1,
    });

    expect(apartmentFurniturePlacementChanged(oldUnit, newUnit)).toBe(false);
  });

  it("detects state changes (e.g. top-band claim affecting interior meshes)", () => {
    expect(
      apartmentFurniturePlacementChanged(apartmentUnit({ level: 18 }), apartmentUnit({ level: 18, state: 1 })),
    ).toBe(true);
  });

  it("detects furniture placement changes", () => {
    expect(
      apartmentFurniturePlacementChanged(
        apartmentUnit(),
        apartmentUnit({ wardrobeX: 5.25 }),
      ),
    ).toBe(true);
  });

  it("detects stove anchor changes", () => {
    expect(
      apartmentFurniturePlacementChanged(apartmentUnit(), apartmentUnit({ stoveX: 2.25 })),
    ).toBe(true);
  });
});

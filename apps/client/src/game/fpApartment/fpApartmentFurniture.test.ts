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
      state: 1,
      owner: {} as never,
    });

    expect(apartmentFurniturePlacementChanged(oldUnit, newUnit)).toBe(false);
  });

  it("detects furniture placement changes", () => {
    expect(
      apartmentFurniturePlacementChanged(
        apartmentUnit(),
        apartmentUnit({ wardrobeX: 5.25 }),
      ),
    ).toBe(true);
  });
});

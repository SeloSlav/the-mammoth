import { describe, expect, it } from "vitest";
import {
  CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M,
  clientMayToggleApartmentDoor,
  feetDeepEnoughFromEntryDoor,
  formatApartmentPublicLabel,
  getApartmentSystemPrompt,
  residentUnitKeyFromDoor,
  residentUnitKeyFromParts,
  UNIT_STATE_CLAIMED,
  UNIT_STATE_UNCLAIMED,
} from "./fpApartmentGameplay";
import type { ApartmentDoor, ApartmentUnit } from "../../module_bindings/types";

const testIdentity = {
  isEqual: (other: unknown) => other === testIdentity,
};

function apartmentUnit(overrides: Partial<ApartmentUnit>): ApartmentUnit {
  return {
    unitKey: "floor_a|2|unit_w_001",
    floorDocId: "floor_a",
    level: 2,
    unitId: "unit_w_001",
    state: UNIT_STATE_UNCLAIMED,
    owner: null,
    claimProgressSecs: 0,
    claimStartedBy: null,
    lastClaimPulseMicros: 0n,
    reinforceProgressSecs: 0,
    reinforceBy: null,
    reinforced: 0,
    bedX: 0,
    bedY: 0,
    bedZ: 0,
    bedYaw: 0,
    footX: 0,
    footY: 10,
    footZ: 0,
    wardrobeX: 20,
    wardrobeZ: 20,
    boundMinX: 0,
    boundMaxX: 10,
    boundMinZ: 0,
    boundMaxZ: 10,
    boundMinY: 10,
    boundMaxY: 13,
    ...overrides,
  } as ApartmentUnit;
}

function mockConn(apartmentUnits: ApartmentUnit[], defIds: string[] = []) {
  return {
    identity: testIdentity,
    db: {
      apartment_unit: apartmentUnits,
      apartment_door: [],
      apartment_door_gameplay: [],
      inventory_item: defIds.map((defId, index) => ({
        instanceId: BigInt(index + 1),
        defId,
        quantity: 1,
        location: {
          tag: "Inventory",
          value: { ownerId: testIdentity },
        },
      })),
    },
  } as never;
}

describe("fpApartmentGameplay", () => {
  it("residentUnitKeyFromDoor matches server resident_unit_key_from_door_row", () => {
    const row = {
      rowKey: "d",
      floorDocId: "floor_a",
      level: 2,
      templateId: "unit_north|W|0",
      face: 0,
      hingeX: 0,
      hingeZ: 0,
      feetY: 0,
      panelWM: 1,
      panelHM: 2,
      desiredOpen: 0,
      swingOpen01: 0,
    } as ApartmentDoor;
    expect(residentUnitKeyFromDoor(row)).toBe("floor_a|2|unit_north");
  });

  it("residentUnitKeyFromParts matches residentUnitKeyFromDoor", () => {
    expect(residentUnitKeyFromParts("floor_a", 2, "unit_north|W|0")).toBe("floor_a|2|unit_north");
  });

  it("formatApartmentPublicLabel matches server format_apartment_public_label", () => {
    expect(formatApartmentPublicLabel({ level: 12, unitId: "unit_w_005" })).toBe("Floor 12, West 5");
    expect(formatApartmentPublicLabel({ level: 2, unitId: "unit_e_008" })).toBe("Floor 2, East 8");
    expect(formatApartmentPublicLabel({ level: 1, unitId: "loft_A" })).toBe("Floor 1, loft_A");
  });

  it("feetDeepEnoughFromEntryDoor matches east-wing W-face depth rule", () => {
    const hingeX = 1.925;
    const door = {
      rowKey: "",
      floorDocId: "",
      level: 0,
      templateId: "",
      face: 3,
      hingeX,
      hingeZ: 0,
      feetY: 0,
      panelWM: 1,
      panelHM: 2,
      desiredOpen: 0,
      swingOpen01: 0,
    } as ApartmentDoor;
    expect(feetDeepEnoughFromEntryDoor(door, hingeX - CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M - 0.05, 0)).toBe(true);
    expect(feetDeepEnoughFromEntryDoor(door, hingeX - CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M + 0.05, 0)).toBe(false);
  });

  it("feetDeepEnoughFromEntryDoor matches west-wing E-face depth rule", () => {
    const hingeX = -1.925;
    const door = {
      rowKey: "",
      floorDocId: "",
      level: 0,
      templateId: "",
      face: 2,
      hingeX,
      hingeZ: 0,
      feetY: 0,
      panelWM: 1,
      panelHM: 2,
      desiredOpen: 0,
      swingOpen01: 0,
    } as ApartmentDoor;
    expect(feetDeepEnoughFromEntryDoor(door, hingeX + CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M + 0.05, 0)).toBe(true);
    expect(feetDeepEnoughFromEntryDoor(door, hingeX + CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M - 0.05, 0)).toBe(false);
  });

  it("offers apartment claim near an unclaimed wardrobe even outside the coarse unit hull", () => {
    const unit = apartmentUnit({
      wardrobeX: 20,
      wardrobeZ: 20,
      boundMinX: 0,
      boundMaxX: 10,
      boundMinZ: 0,
      boundMaxZ: 10,
    });
    const prompt = getApartmentSystemPrompt(
      mockConn([unit], ["door-lock", "screwdriver"]),
      { x: 20.5, y: 10, z: 20.25 },
    );
    expect(prompt).toEqual({ kind: "apartment_claim", unitKey: unit.unitKey });
  });

  it("keeps owned claimed apartments on stash only and does not expose reinforcement", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 4,
      footZ: 5,
      boundMinX: 0,
      boundMaxX: 10,
      boundMinZ: 0,
      boundMaxZ: 10,
    });
    const prompt = getApartmentSystemPrompt(mockConn([unit]), { x: 4.2, y: 10, z: 5.2 });
    expect(prompt).toEqual({ kind: "apartment_stash", unitKey: unit.unitKey });
  });

  it("offers owned footlocker stash near the footlocker even outside the coarse unit hull", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 20,
      footZ: 20,
      boundMinX: 0,
      boundMaxX: 10,
      boundMinZ: 0,
      boundMaxZ: 10,
    });
    const prompt = getApartmentSystemPrompt(mockConn([unit]), { x: 20.2, y: 10, z: 20.1 });
    expect(prompt).toEqual({ kind: "apartment_stash", unitKey: unit.unitKey });
  });

  it("allows the claimed owner to toggle their apartment door", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
    });
    expect(
      clientMayToggleApartmentDoor(mockConn([unit]), testIdentity as never, {
        rowKey: "door-row",
        floorDocId: unit.floorDocId,
        level: unit.level,
        templateId: `${unit.unitId}|W|0`,
      }),
    ).toBe(true);
  });
});

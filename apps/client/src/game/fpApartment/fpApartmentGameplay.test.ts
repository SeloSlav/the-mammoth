import { describe, expect, it } from "vitest";
import {
  apartmentDoorMatchesContainingUnit,
  CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M,
  clientMayUseApartmentStash,
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

const otherIdentity = {
  isEqual: (other: unknown) => other === otherIdentity,
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
    expect(formatApartmentPublicLabel({ level: 12, unitId: "unit_w_005" })).toBe("Floor 11, West 5");
    expect(formatApartmentPublicLabel({ level: 2, unitId: "unit_e_008" })).toBe("Floor 1, East 8");
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

  it("offers apartment claim near an unclaimed wardrobe from inside that unit", () => {
    const unit = apartmentUnit({
      wardrobeX: 2,
      wardrobeZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    const prompt = getApartmentSystemPrompt(
      mockConn([unit], ["door-lock", "screwdriver"]),
      { x: 2.5, y: 10, z: 3.25 },
      { lookedAtWardrobeUnitKey: unit.unitKey },
    );
    expect(prompt).toEqual({ kind: "apartment_claim", unitKey: unit.unitKey });
  });

  it("blocks guest apartment claims even when claim gear is present", () => {
    const unit = apartmentUnit({
      wardrobeX: 2,
      wardrobeZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    const prompt = getApartmentSystemPrompt(
      mockConn([unit], ["door-lock", "screwdriver"]),
      { x: 2.5, y: 10, z: 3.25 },
      { apartmentClaimsAllowed: false, lookedAtWardrobeUnitKey: unit.unitKey },
    );
    expect(prompt).toEqual({ kind: "apartment_claim_blocked_guest", unitKey: unit.unitKey });
  });

  it("does not offer apartment claim through a wall from outside that unit", () => {
    const unit = apartmentUnit({
      wardrobeX: 6.25,
      wardrobeZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    const prompt = getApartmentSystemPrompt(
      mockConn([unit], ["door-lock", "screwdriver"]),
      { x: 6.35, y: 10, z: 3.1 },
      { lookedAtWardrobeUnitKey: unit.unitKey },
    );
    expect(prompt).toBeNull();
  });

  it("does not offer claim or gear prompts unless reticle aims at the wardrobe", () => {
    const unit = apartmentUnit({
      wardrobeX: 2,
      wardrobeZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    expect(
      getApartmentSystemPrompt(mockConn([unit], ["door-lock", "screwdriver"]), {
        x: 2.5,
        y: 10,
        z: 3.25,
      }),
    ).toBeNull();
    expect(
      getApartmentSystemPrompt(mockConn([unit]), { x: 2.5, y: 10, z: 3.25 }, {
        lookedAtWardrobeUnitKey: null,
      }),
    ).toBeNull();
  });

  it("blocked gear prompt requires aiming at wardrobe", () => {
    const unit = apartmentUnit({
      wardrobeX: 2,
      wardrobeZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    expect(
      getApartmentSystemPrompt(mockConn([unit], ["door-lock"]), { x: 2.5, y: 10, z: 3.25 }, {
        lookedAtWardrobeUnitKey: unit.unitKey,
      }),
    ).toEqual({ kind: "apartment_claim_blocked_gear", unitKey: unit.unitKey });
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

  it("offers owned footlocker stash near the footlocker from inside that unit", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 2,
      footZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    const prompt = getApartmentSystemPrompt(mockConn([unit]), { x: 2.2, y: 10, z: 3.1 });
    expect(prompt).toEqual({ kind: "apartment_stash", unitKey: unit.unitKey });
  });

  it("requires an explicit looked-at stash target when proximity stash prompts are disabled", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 2,
      footZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    const conn = mockConn([unit]);
    const pose = { x: 2.2, y: 10, z: 3.1 };
    expect(
      getApartmentSystemPrompt(conn, pose, {
        lookedAtStashUnitKey: null,
      }),
    ).toBeNull();
    expect(
      getApartmentSystemPrompt(conn, pose, {
        lookedAtStashUnitKey: unit.unitKey,
      }),
    ).toEqual({ kind: "apartment_stash", unitKey: unit.unitKey });
  });

  it("clientMayUseApartmentStash rejects owned stash unless feet are inside range", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 2,
      footZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    const conn = mockConn([unit]);
    expect(
      clientMayUseApartmentStash(conn, testIdentity as never, unit.unitKey, {
        x: 2.2,
        y: 10,
        z: 3.1,
      }),
    ).toBe(true);
    expect(
      clientMayUseApartmentStash(conn, testIdentity as never, unit.unitKey, {
        x: 6.35,
        y: 10,
        z: 3.1,
      }),
    ).toBe(false);
  });

  it("does not offer owned footlocker stash through a wall from outside that unit", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 6.25,
      footZ: 3,
      boundMinX: 0,
      boundMaxX: 6,
      boundMinZ: 0,
      boundMaxZ: 6,
    });
    const prompt = getApartmentSystemPrompt(mockConn([unit]), { x: 6.35, y: 10, z: 3.1 });
    expect(prompt).toBeNull();
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

  it("rejects a claimed apartment door for a different identity", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
    });
    expect(
      clientMayToggleApartmentDoor(mockConn([unit]), otherIdentity as never, {
        rowKey: "door-row",
        floorDocId: unit.floorDocId,
        level: unit.level,
        templateId: `${unit.unitId}|W|0`,
      }),
    ).toBe(false);
  });

  it("rejects a cross-hall door when feet are inside a different apartment unit", () => {
    const containingUnit = apartmentUnit({
      unitKey: "floor_a|2|unit_e_001",
      unitId: "unit_e_001",
      boundMinX: -12,
      boundMaxX: -1,
      boundMinZ: -3,
      boundMaxZ: 3,
    });
    const crossHallUnit = apartmentUnit({
      unitKey: "floor_a|2|unit_w_001",
      unitId: "unit_w_001",
      boundMinX: 1,
      boundMaxX: 12,
      boundMinZ: -3,
      boundMaxZ: 3,
    });
    const conn = mockConn([containingUnit, crossHallUnit]);
    expect(
      apartmentDoorMatchesContainingUnit(
        conn,
        { x: -4, y: 10, z: 0 },
        {
          floorDocId: "floor_a",
          level: 2,
          templateId: "unit_w_001|E|0",
        },
      ),
    ).toBe(false);
    expect(
      apartmentDoorMatchesContainingUnit(
        conn,
        { x: -4, y: 10, z: 0 },
        {
          floorDocId: "floor_a",
          level: 2,
          templateId: "unit_e_001|W|0",
        },
      ),
    ).toBe(true);
  });
});

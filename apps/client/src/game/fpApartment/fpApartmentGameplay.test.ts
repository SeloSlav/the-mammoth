import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("../../featureFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../featureFlags")>()),
  APARTMENT_CLAIM_UI_ENABLED: true,
}));

import {
  apartmentSittableSpecFromModelPath,
  OwnedApartmentBuiltinsDocSchema,
} from "@the-mammoth/schemas";
import {
  apartmentBuiltinStashInteractRadiusM,
  apartmentDoorMatchesContainingUnit,
  apartmentUnitContainingFeet,
  apartmentUnitContainingFeetSlack,
  aimedApartmentStashBlocksGrowTrayPrompt,
  CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M,
  clientMayUseApartmentSittable,
  clientMayUseApartmentStash,
  clientMayToggleApartmentDoor,
  feetDeepEnoughFromEntryDoor,
  formatApartmentPublicLabel,
  getApartmentSystemPrompt,
  residentInteriorPropsVisibleForViewer,
  residentUnitKeyFromDoor,
  residentUnitKeyFromParts,
  UNIT_STATE_CLAIMED,
  UNIT_STATE_UNCLAIMED,
} from "./fpApartmentGameplay";
import {
  resolveDecorStashKeyNear,
  resolveFishTankDecorStashKeyNear,
} from "./fpApartmentDecorStashKey.js";
import {
  apartmentStashKey,
  apartmentStashKeyDecor,
  APARTMENT_STASH_KIND_FISH_TANK,
  APARTMENT_STASH_KIND_FOOTLOCKER,
  APARTMENT_STASH_KIND_FRIDGE,
  APARTMENT_STASH_KIND_WATER_TANK,
  APARTMENT_STASH_KIND_STOVE,
  APARTMENT_STASH_KIND_WARDROBE,
} from "./fpApartmentStashKey";
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
    stoveX: 2,
    stoveZ: 2,
    boundMinX: 0,
    boundMaxX: 10,
    boundMinZ: 0,
    boundMaxZ: 10,
    boundMinY: 10,
    boundMaxY: 13,
    ...overrides,
  } as ApartmentUnit;
}

function mockConn(
  apartmentUnits: ApartmentUnit[],
  defIds: string[] = [],
  opts?: { apartmentUnitDecor?: unknown[] },
) {
  return {
    identity: testIdentity,
    db: {
      apartment_unit: apartmentUnits,
      apartment_door: [],
      apartment_door_gameplay: [],
      apartment_unit_decor: opts?.apartmentUnitDecor ?? [],
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
  it("residentInteriorPropsVisibleForViewer renders furniture only for viewer-owned claimed apartments", () => {
    const ownedLow = apartmentUnit({
      level: 5,
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
    });
    const claimedStranger = apartmentUnit({
      unitKey: "floor_a|2|unit_e_099",
      unitId: "unit_e_099",
      state: UNIT_STATE_CLAIMED,
      owner: otherIdentity as never,
    });
    const unclaimed = apartmentUnit({ state: UNIT_STATE_UNCLAIMED });
    expect(residentInteriorPropsVisibleForViewer(mockConn([ownedLow]), ownedLow)).toBe(true);
    expect(residentInteriorPropsVisibleForViewer(mockConn([claimedStranger]), claimedStranger)).toBe(false);
    expect(residentInteriorPropsVisibleForViewer(mockConn([unclaimed]), unclaimed)).toBe(false);
  });

  it("residentInteriorPropsVisibleForViewer is false without identity", () => {
    const owned = apartmentUnit({ state: UNIT_STATE_CLAIMED, owner: testIdentity as never });
    expect(residentInteriorPropsVisibleForViewer(undefined, owned)).toBe(false);
  });

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
    expect(prompt).toEqual({
      kind: "apartment_stash",
      stashKey: apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_FOOTLOCKER,
      stashLabel: "footlocker",
    });
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
    expect(prompt).toEqual({
      kind: "apartment_stash",
      stashKey: apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_FOOTLOCKER,
      stashLabel: "footlocker",
    });
  });

  it("suppresses proximity footlocker when camera line-of-sight is blocked", () => {
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
    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
    camera.position.set(2.2, 11, 3.1);
    camera.lookAt(2, 10.55, 3);
    camera.updateMatrixWorld(true);
    const prompt = getApartmentSystemPrompt(mockConn([unit]), { x: 2.2, y: 10, z: 3.1 }, {
      stashLos: {
        camera,
        stashRayOcclusion: {
          targetOccludedFromCamera: () => true,
        } as never,
      },
    });
    expect(prompt).toBeNull();
  });

  it("offers owned wardrobe stash near the wardrobe when not near the footlocker", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      wardrobeX: 5,
      wardrobeZ: 5,
      boundMinX: 0,
      boundMaxX: 10,
      boundMinZ: 0,
      boundMaxZ: 10,
    });
    const pose = { x: 5.2, y: 10, z: 5.1 };
    expect(getApartmentSystemPrompt(mockConn([unit]), pose)).toEqual({
      kind: "apartment_stash",
      stashKey: apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_WARDROBE),
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_WARDROBE,
      stashLabel: "wardrobe",
    });
    expect(
      clientMayUseApartmentStash(
        mockConn([unit]),
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_WARDROBE),
        pose,
      ),
    ).toBe(true);
    expect(
      clientMayUseApartmentStash(
        mockConn([unit]),
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
        pose,
      ),
    ).toBe(false);
  });

  it("offers owned stove stash near the stove anchor", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      wardrobeX: 2,
      wardrobeZ: 2,
      stoveX: 8,
      stoveZ: 8,
      boundMinX: 0,
      boundMaxX: 10,
      boundMinZ: 0,
      boundMaxZ: 10,
    });
    const pose = { x: 8.15, y: 10, z: 8.1 };
    expect(getApartmentSystemPrompt(mockConn([unit]), pose)).toEqual({
      kind: "apartment_stash",
      stashKey: apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_STOVE),
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_STOVE,
      stashLabel: "stove",
    });
    expect(
      clientMayUseApartmentStash(
        mockConn([unit]),
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_STOVE),
        pose,
      ),
    ).toBe(true);
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
        lookedAtStashKey: null,
      }),
    ).toBeNull();
    expect(
      getApartmentSystemPrompt(conn, pose, {
        lookedAtStashKey: apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
      }),
    ).toEqual({
      kind: "apartment_stash",
      stashKey: apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_FOOTLOCKER,
      stashLabel: "footlocker",
    });
  });

  it("permits stash use for replica decor-instance keys near that decor row", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      wardrobeX: 9,
      wardrobeZ: 9,
      boundMinX: 0,
      boundMaxX: 20,
      boundMinZ: 0,
      boundMaxZ: 20,
    });
    const decor = {
      decorId: 42n,
      unitKey: unit.unitKey,
      itemKind: 2,
      modelRelPath: "static/models/objects/wardrobe-closet.glb",
      posX: 5,
      posY: 10,
      posZ: 5,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: 1,
    };
    const conn = mockConn([unit], [], { apartmentUnitDecor: [decor] });
    const pose = { x: 5.05, y: 10, z: 5.05 };
    const key = apartmentStashKeyDecor(unit.unitKey, 42n);
    expect(clientMayUseApartmentStash(conn, testIdentity as never, key, pose)).toBe(true);
    expect(
      getApartmentSystemPrompt(conn, pose, {
        lookedAtStashKey: key,
      }),
    ).toEqual({
      kind: "apartment_stash",
      stashKey: key,
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_WARDROBE,
      stashLabel: "wardrobe",
    });
  });

  it("offers fish tank stash via proximity when not aiming at the pick", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      boundMinX: 0,
      boundMaxX: 20,
      boundMinZ: 0,
      boundMaxZ: 20,
    });
    const decor = {
      decorId: 12n,
      unitKey: unit.unitKey,
      itemKind: 7,
      modelRelPath: "static/models/objects/fish-tank.glb",
      posX: 5,
      posY: 10,
      posZ: 6,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: 1,
    };
    const conn = mockConn([unit], [], { apartmentUnitDecor: [decor] });
    const pose = { x: 5.8, y: 10, z: 6.05 };
    expect(getApartmentSystemPrompt(conn, pose)).toEqual({
      kind: "apartment_stash",
      stashKey: apartmentStashKeyDecor(unit.unitKey, 12n),
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_FISH_TANK,
      stashLabel: "fish tank",
    });
  });

  it("permits stash use for fish tank decor rows with decor stash keys", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      boundMinX: 0,
      boundMaxX: 20,
      boundMinZ: 0,
      boundMaxZ: 20,
    });
    const decor = {
      decorId: 12n,
      unitKey: unit.unitKey,
      itemKind: 7,
      modelRelPath: "static/models/objects/fish-tank.glb",
      posX: 5,
      posY: 10,
      posZ: 6,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: 1,
    };
    const conn = mockConn([unit], [], { apartmentUnitDecor: [decor] });
    const pose = { x: 5.8, y: 10, z: 6.05 };
    const key = apartmentStashKeyDecor(unit.unitKey, 12n);
    expect(clientMayUseApartmentStash(conn, testIdentity as never, key, pose)).toBe(true);
    expect(
      getApartmentSystemPrompt(conn, pose, {
        lookedAtStashKey: key,
      }),
    ).toEqual({
      kind: "apartment_stash",
      stashKey: key,
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_FISH_TANK,
      stashLabel: "fish tank",
    });
  });

  it("permits stash use for fridge decor rows with their own stash kind", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      stoveX: 9,
      stoveZ: 9,
      boundMinX: 0,
      boundMaxX: 20,
      boundMinZ: 0,
      boundMaxZ: 20,
    });
    const decor = {
      decorId: 77n,
      unitKey: unit.unitKey,
      itemKind: 5,
      modelRelPath: "static/models/objects/fridge.glb",
      posX: 3,
      posY: 10,
      posZ: 4,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: 1,
    };
    const conn = mockConn([unit], [], { apartmentUnitDecor: [decor] });
    const pose = { x: 3.05, y: 10, z: 4.05 };
    const key = apartmentStashKeyDecor(unit.unitKey, 77n);
    expect(clientMayUseApartmentStash(conn, testIdentity as never, key, pose)).toBe(true);
    expect(
      getApartmentSystemPrompt(conn, pose, {
        lookedAtStashKey: key,
      }),
    ).toEqual({
      kind: "apartment_stash",
      stashKey: key,
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_FRIDGE,
      stashLabel: "fridge",
    });
  });

  it("offers water tank stash from builtins json like fridge when no decor row exists", async () => {
    const builtinsMod = await import("./fpOwnedApartmentBuiltinsFromContent.js");
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      boundMinX: 0,
      boundMaxX: 20,
      boundMinZ: 0,
      boundMaxZ: 20,
    });
    const doc = OwnedApartmentBuiltinsDocSchema.parse({
      version: 2,
      previewSizeM: 10,
      placedItems: [
        {
          id: "test_water_tank",
          modelRelPath: "static/models/objects/water-tank.glb",
          fx: 0.3,
          fz: 0.4,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "water_tank",
        },
      ],
      wallItems: [],
      mirrorItems: [],
      objectGroups: [],
    });
    const anchor = builtinsMod.resolveApartmentDecorPoses(unit, doc).find(
      (p) => p.itemKind === "water_tank",
    )!;
    vi.spyOn(builtinsMod, "peekOwnedApartmentBuiltinsDoc").mockReturnValue(doc);
    const conn = mockConn([unit]);
    const pose = { x: anchor.x + 0.05, y: 10, z: anchor.z + 0.05 };
    expect(getApartmentSystemPrompt(conn, pose)).toEqual({
      kind: "apartment_stash",
      stashKey: apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_WATER_TANK),
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_WATER_TANK,
      stashLabel: "water tank",
    });
    vi.restoreAllMocks();
  });

  it("permits stash use for water tank when replica itemKind is stale plain", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 1,
      footZ: 1,
      boundMinX: 0,
      boundMaxX: 20,
      boundMinZ: 0,
      boundMaxZ: 20,
    });
    const decor = {
      decorId: 88n,
      unitKey: unit.unitKey,
      itemKind: 0,
      modelRelPath: "static/models/objects/water-tank.glb",
      posX: 6,
      posY: 10,
      posZ: 7,
      yawRad: 0,
      pitchRad: 0,
      rollRad: 0,
      uniformScale: 1,
    };
    const conn = mockConn([unit], [], { apartmentUnitDecor: [decor] });
    const pose = { x: 6.05, y: 10, z: 7.05 };
    const key = apartmentStashKeyDecor(unit.unitKey, 88n);
    expect(clientMayUseApartmentStash(conn, testIdentity as never, key, pose)).toBe(true);
    expect(
      getApartmentSystemPrompt(conn, pose, {
        lookedAtStashKey: key,
      }),
    ).toEqual({
      kind: "apartment_stash",
      stashKey: key,
      unitKey: unit.unitKey,
      stashKind: APARTMENT_STASH_KIND_WATER_TANK,
      stashLabel: "water tank",
    });
  });

  it("rejects stash use when feet are inside the unit hull but beyond per-piece horizontal reach", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      footX: 2,
      footZ: 3,
      wardrobeX: 5,
      wardrobeZ: 5,
      stoveX: 8,
      stoveZ: 8,
      boundMinX: 0,
      boundMaxX: 12,
      boundMinZ: 0,
      boundMaxZ: 12,
    });
    const conn = mockConn([unit]);
    const footR = apartmentBuiltinStashInteractRadiusM(APARTMENT_STASH_KIND_FOOTLOCKER);
    const farFootX = 2 + footR + 0.08;
    expect(
      clientMayUseApartmentStash(
        conn,
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
        { x: farFootX, y: 10, z: 3 },
      ),
    ).toBe(false);

    const wardR = apartmentBuiltinStashInteractRadiusM(APARTMENT_STASH_KIND_WARDROBE);
    const farWardX = 5 + wardR + 0.08;
    expect(
      clientMayUseApartmentStash(
        conn,
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_WARDROBE),
        { x: farWardX, y: 10, z: 5 },
      ),
    ).toBe(false);

    const stoveR = apartmentBuiltinStashInteractRadiusM(APARTMENT_STASH_KIND_STOVE);
    const farStoveX = 8 + stoveR + 0.08;
    expect(
      clientMayUseApartmentStash(
        conn,
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_STOVE),
        { x: farStoveX, y: 10, z: 8 },
      ),
    ).toBe(false);
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
      clientMayUseApartmentStash(
        conn,
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
        {
          x: 2.2,
          y: 10,
          z: 3.1,
        },
      ),
    ).toBe(true);
    expect(
      clientMayUseApartmentStash(
        conn,
        testIdentity as never,
        apartmentStashKey(unit.unitKey, APARTMENT_STASH_KIND_FOOTLOCKER),
        {
          x: 6.35,
          y: 10,
          z: 3.1,
        },
      ),
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

  it("strict feet hull does not treat cross-hall doorway positions as in-unit", () => {
    const westUnit = apartmentUnit({
      unitKey: "floor_a|2|unit_w_001",
      unitId: "unit_w_001",
      boundMinX: -12,
      boundMaxX: -1,
      boundMinZ: -3,
      boundMaxZ: 3,
    });
    const eastUnit = apartmentUnit({
      unitKey: "floor_a|2|unit_e_001",
      unitId: "unit_e_001",
      boundMinX: 1,
      boundMaxX: 12,
      boundMinZ: -3,
      boundMaxZ: 3,
    });
    const conn = mockConn([westUnit, eastUnit]);

    expect(apartmentUnitContainingFeet(conn, -0.25, 10, 0)).toBeNull();
    expect(
      apartmentUnitContainingFeetSlack(conn, -0.25, 10, 0, { slackXZ: 0.85 })?.unitKey,
    ).toBe(westUnit.unitKey);
  });

  it("visual containment slack keeps edge-of-unit feet inside without bridging a cross-hall gap", () => {
    const westUnit = apartmentUnit({
      unitKey: "floor_a|2|unit_w_001",
      unitId: "unit_w_001",
      boundMinX: -12,
      boundMaxX: -1,
      boundMinZ: -3,
      boundMaxZ: 3,
    });
    const eastUnit = apartmentUnit({
      unitKey: "floor_a|2|unit_e_001",
      unitId: "unit_e_001",
      boundMinX: 1,
      boundMaxX: 12,
      boundMinZ: -3,
      boundMaxZ: 3,
    });
    const conn = mockConn([westUnit, eastUnit]);

    expect(
      apartmentUnitContainingFeetSlack(conn, -0.25, 10, 0, {
        slackXZ: 0.85,
        slackYBelow: 1.25,
        slackYAbove: 2.85,
      })?.unitKey,
    ).toBe(westUnit.unitKey);
    expect(
      apartmentUnitContainingFeetSlack(conn, 0, 10, 0, {
        slackXZ: 0.85,
        slackYBelow: 1.25,
        slackYAbove: 2.85,
      }),
    ).toBeNull();
  });

  it("permits sittable use only within the seat interact cylinder in an owned claimed unit", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
      boundMinX: 0,
      boundMaxX: 10,
      boundMinZ: 0,
      boundMaxZ: 10,
    });
    const spec = apartmentSittableSpecFromModelPath("static/models/objects/chair.glb");
    expect(spec).not.toBeNull();
    const conn = mockConn([unit]);
    const anchorX = 4;
    const anchorZ = 5;
    const radiusM = spec!.interactRadiusM;
    expect(
      clientMayUseApartmentSittable(conn, testIdentity as never, unit.unitKey, { x: 4.2, y: 10, z: 5.1 }, anchorX, anchorZ, radiusM),
    ).toBe(true);
    expect(
      clientMayUseApartmentSittable(conn, testIdentity as never, unit.unitKey, { x: 8, y: 10, z: 8 }, anchorX, anchorZ, radiusM),
    ).toBe(false);
  });

  /** East-bay façade boxes abut in Z; centroid containment can disagree with hull membership. */
  it("still matches the door hull when centroid picks another overlapping east unit", () => {
    const unitA = apartmentUnit({
      unitKey: "floor_a|2|unit_e_003",
      unitId: "unit_e_003",
      boundMinX: 2,
      boundMaxX: 14,
      boundMinZ: -10,
      boundMaxZ: -3,
    });
    const unitB = apartmentUnit({
      unitKey: "floor_a|2|unit_e_004",
      unitId: "unit_e_004",
      boundMinX: 2,
      boundMaxX: 14,
      boundMinZ: -8,
      boundMaxZ: 4,
    });
    const conn = mockConn([unitA, unitB]);
    /** Overlap wedge where centroid picks {@link unitB} but feet still lie in {@link unitA}'s Z span. */
    const xz = { x: 8, y: 10.5, z: -3.25 };
    expect(apartmentDoorMatchesContainingUnit(conn, xz, { floorDocId: "floor_a", level: 2, templateId: "unit_e_003|w" })).toBe(
      true,
    );
  });
});

describe("resolveDecorStashKeyNear", () => {
  it("binds layout stash picks to the nearest matching decor row", () => {
    const unit = apartmentUnit({
      state: UNIT_STATE_CLAIMED,
      owner: testIdentity as never,
    });
    const conn = mockConn([unit], [], {
      apartmentUnitDecor: [
        {
          decorId: 12n,
          unitKey: unit.unitKey,
          itemKind: 7,
          modelRelPath: "static/models/objects/fish-tank.glb",
          posX: 5,
          posY: 10,
          posZ: 6,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 0.24,
        },
      ],
    });
    expect(resolveDecorStashKeyNear(
      conn,
      unit.unitKey,
      APARTMENT_STASH_KIND_FISH_TANK,
      5.05,
      6.05,
    )).toBe(
      apartmentStashKeyDecor(unit.unitKey, 12n),
    );
    expect(resolveDecorStashKeyNear(
      conn,
      unit.unitKey,
      APARTMENT_STASH_KIND_FISH_TANK,
      5.35,
      6.35,
    )).toBe(
      apartmentStashKeyDecor(unit.unitKey, 12n),
    );
    expect(resolveDecorStashKeyNear(
      conn,
      unit.unitKey,
      APARTMENT_STASH_KIND_FISH_TANK,
      9,
      9,
    )).toBeNull();
    expect(resolveFishTankDecorStashKeyNear(conn, unit.unitKey, 5.05, 6.05)).toBe(
      apartmentStashKeyDecor(unit.unitKey, 12n),
    );
  });
});

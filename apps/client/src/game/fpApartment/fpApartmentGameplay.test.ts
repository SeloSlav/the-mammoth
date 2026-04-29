import { describe, expect, it } from "vitest";
import {
  CLAIM_MIN_DEPTH_FROM_ENTRY_DOOR_M,
  feetDeepEnoughFromEntryDoor,
  formatApartmentPublicLabel,
  residentUnitKeyFromDoor,
  residentUnitKeyFromParts,
} from "./fpApartmentGameplay";
import type { ApartmentDoor } from "../../module_bindings/types";

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
});

import { describe, expect, it } from "vitest";
import { apartmentStashLocationsMatch } from "./apartmentStashLocationMatch.js";

const noDecor: () => null = () => null;
const footlockerDecor: (unitKey: string, decorId: bigint) => "footlocker" | null = (
  unitKey,
  decorId,
) => (unitKey === "u1" && decorId === 7n ? "footlocker" : null);
const wardrobeDecor: (unitKey: string, decorId: bigint) => "wardrobe" | null = (
  unitKey,
  decorId,
) => (unitKey === "u1" && decorId === 9n ? "wardrobe" : null);

describe("apartmentStashLocationsMatch", () => {
  it("aliases bare, legacy footlocker, and decor footlocker on the same unit", () => {
    const resolve = footlockerDecor;
    expect(apartmentStashLocationsMatch("u1", "u1#footlocker", resolve)).toBe(true);
    expect(apartmentStashLocationsMatch("u1#footlocker", "u1#d7", resolve)).toBe(true);
    expect(apartmentStashLocationsMatch("u1", "u1#d7", resolve)).toBe(true);
  });

  it("does not merge distinct decor footlocker instances", () => {
    const resolve = (unitKey: string, decorId: bigint) =>
      unitKey === "u1" ? "footlocker" : null;
    expect(apartmentStashLocationsMatch("u1#d7", "u1#d8", resolve)).toBe(false);
  });

  it("does not alias wardrobe decor with footlocker legacy", () => {
    expect(apartmentStashLocationsMatch("u1#d9", "u1#footlocker", wardrobeDecor)).toBe(false);
    expect(apartmentStashLocationsMatch("u1#wardrobe", "u1#d9", wardrobeDecor)).toBe(true);
  });

  it("matches legacy wardrobe keys exactly", () => {
    expect(apartmentStashLocationsMatch("u1#wardrobe", "u1#wardrobe", noDecor)).toBe(true);
    expect(apartmentStashLocationsMatch("u1#wardrobe", "u1#footlocker", noDecor)).toBe(false);
  });

  it("matches grow-tray stash keys exactly per tray", () => {
    const keyA = "u1#grow_tray:8e48c06b-c005-4425-9fdc-a527e67168ee";
    const keyB = "u1#grow_tray:825bca36-e9b8-4fa7-9883-2d57ba0ebe04";
    expect(apartmentStashLocationsMatch(keyA, keyA, noDecor)).toBe(true);
    expect(apartmentStashLocationsMatch(keyA, keyB, noDecor)).toBe(false);
  });

  it("fish tank stashes require matching decor instance ids", () => {
    const fishTankDecor = (unitKey: string, decorId: bigint) =>
      unitKey === "u1" && decorId === 12n ? "fish_tank" : null;
    expect(apartmentStashLocationsMatch("u1#d12", "u1#d12", fishTankDecor)).toBe(true);
    expect(apartmentStashLocationsMatch("u1#d12", "u1#d13", fishTankDecor)).toBe(false);
    expect(apartmentStashLocationsMatch("u1#fish_tank", "u1#d12", fishTankDecor)).toBe(false);
  });
});

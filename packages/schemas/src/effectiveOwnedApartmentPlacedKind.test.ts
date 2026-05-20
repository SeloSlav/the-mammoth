import { describe, expect, it } from "vitest";
import {
  APARTMENT_UNIT_DECOR_ITEM_KIND_PLAIN,
  OWNED_APARTMENT_MODEL_WATER_TANK,
  effectiveOwnedApartmentPlacedKind,
} from "./ownedApartmentBuiltins";

describe("effectiveOwnedApartmentPlacedKind", () => {
  it("upgrades plain replica rows when the GLB is a known gameplay prop", () => {
    expect(
      effectiveOwnedApartmentPlacedKind(
        APARTMENT_UNIT_DECOR_ITEM_KIND_PLAIN,
        OWNED_APARTMENT_MODEL_WATER_TANK,
      ),
    ).toBe("water_tank");
  });
});

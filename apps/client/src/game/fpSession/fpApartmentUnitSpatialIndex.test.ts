import { describe, expect, it } from "vitest";
import { createApartmentUnitSpatialIndex } from "./fpApartmentUnitSpatialIndex.js";

describe("createApartmentUnitSpatialIndex", () => {
  it("returns nearest unit hull containing feet", () => {
    const index = createApartmentUnitSpatialIndex();
    index.rebuild([
      {
        unitKey: "unit_a",
        unitId: "a",
        level: 1,
        boundMinX: 0,
        boundMaxX: 4,
        boundMinY: 0,
        boundMaxY: 3,
        boundMinZ: 0,
        boundMaxZ: 4,
      } as never,
      {
        unitKey: "unit_b",
        unitId: "b",
        level: 1,
        boundMinX: 10,
        boundMaxX: 14,
        boundMinY: 0,
        boundMaxY: 3,
        boundMinZ: 0,
        boundMaxZ: 4,
      } as never,
    ]);
    expect(index.unitAtFeet(2, 1, 2)?.unitKey).toBe("unit_a");
    expect(index.unitAtFeet(12, 1, 2)?.unitKey).toBe("unit_b");
    expect(index.unitAtFeet(6, 1, 2)).toBeNull();
  });
});

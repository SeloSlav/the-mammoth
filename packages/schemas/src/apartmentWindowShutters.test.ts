import { describe, expect, it } from "vitest";
import {
  adaptStandardWindowShutterPlacementForUnit,
  APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES,
  apartmentUnitQualifiesForStandardWindowShutters,
  mergeStandardApartmentWindowShuttersIntoPlacedItems,
  standardApartmentWindowShutterPlacedItemsForUnit,
} from "./apartmentWindowShutters.js";

describe("apartmentWindowShutters", () => {
  it("qualifies typical residential units on display floors 13–19 only", () => {
    expect(apartmentUnitQualifiesForStandardWindowShutters("floor_mamutica_typical|14|unit_e_003")).toBe(
      true,
    );
    expect(apartmentUnitQualifiesForStandardWindowShutters("floor_mamutica_typical|20|unit_w_011")).toBe(
      true,
    );
    expect(apartmentUnitQualifiesForStandardWindowShutters("floor_mamutica_typical|13|unit_e_003")).toBe(
      false,
    );
    expect(apartmentUnitQualifiesForStandardWindowShutters("floor_mamutica_typical|21|unit_e_003")).toBe(
      false,
    );
    expect(apartmentUnitQualifiesForStandardWindowShutters("floor_mamutica_typical|18|manual_e_001")).toBe(
      false,
    );
  });

  it("keeps east reference fx on west rows until bounds-aware finalize runs", () => {
    const east = standardApartmentWindowShutterPlacedItemsForUnit("unit_e_003");
    const west = standardApartmentWindowShutterPlacedItemsForUnit("unit_w_003");
    expect(east).toHaveLength(2);
    expect(west).toHaveLength(2);
    expect(west[0]!.fx).toBeCloseTo(east[0]!.fx, 6);
    expect(west[0]!.fx).not.toBeCloseTo(1 - east[0]!.fx, 3);
    expect(west[0]!.fz).toBeCloseTo(east[0]!.fz, 6);
    expect(west[0]!.yawRad).toBeCloseTo(-east[0]!.yawRad, 6);
    expect(APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES).toHaveLength(2);
  });

  it("replaces authored shutters with canonical placements for qualifying units", () => {
    const merged = mergeStandardApartmentWindowShuttersIntoPlacedItems(
      "floor_mamutica_typical|20|unit_e_003",
      "unit_e_003",
      [
        {
          id: "old-shutter",
          modelRelPath: "static/models/objects/window-shutter.glb",
          fx: 0.5,
          fz: 0.5,
          dy: 1,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          verticalScaleMul: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
        {
          id: "keep-chair",
          modelRelPath: "static/models/objects/chair.glb",
          fx: 0.2,
          fz: 0.3,
          dy: 0.1,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 0.5,
          verticalScaleMul: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
    );
    expect(merged.filter((item) => item.modelRelPath.endsWith("window-shutter.glb"))).toHaveLength(2);
    expect(merged.some((item) => item.id === "old-shutter")).toBe(false);
    expect(merged.some((item) => item.id === "keep-chair")).toBe(true);
    expect(merged[2]!.fx).toBeCloseTo(
      adaptStandardWindowShutterPlacementForUnit(
        {
          id: "mammoth_standard_window_shutter_0",
          fx: 0.9774696707105718,
          fz: 0.1754260738235218,
          dy: 1.7568053722194503,
          yawRad: -Math.PI / 2,
          uniformScale: 1.686652591805788,
        },
        "unit_e_003",
      ).fx,
      6,
    );
  });
});

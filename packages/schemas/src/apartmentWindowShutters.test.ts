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
    expect(APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES[0]).toMatchObject({
      fx: 0.9774696707105714,
      fz: 0.16169746083300776,
      dy: 1.601049521076354,
      uniformScale: 1.7485030380530002,
      verticalScaleMul: 0.8024663311843774,
      scaleX: 1.8103534843002127,
      scaleY: 1.4031148180111288,
      scaleZ: 1.686652591805788,
    });
    expect(APARTMENT_STANDARD_WINDOW_SHUTTER_EAST_TEMPLATES[1]).toMatchObject({
      fx: 0.9774696707105714,
      fz: 0.6699791785869178,
      dy: 1.602608473496812,
      uniformScale: 1.6498272281962265,
      verticalScaleMul: 0.8499628264360659,
      scaleX: 1.6130018645866648,
      scaleY: 1.402291814008845,
      scaleZ: 1.686652591805788,
    });
  });

  it("uses authored shutter rows as the canonical replicated template", () => {
    const authored = [
      {
        id: "authored-shutter-a",
        modelRelPath: "static/models/objects/window-shutter.glb",
        fx: 0.96,
        fz: 0.18,
        dy: 1.81,
        yawRad: -Math.PI / 2,
        pitchRad: 0.01,
        rollRad: -0.02,
        uniformScale: 1.7,
        verticalScaleMul: 1.02,
        scaleX: 1.69,
        scaleY: 1.72,
        scaleZ: 1.68,
        ignoreSupportSurfaces: false,
        itemKind: "plain",
      },
    ] as const;
    const [west] = standardApartmentWindowShutterPlacedItemsForUnit("unit_w_003", authored);
    expect(west).toMatchObject({
      id: "authored-shutter-a",
      fx: 0.96,
      fz: 0.18,
      dy: 1.81,
      yawRad: Math.PI / 2,
      pitchRad: 0.01,
      rollRad: -0.02,
      uniformScale: 1.7,
      verticalScaleMul: 1.02,
      scaleX: 1.69,
      scaleY: 1.72,
      scaleZ: 1.68,
    });
  });

  it("replicates authored shutter placements for qualifying units", () => {
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
    expect(merged.filter((item) => item.modelRelPath.endsWith("window-shutter.glb"))).toHaveLength(1);
    expect(merged.some((item) => item.id === "old-shutter")).toBe(true);
    expect(merged.some((item) => item.id === "keep-chair")).toBe(true);
    expect(merged[1]!.fx).toBeCloseTo(
      adaptStandardWindowShutterPlacementForUnit(
        {
          id: "old-shutter",
          fx: 0.5,
          fz: 0.5,
          dy: 1,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          verticalScaleMul: 1,
        },
        "unit_e_003",
      ).fx,
      6,
    );
  });
});

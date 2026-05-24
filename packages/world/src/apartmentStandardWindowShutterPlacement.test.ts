import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FloorDocSchema } from "@the-mammoth/schemas";
import {
  apartmentDoorTemplateForUnit,
  resolveOwnedApartmentAuthoringPreviewLayout,
} from "./ownedApartmentEditorShell.js";
import { residentialUnitStrictBoundsXZ } from "./residentialUnitStrictBoundsXZ.js";
import {
  mapOwnedApartmentLayoutFractionToWorldX,
  mirrorEastBalconyWindowShutterFxForWestUnit,
} from "./residentialUnitBalcony.js";
import {
  balconyBayFacadeCladOuterLocalX,
  residentialBalconyBayFrame,
} from "./residentialUnitBalconyShell.js";
import { finalizeStandardWindowShutterPlacedItemsForUnit } from "./apartmentStandardWindowShutterPlacement.js";

const EAST_FX = 0.9774696707105718;

function readTypicalFloorDoc() {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  );
  return FloorDocSchema.parse(raw);
}

describe("mirrorEastBalconyWindowShutterFxForWestUnit", () => {
  it("places west shutters on the bay exterior, not the interior partition", () => {
    const floor = readTypicalFloorDoc();
    const unitId = "unit_w_003";
    const template = apartmentDoorTemplateForUnit({ floorDocId: floor.id, unitId })!;
    const xz = residentialUnitStrictBoundsXZ(template);
    const placed = floor.objects.find((o) => o.id === unitId)!;
    const prefabOriginX = placed.position[0]! - placed.scale![0]! * 0.5;
    const fx = mirrorEastBalconyWindowShutterFxForWestUnit(
      EAST_FX,
      xz.minX,
      xz.maxX,
      unitId,
    );
    const previewShutterX =
      mapOwnedApartmentLayoutFractionToWorldX(xz.minX, xz.maxX, unitId, fx) -
      prefabOriginX;
    expect(previewShutterX).toBeLessThan(-1);
  });

  it("matches east shutter inset from the bay façade on west units", () => {
    const floor = readTypicalFloorDoc();
    for (const unitId of ["unit_e_003", "unit_w_003"] as const) {
      const template = apartmentDoorTemplateForUnit({ floorDocId: floor.id, unitId })!;
      const xz = residentialUnitStrictBoundsXZ(template);
      const placed = floor.objects.find((o) => o.id === unitId)!;
      const prefabOriginX = placed.position[0] - placed.scale![0]! * 0.5;
      const layout = resolveOwnedApartmentAuthoringPreviewLayout({
        floorDoc: floor,
        homeBandStoryLevelIndex: 20,
        canonicalUnitId: unitId,
      })!;
      const frame = residentialBalconyBayFrame(unitId, placed.scale![0]!, placed.scale![2]!)!;
      const previewWindowOuterX = layout.shellPlan.hx + balconyBayFacadeCladOuterLocalX(frame);
      const fx =
        unitId === "unit_w_003"
          ? mirrorEastBalconyWindowShutterFxForWestUnit(
              EAST_FX,
              xz.minX,
              xz.maxX,
              unitId,
            )
          : EAST_FX;
      const previewShutterX =
        mapOwnedApartmentLayoutFractionToWorldX(xz.minX, xz.maxX, unitId, fx) -
        prefabOriginX;
      const gap = Math.abs(previewShutterX - previewWindowOuterX);
      expect(gap).toBeLessThan(0.25);
    }
  });
});

describe("finalizeStandardWindowShutterPlacedItemsForUnit", () => {
  it("rewrites west shutter fx from the east reference template", () => {
    const template = apartmentDoorTemplateForUnit({
      floorDocId: "floor_mamutica_typical",
      unitId: "unit_w_003",
    })!;
    const xz = residentialUnitStrictBoundsXZ(template);
    const [item] = finalizeStandardWindowShutterPlacedItemsForUnit(
      "unit_w_003",
      [
        {
          id: "mammoth_standard_window_shutter_0",
          modelRelPath: "static/models/objects/window-shutter.glb",
          fx: EAST_FX,
          fz: 0.2,
          dy: 1.75,
          yawRad: Math.PI / 2,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1.68,
          verticalScaleMul: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain",
        },
      ],
      xz.minX,
      xz.maxX,
    );
    expect(item!.fx).toBeCloseTo(1 - EAST_FX, 3);
    expect(item!.fx).toBeGreaterThan(0);
  });
});

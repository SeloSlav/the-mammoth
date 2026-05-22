import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC, FloorDocSchema } from "@the-mammoth/schemas";
import {
  collectApartmentWindowLightSpecsFromRoot,
  type ApartmentPracticalLightSpec,
} from "@the-mammoth/engine";
import {
  listOwnedApartmentAuthoringPreviewUnits,
  resolveOwnedApartmentAuthoringPreviewLayout,
} from "@the-mammoth/world";
import { buildOwnedApartmentAuthoringShell } from "./editorMyApartmentAuthoringShell.js";

function readTypicalFloorDoc() {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  );
  return FloorDocSchema.parse(raw);
}

/** Mirrors editor mount: single-unit authoring shell, no megablock bounds cull. */
function windowLightCountForPreviewUnit(unitId: string): number {
  const floor = readTypicalFloorDoc();
  const building = {
    floorRefs: [{ floorDocId: floor.id, levelIndex: 20 }],
  } as const;
  const shell = buildOwnedApartmentAuthoringShell({
    ownedApartmentBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
    typicalFloorDoc: floor,
    building: building as never,
    previewUnitId: unitId,
  });
  const layout = resolveOwnedApartmentAuthoringPreviewLayout({
    floorDoc: floor,
    homeBandStoryLevelIndex: 20,
    canonicalUnitId: unitId,
  });
  if (!layout) return 0;
  shell.updateMatrixWorld(true);
  const specs: ApartmentPracticalLightSpec[] = [];
  collectApartmentWindowLightSpecsFromRoot(shell, specs);
  return specs.length;
}

describe("editor apartment window practical lights per preview unit", () => {
  it("derives window spots from each preview unit shell glass meshes", () => {
    const floor = readTypicalFloorDoc();
    const units = listOwnedApartmentAuthoringPreviewUnits(floor);
    expect(units.length).toBeGreaterThan(5);

    expect(windowLightCountForPreviewUnit("unit_e_003")).toBeGreaterThan(0);

    const missing = units
      .filter((u) => windowLightCountForPreviewUnit(u.unitId) === 0)
      .map((u) => u.unitId);
    expect(missing, `units missing window practical lights: ${missing.join(", ")}`).toEqual(
      [],
    );
  });
});

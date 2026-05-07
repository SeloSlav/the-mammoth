import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FloorDocSchema } from "@the-mammoth/schemas";
import { HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID } from "./ownedApartmentHomeBand.js";
import { resolveOwnedApartmentAuthoringPreviewLayout } from "./ownedApartmentEditorShell.js";

function readTypicalFloorDoc() {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  );
  return FloorDocSchema.parse(raw);
}

describe("owned apartment editor shell (game-derived)", () => {
  it("unit_e_003 west entry matches corridor adjacency carve + seeded façade openings", () => {
    const floor = readTypicalFloorDoc();
    const layout = resolveOwnedApartmentAuthoringPreviewLayout({
      floorDoc: floor,
      homeBandStoryLevelIndex: 99,
      facadeSalt: 1,
    });
    expect(layout).not.toBeNull();
    expect(layout!.canonicalUnitId).toBe(HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID);

    expect(layout!.spanX).toBeGreaterThan(8);
    expect(layout!.spanZ).toBeGreaterThan(5);

    const { shellPlan } = layout!;
    expect(shellPlan.corridorWallHoles?.w?.length ?? 0).toBeGreaterThan(0);

    expect(shellPlan.exteriorFaces).toContain("e");
    const win = shellPlan.exteriorWindowHoles;
    expect(win).toBeTruthy();
    const eastCount =
      (win!.e?.length ?? 0) +
      (win!.w?.length ?? 0) +
      (win!.n?.length ?? 0) +
      (win!.s?.length ?? 0);
    expect(eastCount).toBeGreaterThan(0);
  });
});

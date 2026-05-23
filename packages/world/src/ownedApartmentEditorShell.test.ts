import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FloorDocSchema } from "@the-mammoth/schemas";
import { HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID } from "./ownedApartmentHomeBand.js";
import { residentialBalconyPartitionFace } from "./residentialUnitBalcony.js";
import {
  appendOwnedApartmentEditorShellWalls,
  formatOwnedApartmentPreviewUnitKeyHeading,
  listOwnedApartmentAuthoringPreviewUnits,
  resolveOwnedApartmentAuthoringPreviewLayout,
} from "./ownedApartmentEditorShell.js";
import { floorPlaceholderMeshMaterials } from "./floorPlaceholderMeshMaterials.js";

function readTypicalFloorDoc() {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  );
  return FloorDocSchema.parse(raw);
}

describe("formatOwnedApartmentPreviewUnitKeyHeading", () => {
  it("includes residential floor and east/west wing label from composite key", () => {
    expect(
      formatOwnedApartmentPreviewUnitKeyHeading("floor_mamutica_typical|20|unit_e_003"),
    ).toBe("Floor 19, East 3");
    expect(
      formatOwnedApartmentPreviewUnitKeyHeading("any|2|unit_w_004", "unit_w_004"),
    ).toBe("Floor 1, West 4");
  });

  it("clamps ground story to residential floor 1", () => {
    expect(formatOwnedApartmentPreviewUnitKeyHeading("f|1|unit_e_001")).toBe("Floor 1, East 1");
  });

  it("falls back to unit id when key is not pipe-delimited", () => {
    expect(formatOwnedApartmentPreviewUnitKeyHeading("bogus", "unit_e_010")).toBe("East 10");
    expect(formatOwnedApartmentPreviewUnitKeyHeading("", "custom_unit_id")).toBe("CUSTOM UNIT ID");
  });
});

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
    expect(shellPlan.windowFacesForGlass).not.toContain("e");
    const win = shellPlan.exteriorWindowHoles;
    expect(win).toBeTruthy();
    expect(win!.e?.length ?? 0).toBe(0);
    const openingCount =
      (win!.w?.length ?? 0) +
      (win!.n?.length ?? 0) +
      (win!.s?.length ?? 0);
    expect(openingCount).toBeGreaterThan(0);
    expect(shellPlan.wallSpanX?.max).toBeCloseTo(7, 3);
  });

  it("appendOwnedApartmentEditorShellWalls adds exterior concrete cladding on exposed faces", () => {
    const floor = readTypicalFloorDoc();
    const layout = resolveOwnedApartmentAuthoringPreviewLayout({
      floorDoc: floor,
      homeBandStoryLevelIndex: 99,
      facadeSalt: 1,
    });
    expect(layout).not.toBeNull();

    const group = new THREE.Group();
    const partitionFace = residentialBalconyPartitionFace(
      layout!.canonicalUnitId,
    );
    appendOwnedApartmentEditorShellWalls(
      group,
      layout!.shellPlan,
      floorPlaceholderMeshMaterials.unitWall,
      floorPlaceholderMeshMaterials.unitExteriorWall,
      partitionFace ? { openFaces: [partitionFace] } : undefined,
    );

    const claddingNames: string[] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name.startsWith("shell_exterior_cladding")) {
        claddingNames.push(o.name);
      }
    });
    expect(claddingNames.length).toBeGreaterThan(0);
    for (const face of layout!.shellPlan.exteriorFaces) {
      if (face === partitionFace) continue;
      expect(
        claddingNames.some((n) => n.startsWith(`shell_exterior_cladding_${face}`)),
      ).toBe(true);
    }
    expect(
      group.children.some((c) => c.name === "editor_ref_shell_wall_e"),
    ).toBe(false);
  });

  it("lists every residential slab with a corridor door template on the typical plate", () => {
    const floor = readTypicalFloorDoc();
    const units = listOwnedApartmentAuthoringPreviewUnits(floor);
    expect(units.length).toBeGreaterThan(10);
    expect(units.some((u) => u.unitId === HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID)).toBe(
      true,
    );
    expect(
      units.find((u) => u.unitId === HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID)?.isPlayerSpawnHome,
    ).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FloorDocSchema } from "@the-mammoth/schemas";
import { buildFloorMeshes } from "@the-mammoth/world";
import { hideUnitInteriorMeshesForAuthView } from "../../ui/mammothAuthBackdropInteriorVisibility.js";
import { mergeMegablockStaticDirectChildYielding } from "./fpSessionStaticFloorMerge.js";

function readTypicalFloorDoc() {
  const raw = JSON.parse(
    readFileSync(
      new URL("../../../../../content/building/floors/floor_mamutica_typical.json", import.meta.url),
      "utf8",
    ),
  );
  return FloorDocSchema.parse(raw);
}

type GlassStat = {
  name: string;
  unitId: string;
  face: string;
  visible: boolean;
  frustumCulled: boolean;
  residentialGlass: boolean;
  unitInterior: boolean;
  worldX: number;
};

function collectGlassStats(root: THREE.Object3D): GlassStat[] {
  const out: GlassStat[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const isGlass =
      obj.name.startsWith("unit_exterior_glass_") ||
      (obj.name.startsWith("merged_unit_shell:") &&
        obj.userData.mammothResidentialUnitExteriorGlass === true);
    if (!isGlass) return;
    const pos = new THREE.Vector3();
    obj.getWorldPosition(pos);
    const faceMatch = obj.name.match(/_glass_([ewns])_/);
    const faceFromMerged =
      obj.geometry.boundingBox && obj.name.startsWith("merged_unit_shell:")
        ? "merged"
        : null;
    out.push({
      name: obj.name,
      unitId: String(obj.userData.mammothPlacedObjectId ?? ""),
      face: faceMatch?.[1] ?? faceFromMerged ?? "?",
      visible: obj.visible,
      frustumCulled: obj.frustumCulled,
      residentialGlass: obj.userData.mammothResidentialUnitExteriorGlass === true,
      unitInterior: obj.userData.mammothUnitInterior === true,
      worldX: pos.x,
    });
  });
  return out;
}

describe("auth backdrop unit corner glass", () => {
  it("keeps typical-floor unit south corner glass visible after merge + auth hide pass", async () => {
    const floor = readTypicalFloorDoc();
    const plate = buildFloorMeshes(floor, { storyLevelIndex: 18, facadeSalt: 1 });
    plate.userData.mammothPlateLevelIndex = 18;
    plate.updateMatrixWorld(true);

    const beforeMerge = collectGlassStats(plate);
    const unitSouthCorner = beforeMerge.filter(
      (g) => g.unitId.startsWith("unit_") && g.name.includes("_glass_s_"),
    );
    expect(unitSouthCorner.length).toBeGreaterThan(0);

    const unitE003 = plate.getObjectByName("unit_e_003");
    expect(unitE003).toBeTruthy();
    let unitE003SouthGlassLocalX = 0;
    unitE003!.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.name.includes("unit_exterior_glass_s_")) return;
      unitE003SouthGlassLocalX = obj.position.x;
    });
    expect(unitE003SouthGlassLocalX).toBeGreaterThan(4.5);

    await mergeMegablockStaticDirectChildYielding(plate, async () => {});
    plate.updateMatrixWorld(true);
    hideUnitInteriorMeshesForAuthView(plate);

    const after = collectGlassStats(plate);
    const unitSouthAfter = after.filter(
      (g) => g.unitId.startsWith("unit_") && (g.name.includes("_glass_s_") || g.face === "merged"),
    );
    expect(unitSouthAfter.length).toBeGreaterThan(0);
    for (const g of unitSouthAfter) {
      expect(g.visible).toBe(true);
      expect(g.frustumCulled).toBe(false);
      expect(g.residentialGlass).toBe(true);
    }

    const corridorSouth = after.filter(
      (g) => g.unitId.startsWith("corridor") && (g.name.includes("_glass_s_") || g.name.includes("_glass_n_")),
    );
    expect(corridorSouth.length).toBeGreaterThan(0);
    for (const g of corridorSouth) {
      expect(g.visible).toBe(true);
      expect(g.frustumCulled).toBe(false);
    }
  });
});

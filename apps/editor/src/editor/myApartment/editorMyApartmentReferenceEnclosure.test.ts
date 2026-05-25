import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC, FloorDocSchema } from "@the-mammoth/schemas";
import { HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID } from "@the-mammoth/world";
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

function collectMeshNames(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) names.push(obj.name);
  });
  return names;
}

describe("editor apartment reference enclosure", () => {
  it("mounts holed reference walls with corridor door cutouts and hides ceilings", () => {
    const floor = readTypicalFloorDoc();
    const building = {
      floorRefs: [{ floorDocId: floor.id, levelIndex: 20 }],
    } as const;
    const shell = buildOwnedApartmentAuthoringShell({
      ownedApartmentBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      typicalFloorDoc: floor,
      building: building as never,
      previewUnitId: HOME_BAND_FIRST_OWNED_APARTMENT_UNIT_ID,
    });

    const enclosure = shell.getObjectByName("editor_owned_apartment_reference_enclosure");
    expect(enclosure).toBeTruthy();

    const meshNames = collectMeshNames(enclosure!);
    expect(meshNames.some((name) => name.startsWith("editor_ref_shell_wall_"))).toBe(true);
    expect(
      meshNames.some(
        (name) => name.startsWith("editor_ref_shell_wall_w") && !name.endsWith("_solid"),
      ),
    ).toBe(true);

    let ceilingVisible = false;
    enclosure!.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (
        (obj.name.startsWith("shell_ceiling") || obj.name.startsWith("balcony_shell_ceiling")) &&
        obj.visible
      ) {
        ceilingVisible = true;
      }
    });
    expect(ceilingVisible).toBe(false);
  });
});

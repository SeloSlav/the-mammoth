import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC, FloorDocSchema } from "@the-mammoth/schemas";
import { FLOOR_19_GAMEPLAY_LEVEL_INDEX } from "@the-mammoth/world";
import { buildFloor19CorridorAuthoringShell } from "./editorMyApartmentAuthoringShell.js";

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

describe("editor corridor reference enclosure", () => {
  it("mounts holed side walls with apartment door cutouts and hides ceilings", () => {
    const floor = readTypicalFloorDoc();
    const shell = buildFloor19CorridorAuthoringShell({
      ownedApartmentBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      typicalFloorDoc: floor,
      corridorLevelIndex: FLOOR_19_GAMEPLAY_LEVEL_INDEX,
    });

    const enclosure = shell.getObjectByName("editor_corridor_reference_enclosure");
    expect(enclosure).toBeTruthy();

    const meshNames = collectMeshNames(enclosure!);
    expect(meshNames.some((name) => name.startsWith("shell_wall_e"))).toBe(true);
    expect(meshNames.some((name) => name.startsWith("shell_wall_w"))).toBe(true);
    expect(
      meshNames.filter(
        (name) =>
          (name.startsWith("shell_wall_e") || name.startsWith("shell_wall_w")) &&
          !name.endsWith("_solid"),
      ).length,
    ).toBeGreaterThan(4);

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

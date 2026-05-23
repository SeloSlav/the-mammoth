import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  MAMMOTH_APARTMENT_INTERIOR_FILL_LIGHT_LAYER_MASK,
  MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK,
  MAMMOTH_FP_VIEWMODEL_RENDER_LAYER,
  MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER,
  tagResidentialUnitInteriorShellMeshesUnder,
} from "./apartmentInteriorLayers.js";

describe("residential unit interior render layers", () => {
  it("tags only interior shells on a megablock root, not exterior cladding", () => {
    const root = new THREE.Group();
    const facade = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    facade.name = "facade_panel_south";
    const unitShell = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    unitShell.userData.mammothPlacedObjectId = "unit_e_003";
    const corridorSign = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
    );
    corridorSign.userData.mammothUnitInterior = true;
    root.add(facade, unitShell, corridorSign);

    tagResidentialUnitInteriorShellMeshesUnder(root);

    expect(facade.layers.mask).toBe(1);
    expect(unitShell.layers.mask).toBe(1 << MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
    expect(corridorSign.layers.mask).toBe(1 << MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
  });
});

describe("apartment interior light layers", () => {
  it("includes viewmodel layer on fill rig but not on practical spots", () => {
    const vmBit = 1 << MAMMOTH_FP_VIEWMODEL_RENDER_LAYER;
    expect(MAMMOTH_APARTMENT_INTERIOR_FILL_LIGHT_LAYER_MASK & vmBit).toBe(vmBit);
    expect(MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK & vmBit).toBe(0);
  });
});

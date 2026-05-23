import * as THREE from "three";
import { isApartmentInteriorShellMesh } from "./bindMammothApartmentDecorIndirectEnv.js";

/** Keep in sync with `apps/client` `fpSessionConstants`. */
export const MAMMOTH_FP_VIEWMODEL_RENDER_LAYER = 1;
export const MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER = 3;
export const MAMMOTH_APARTMENT_DECOR_PROP_LAYER = 5;

/**
 * Window/lamp/TV practicals — world + shell + decor only (not the FP viewmodel layer).
 */
export const MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK =
  (1 << 0) |
  (1 << MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER) |
  (1 << MAMMOTH_APARTMENT_DECOR_PROP_LAYER);

/**
 * Hemisphere / ambient / directional + interior bounce — includes viewmodel so hands/weapons
 * match the flat; practical spots stay on {@link MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK}.
 */
export const MAMMOTH_APARTMENT_INTERIOR_FILL_LIGHT_LAYER_MASK =
  MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK |
  (1 << MAMMOTH_FP_VIEWMODEL_RENDER_LAYER);

/** Global + bounce rigs — corridor (0), viewmodel (1), shell (3), decor (5). */
export function applyMammothApartmentInteriorLightLayers(light: THREE.Light): void {
  light.layers.mask = MAMMOTH_APARTMENT_INTERIOR_FILL_LIGHT_LAYER_MASK;
}

/**
 * Shell/decor meshes render on layers 3 and 5; the default camera only sees layer 0.
 * FP session enables these — editor apartment layout must too or the scene is invisible.
 */
export function syncMammothApartmentInteriorViewLayers(
  view: {
    camera: THREE.Camera;
    raycasters?: readonly THREE.Raycaster[];
  },
  enabled: boolean,
): void {
  const layers = [
    MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER,
    MAMMOTH_APARTMENT_DECOR_PROP_LAYER,
  ] as const;
  for (const layer of layers) {
    if (enabled) {
      view.camera.layers.enable(layer);
    } else {
      view.camera.layers.disable(layer);
    }
  }
  for (const raycaster of view.raycasters ?? []) {
    for (const layer of layers) {
      if (enabled) {
        raycaster.layers.enable(layer);
      } else {
        raycaster.layers.disable(layer);
      }
    }
  }
}

export function tagMeshResidentialUnitInterior(mesh: THREE.Mesh): void {
  mesh.layers.set(MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER);
}

/**
 * Megablock / full-building shell roots include exterior cladding on the default layer (0).
 * Only hollow shells, corridor/stair tagged interiors, and merged `unit_*` plaster move to layer 3.
 */
export function isResidentialUnitInteriorRenderLayerMesh(mesh: THREE.Mesh): boolean {
  if (mesh.userData.mammothResidentialUnitExteriorGlass === true) return false;
  if (mesh.userData.mammothUnitInterior === true) return true;
  return isApartmentInteriorShellMesh(mesh);
}

/** Tag every mesh under a decor / owned-apartment preview root (all props are interior-only). */
export function tagResidentialUnitInteriorMeshesUnder(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) tagMeshResidentialUnitInterior(obj);
  });
}

/** Tag only interior-shell meshes under a megablock `buildingRoot` — keeps facade on layer 0. */
export function tagResidentialUnitInteriorShellMeshesUnder(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (isResidentialUnitInteriorRenderLayerMesh(obj)) {
      tagMeshResidentialUnitInterior(obj);
    }
  });
}

function isApartmentDecorOrFurniturePropAncestor(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (
      cur.userData.mammothApartmentDecorProp === true ||
      cur.userData.mammothEditorMyApartmentProp === true
    ) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/** Megablock hollow shells (`mammothPlacedObjectId` = `unit_*`). */
export function tagMergedResidentialShellMeshes(buildingRoot: THREE.Object3D): void {
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const pid = obj.userData.mammothPlacedObjectId;
    if (typeof pid !== "string" || !pid.startsWith("unit_")) return;
    tagMeshResidentialUnitInterior(obj);
  });
}

/** Decor/furniture on layer 5 — matches FP mirror exclusion + editor preview parity. */
export function tagApartmentDecorPropMeshesForInteriorLighting(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!isApartmentDecorOrFurniturePropAncestor(obj)) return;
    obj.layers.set(MAMMOTH_APARTMENT_DECOR_PROP_LAYER);
  });
}

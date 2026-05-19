import * as THREE from "three";

/** Keep in sync with `apps/client` `fpSessionConstants` and practical-light masks. */
export const MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER = 3;
export const MAMMOTH_APARTMENT_DECOR_PROP_LAYER = 5;

export const MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK =
  (1 << 0) | (1 << MAMMOTH_RESIDENTIAL_UNIT_INTERIOR_LAYER) | (1 << MAMMOTH_APARTMENT_DECOR_PROP_LAYER);

/** Corridor (0) + residential shell (3) + decor (5) — required for global rig to reach unit meshes. */
export function applyMammothApartmentInteriorLightLayers(light: THREE.Light): void {
  light.layers.mask = MAMMOTH_APARTMENT_INTERIOR_LIGHT_LAYER_MASK;
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

export function tagResidentialUnitInteriorMeshesUnder(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) tagMeshResidentialUnitInterior(obj);
  });
}

function isApartmentDecorOrFurniturePropAncestor(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (
      cur.userData.mammothApartmentDecorProp === true ||
      cur.userData.mammothApartmentFurnitureProp === true ||
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

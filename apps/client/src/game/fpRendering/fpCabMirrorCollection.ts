import * as THREE from "three";
import { MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY } from "@the-mammoth/world";
import {
  createFpPlanarMirrorFromPlaceholder,
  type FpPlanarMirror,
} from "./fpPlanarMirror.js";
import { FP_APARTMENT_MIRROR_REFLECTION_RESOLUTION_SCALE } from "./fpCabMirrorReflectionGate.js";

/**
 * Elevator cab mirrors (static for the session) plus apartment-authored mirrors rebuilt with decor.
 */
export class FpCabMirrorCollection {
  private readonly staticMirrors: FpPlanarMirror[];
  private apartmentMirrors: FpPlanarMirror[] = [];

  constructor(scene: THREE.Object3D) {
    this.staticMirrors = collectCabMirrorPlaceholders(scene).map((mesh) =>
      createFpPlanarMirrorFromPlaceholder(mesh),
    );
  }

  /** Replace apartment mirrors after {@link mountFpApartmentDecorMeshes} rebuild. */
  syncApartmentDecorRoot(apartmentDecorRoot: THREE.Object3D): void {
    for (const mirror of this.apartmentMirrors) mirror.dispose();
    this.apartmentMirrors = collectApartmentMirrorPlaceholders(apartmentDecorRoot).map((mesh) =>
      createFpPlanarMirrorFromPlaceholder(mesh, {
        resolutionScale: FP_APARTMENT_MIRROR_REFLECTION_RESOLUTION_SCALE,
        frustumCulled: true,
      }),
    );
  }

  get mirrors(): readonly FpPlanarMirror[] {
    return [...this.staticMirrors, ...this.apartmentMirrors];
  }

  dispose(): void {
    for (const mirror of this.staticMirrors) mirror.dispose();
    for (const mirror of this.apartmentMirrors) mirror.dispose();
    this.apartmentMirrors = [];
  }
}

function collectCabMirrorPlaceholders(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj.userData.mammothCabMirror !== true) return;
    if (obj.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY] === true) return;
    out.push(obj);
  });
  return out;
}

function collectApartmentMirrorPlaceholders(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      obj.userData[MAMMOTH_APARTMENT_PLANAR_MIRROR_USERDATA_KEY] === true
    ) {
      out.push(obj);
    }
  });
  return out;
}

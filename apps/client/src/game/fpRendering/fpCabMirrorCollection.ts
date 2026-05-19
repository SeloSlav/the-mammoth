import * as THREE from "three";
import { createFpPlanarMirrorFromPlaceholder, type FpPlanarMirror } from "./fpPlanarMirror.js";

/**
 * Elevator cab mirrors (static for the session) plus apartment-authored mirrors rebuilt with decor.
 */
export class FpCabMirrorCollection {
  private readonly staticMirrors: FpPlanarMirror[];
  private apartmentMirrors: FpPlanarMirror[] = [];

  constructor(scene: THREE.Object3D) {
    this.staticMirrors = collectMirrorPlaceholders(scene).map((mesh) =>
      createFpPlanarMirrorFromPlaceholder(mesh),
    );
  }

  /** Replace apartment mirrors after {@link mountFpApartmentDecorMeshes} rebuild. */
  syncApartmentDecorRoot(apartmentDecorRoot: THREE.Object3D): void {
    for (const mirror of this.apartmentMirrors) mirror.dispose();
    this.apartmentMirrors = collectMirrorPlaceholders(apartmentDecorRoot).map((mesh) =>
      createFpPlanarMirrorFromPlaceholder(mesh),
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

function collectMirrorPlaceholders(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.userData.mammothCabMirror === true) {
      out.push(obj);
    }
  });
  return out;
}

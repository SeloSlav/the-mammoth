import type * as THREE from "three";

export type ApartmentSittablePrompt = {
  kind: "apartment_sittable";
  sittableKey: string;
  unitKey: string;
  label: string;
  modelRelPath: string;
  root: THREE.Object3D;
  /** Lateral seat along decor local +X (`0` = left band when `lateralSeatCount > 1`). */
  seatIndex: number;
};

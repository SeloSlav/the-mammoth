import type * as THREE from "three";

export type ApartmentSittablePrompt = {
  kind: "apartment_sittable";
  sittableKey: string;
  unitKey: string;
  label: string;
  modelRelPath: string;
  root: THREE.Object3D;
};

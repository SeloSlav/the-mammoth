import * as THREE from "three";
import type { WeaponDefinition } from "../../weapons/weaponTypes.js";

export type FpWeaponGripMountLocal = {
  pos: THREE.Vector3;
  euler: THREE.Euler;
  scale: THREE.Vector3;
};

export function computeWeaponGripMountFromDefinition(
  weaponDefinition: WeaponDefinition | null,
): FpWeaponGripMountLocal {
  const pres = weaponDefinition?.primitivePresentation?.firstPerson;
  if (!pres) {
    return {
      pos: new THREE.Vector3(),
      euler: new THREE.Euler(0, 0, 0, "XYZ"),
      scale: new THREE.Vector3(1, 1, 1),
    };
  }
  const sm = pres.mount.scaleM;
  return {
    pos: new THREE.Vector3(
      pres.mount.positionM.x,
      pres.mount.positionM.y,
      pres.mount.positionM.z,
    ),
    euler: new THREE.Euler(
      pres.mount.eulerRad.x,
      pres.mount.eulerRad.y,
      pres.mount.eulerRad.z,
      "XYZ",
    ),
    scale: sm ? new THREE.Vector3(sm.x, sm.y, sm.z) : new THREE.Vector3(1, 1, 1),
  };
}

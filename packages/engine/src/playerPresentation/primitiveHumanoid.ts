import * as THREE from "three";

export type PrimitiveHumanoidParts = {
  root: THREE.Group;
  /** Third-person weapon parent — approximate right-hand grip. */
  handAttachRight: THREE.Object3D;
  torso: THREE.Mesh;
};

/**
 * Readable silhouette for remote players until GLB bodies ship.
 * Origin: feet at y=0 in local space (place `root.position.y` at floor contact).
 */
export function buildPrimitiveHumanoid(opts?: {
  tint?: number;
}): PrimitiveHumanoidParts {
  const root = new THREE.Group();
  const tint = opts?.tint ?? 0x9f7a6b;
  const skin = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.62,
    metalness: 0.08,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x4a5568,
    roughness: 0.75,
    metalness: 0.05,
  });

  const legGeoL = new THREE.BoxGeometry(0.14, 0.46, 0.14);
  const legGeoR = new THREE.BoxGeometry(0.14, 0.46, 0.14);
  const legL = new THREE.Mesh(legGeoL, cloth.clone());
  legL.position.set(-0.11, 0.23, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeoR, cloth.clone());
  legR.position.set(0.11, 0.23, 0);
  legR.castShadow = true;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.22), cloth.clone());
  torso.position.set(0, 0.46 + 0.26, 0);
  torso.castShadow = true;

  const armGeoL = new THREE.BoxGeometry(0.12, 0.38, 0.12);
  const armGeoR = new THREE.BoxGeometry(0.12, 0.38, 0.12);
  const armL = new THREE.Mesh(armGeoL, skin.clone());
  armL.position.set(-0.28, 0.46 + 0.32, 0);
  armL.castShadow = true;
  const armR = new THREE.Mesh(armGeoR, skin.clone());
  armR.position.set(0.28, 0.46 + 0.32, 0);
  armR.castShadow = true;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), skin.clone());
  head.position.set(0, 0.46 + 0.52 + 0.14, 0);
  head.castShadow = true;

  const handAttachRight = new THREE.Group();
  handAttachRight.position.set(0.42, 0.1, 0.06);
  armR.add(handAttachRight);

  root.add(legL, legR, torso, armL, armR, head);
  skin.dispose();
  cloth.dispose();
  return { root, handAttachRight, torso };
}

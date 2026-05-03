import * as THREE from "three";

export type PrimitiveHumanoidSharedMaterials = {
  skin: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
};

export type PrimitiveHumanoidParts = {
  root: THREE.Group;
  /** Third-person weapon parent — approximate right-hand grip. */
  handAttachRight: THREE.Object3D;
  torso: THREE.Mesh;
};

export type BuildPrimitiveHumanoidOptions = {
  tint?: number;
  /**
   * When set, meshes reference these materials directly (for crowds: one skin + one cloth across N avatars).
   * Callers must not dispose shared materials while instances live.
   */
  sharedMaterials?: PrimitiveHumanoidSharedMaterials;
  /** Defaults true; FP session disables shadows on bodies. */
  castShadow?: boolean;
};

/**
 * Readable silhouette for remote players until GLB bodies ship.
 * Origin: feet at y=0 in local space (place `root.position.y` at floor contact).
 */
export function buildPrimitiveHumanoid(opts?: BuildPrimitiveHumanoidOptions): PrimitiveHumanoidParts {
  const root = new THREE.Group();
  const castShadow = opts?.castShadow ?? true;
  const shared = opts?.sharedMaterials;
  let skin: THREE.MeshStandardMaterial;
  let cloth: THREE.MeshStandardMaterial;
  let shouldDisposeTemplateMats = false;
  if (shared) {
    skin = shared.skin;
    cloth = shared.cloth;
  } else {
    shouldDisposeTemplateMats = true;
    const tint = opts?.tint ?? 0x9f7a6b;
    skin = new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.62,
      metalness: 0.08,
    });
    cloth = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.75,
      metalness: 0.05,
    });
  }

  const legGeoL = new THREE.BoxGeometry(0.14, 0.46, 0.14);
  const legGeoR = new THREE.BoxGeometry(0.14, 0.46, 0.14);
  const legL = new THREE.Mesh(legGeoL, shared ? cloth : cloth.clone());
  legL.position.set(-0.11, 0.23, 0);
  legL.castShadow = castShadow;
  const legR = new THREE.Mesh(legGeoR, shared ? cloth : cloth.clone());
  legR.position.set(0.11, 0.23, 0);
  legR.castShadow = castShadow;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.22), shared ? cloth : cloth.clone());
  torso.position.set(0, 0.46 + 0.26, 0);
  torso.castShadow = castShadow;

  const armGeoL = new THREE.BoxGeometry(0.12, 0.38, 0.12);
  const armGeoR = new THREE.BoxGeometry(0.12, 0.38, 0.12);
  const armL = new THREE.Mesh(armGeoL, shared ? skin : skin.clone());
  armL.position.set(-0.28, 0.46 + 0.32, 0);
  armL.castShadow = castShadow;
  const armR = new THREE.Mesh(armGeoR, shared ? skin : skin.clone());
  armR.position.set(0.28, 0.46 + 0.32, 0);
  armR.castShadow = castShadow;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), shared ? skin : skin.clone());
  head.position.set(0, 0.46 + 0.52 + 0.14, 0);
  head.castShadow = castShadow;

  const handAttachRight = new THREE.Group();
  handAttachRight.position.set(0.42, 0.1, 0.06);
  armR.add(handAttachRight);

  root.add(legL, legR, torso, armL, armR, head);
  if (shouldDisposeTemplateMats) {
    skin.dispose();
    cloth.dispose();
  }
  return { root, handAttachRight, torso };
}

import * as THREE from "three";

const EMISSIVE_BACKUP_UD = "mammothFpDebugEmissiveBackup";

type EmissiveBackup = {
  emissive: THREE.Color;
  emissiveIntensity: number;
};

let suppressActive = false;

function forEachStandardMaterial(
  mesh: THREE.Mesh,
  fn: (mat: THREE.MeshStandardMaterial) => void,
): void {
  const material = mesh.material;
  const mats = Array.isArray(material) ? material : [material];
  for (let i = 0; i < mats.length; i++) {
    const raw = mats[i];
    if (raw instanceof THREE.MeshStandardMaterial) fn(raw);
  }
}

function suppressMaterialEmissive(mat: THREE.MeshStandardMaterial): void {
  const existing = mat.userData[EMISSIVE_BACKUP_UD] as EmissiveBackup | undefined;
  if (!existing) {
    mat.userData[EMISSIVE_BACKUP_UD] = {
      emissive: mat.emissive.clone(),
      emissiveIntensity: mat.emissiveIntensity,
    };
  }
  if (mat.emissive.getHex() === 0x000000 && mat.emissiveIntensity === 0) return;
  mat.emissive.setHex(0x000000);
  mat.emissiveIntensity = 0;
  mat.needsUpdate = true;
}

function restoreMaterialEmissive(mat: THREE.MeshStandardMaterial): void {
  const backup = mat.userData[EMISSIVE_BACKUP_UD] as EmissiveBackup | undefined;
  if (!backup) return;
  mat.emissive.copy(backup.emissive);
  mat.emissiveIntensity = backup.emissiveIntensity;
  delete mat.userData[EMISSIVE_BACKUP_UD];
  mat.needsUpdate = true;
}

/**
 * Debug A/B: zero {@link THREE.MeshStandardMaterial} emissive on the building (shell + decor).
 * Backs up authored values once per material; restores when re-enabled.
 */
export function syncFpDebugEmissiveMaterialsIsolation(
  buildingRoot: THREE.Object3D,
  emissivesEnabled: boolean,
): void {
  if (emissivesEnabled) {
    if (!suppressActive) return;
    buildingRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      forEachStandardMaterial(obj, restoreMaterialEmissive);
    });
    suppressActive = false;
    return;
  }

  if (suppressActive) return;

  suppressActive = true;
  buildingRoot.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    forEachStandardMaterial(obj, suppressMaterialEmissive);
  });
}

/** Session teardown — drop cached state without touching live materials. */
export function resetFpDebugEmissiveIsolationState(): void {
  suppressActive = false;
}

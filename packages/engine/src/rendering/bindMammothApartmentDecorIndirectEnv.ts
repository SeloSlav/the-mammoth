import * as THREE from "three";
import { APARTMENT_INTERIOR_VISUAL_PROFILE } from "./apartmentInteriorVisualProfile.js";
import {
  bindMammothMetallicReadableEnv,
  mammothSpecularReadabilityWeight,
  MAMMOTH_METALLIC_ENV_READABLE_UD,
} from "./bindMammothMetallicReadableEnv.js";

/** Megablock merged shells and editor authoring/reference enclosure meshes. */
export const MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD = "mammothApartmentInteriorShellMesh";

export function isApartmentInteriorShellMesh(mesh: THREE.Mesh): boolean {
  if (mesh.userData[MAMMOTH_APARTMENT_INTERIOR_SHELL_MESH_UD] === true) {
    return true;
  }
  const pid = mesh.userData.mammothPlacedObjectId;
  return typeof pid === "string" && pid.startsWith("unit_");
}

/**
 * Applies low-intensity PMREM to non-metallic apartment decor/furniture PBR materials.
 * Call after {@link bindMammothMetallicReadableEnv} so metallic props keep their stronger env boost.
 */
export function bindMammothApartmentDecorIndirectEnv(
  root: THREE.Object3D,
  envTexture: THREE.Texture | null,
): void {
  if (!envTexture) return;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = ([] as THREE.Material[]).concat(
      mesh.material as THREE.Material | THREE.Material[],
    );
    for (const raw of list) {
      if (!(raw instanceof THREE.MeshStandardMaterial)) continue;
      if (
        raw.userData[MAMMOTH_METALLIC_ENV_READABLE_UD as keyof typeof raw.userData]
      ) {
        continue;
      }
      const w = mammothSpecularReadabilityWeight(raw.metalness, raw.roughness);
      const decorIndirect = APARTMENT_INTERIOR_VISUAL_PROFILE.decor.indirectEnvIntensity;
      raw.envMap = envTexture;
      raw.envMapIntensity = THREE.MathUtils.lerp(decorIndirect, 0.55, w);
      raw.needsUpdate = true;
    }
  });
}

/**
 * Merged hollow-unit shells (`mammothPlacedObjectId` = `unit_*`) — same PMREM as decor but tuned
 * for roughness≈1 plaster/parquet so walls and floors share the prop shading model.
 */
export function bindMammothResidentialShellIndirectEnv(
  buildingRoot: THREE.Object3D,
  envTexture: THREE.Texture | null,
): void {
  if (!envTexture) return;
  const shellIndirect = APARTMENT_INTERIOR_VISUAL_PROFILE.shell.indirectEnvIntensity;

  buildingRoot.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !isApartmentInteriorShellMesh(mesh)) return;
    const list = ([] as THREE.Material[]).concat(
      mesh.material as THREE.Material | THREE.Material[],
    );
    for (let i = 0; i < list.length; i++) {
      const raw = list[i]!;
      if (!(raw instanceof THREE.MeshStandardMaterial)) continue;
      if (
        raw.userData[MAMMOTH_METALLIC_ENV_READABLE_UD as keyof typeof raw.userData]
      ) {
        continue;
      }
      const prepared = raw.clone();
      prepared.envMap = envTexture;
      prepared.envMapIntensity = shellIndirect;
      prepared.needsUpdate = true;
      if (Array.isArray(mesh.material)) {
        (mesh.material as THREE.Material[])[i] = prepared;
      } else {
        mesh.material = prepared;
      }
    }
  });
}

/** Metallic highlights first, then matte indirect fill. */
export function bindMammothApartmentPropReadableEnv(
  root: THREE.Object3D,
  envTexture: THREE.Texture | null,
): void {
  bindMammothMetallicReadableEnv(root, envTexture);
  bindMammothApartmentDecorIndirectEnv(root, envTexture);
}

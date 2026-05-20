import * as THREE from "three";
import type { OwnedApartmentWallMaterial } from "@the-mammoth/schemas";
import {
  MAMMOTH_WORLD_METRIC_WALL_UVS_UD,
  WALL_SEGMENT_UV_METERS_PER_TILE,
} from "./wallWithDoorCutout.js";
import { textureCandidatesFromSpec } from "./pbrTexturePath.js";
import { pbrTextureLoader } from "./pbrTextureSystem.js";

/** @internal Exported for unit tests — holed-wall lintels rely on repeat (1,1) with metric UVs. */
export function syncOwnedApartmentWallSurfaceTextureRepeats(
  mesh: THREE.Mesh,
  material: THREE.MeshStandardMaterial,
  metersPerTile: number,
): void {
  /**
   * Holed wall fragments (lintels, jambs, sill bands) already carry metric UVs from
   * {@link applyWorldMetricUvsToAxisAlignedBoxMesh}. Repeating by world AABB again squashes
   * short pieces (lintel above doorways reads as vertically stretched).
   */
  const metricUvs = mesh.userData[MAMMOTH_WORLD_METRIC_WALL_UVS_UD] === true;
  let ru = 1;
  let rv = 1;
  if (!metricUvs) {
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const sx = Math.max(1e-6, box.max.x - box.min.x);
    const sy = Math.max(1e-6, box.max.y - box.min.y);
    const sz = Math.max(1e-6, box.max.z - box.min.z);
    const uAxis = Math.max(sx, sz);
    const vAxis = sy;
    ru = uAxis / Math.max(1e-6, metersPerTile);
    rv = vAxis / Math.max(1e-6, metersPerTile);
  }
  for (const tex of [
    material.map,
    material.normalMap,
    material.roughnessMap,
    material.metalnessMap,
    material.bumpMap,
  ]) {
    if (!tex) continue;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(ru, rv);
    tex.needsUpdate = true;
  }
}

async function loadRepeatWallTexture(
  spec: string | undefined,
  colorSpace: THREE.ColorSpace,
): Promise<THREE.Texture | null> {
  if (!spec?.trim()) return null;
  const urls = textureCandidatesFromSpec(spec.trim());
  for (const url of urls) {
    try {
      const tex = await pbrTextureLoader.loadAsync(url);
      tex.colorSpace = colorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      return tex;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function stillCurrent(mesh: THREE.Mesh, std: THREE.MeshStandardMaterial, gen: number): boolean {
  const ud = mesh.userData as { mammothWallSurfaceMatGen?: number };
  return ud.mammothWallSurfaceMatGen === gen && mesh.material === std;
}

/**
 * Applies an owned-apartment wall slab PBR payload to a mesh (editor + client).
 * Uses world-axis bounds for texture repeat so stretched slabs tile like architectural shells.
 *
 * **WebGPU:** textures are bound only after `loadAsync` completes so `image` is never null during upload.
 */
export function applyOwnedApartmentWallSurfaceMaterial(
  mesh: THREE.Mesh,
  mat: OwnedApartmentWallMaterial,
  metersPerTile: number = WALL_SEGMENT_UV_METERS_PER_TILE,
): void {
  const prev = mesh.material;
  if (Array.isArray(prev)) {
    for (const m of prev) {
      if (m instanceof THREE.Material) m.dispose();
    }
  } else if (prev instanceof THREE.Material) {
    prev.dispose();
  }

  const ud = mesh.userData as { mammothWallSurfaceMatGen?: number };
  const gen = (ud.mammothWallSurfaceMatGen ?? 0) + 1;
  ud.mammothWallSurfaceMatGen = gen;

  const std = new THREE.MeshStandardMaterial({
    color: mat.mapUrl?.trim() ? 0xffffff : 0xc9c4bc,
    roughness: mat.roughness ?? 0.82,
    metalness: mat.metalness ?? 0.02,
  });
  mesh.material = std;

  const syncRepeats = (): void => {
    const m = mesh.material;
    if (!(m instanceof THREE.MeshStandardMaterial)) return;
    if (!stillCurrent(mesh, std, gen)) return;
    syncOwnedApartmentWallSurfaceTextureRepeats(mesh, m, metersPerTile);
  };

  void (async (): Promise<void> => {
    const map = await loadRepeatWallTexture(mat.mapUrl, THREE.SRGBColorSpace);
    if (!stillCurrent(mesh, std, gen)) {
      map?.dispose();
      return;
    }
    if (map) {
      std.map = map;
      std.color.setHex(0xffffff);
    }

    const [normalMap, roughnessMap, metalnessMap, bumpMap] = await Promise.all([
      loadRepeatWallTexture(mat.normalMapUrl, THREE.NoColorSpace),
      loadRepeatWallTexture(mat.roughnessMapUrl, THREE.NoColorSpace),
      mat.useMetalnessMap ? loadRepeatWallTexture(mat.metalnessMapUrl, THREE.NoColorSpace) : Promise.resolve(null),
      mat.useHeightMap ? loadRepeatWallTexture(mat.bumpMapUrl, THREE.NoColorSpace) : Promise.resolve(null),
    ]);

    if (!stillCurrent(mesh, std, gen)) {
      map?.dispose();
      normalMap?.dispose();
      roughnessMap?.dispose();
      metalnessMap?.dispose();
      bumpMap?.dispose();
      return;
    }

    if (normalMap) std.normalMap = normalMap;
    if (roughnessMap) std.roughnessMap = roughnessMap;
    if (metalnessMap) std.metalnessMap = metalnessMap;
    if (bumpMap) {
      std.bumpMap = bumpMap;
      std.bumpScale = 0.02;
    }

    std.needsUpdate = true;
    mesh.updateMatrixWorld(true);
    syncRepeats();
  })();

  mesh.updateMatrixWorld(true);
  syncRepeats();
}

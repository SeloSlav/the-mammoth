import * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Try each URL until one loads — used for world drops when multiple naming conventions exist.
 * Last candidate should be a guaranteed ship asset (see {@link mammothCatalogGlbCandidates}).
 */
export async function loadGltfSceneFirstMatch(
  loader: GLTFLoader,
  candidates: readonly string[],
): Promise<{ uri: string; scene: THREE.Group }> {
  let last: unknown;
  for (const uri of candidates) {
    try {
      const gltf = await loader.loadAsync(uri);
      return { uri, scene: gltf.scene };
    } catch (e) {
      last = e;
    }
  }
  throw new Error(
    `loadGltfSceneFirstMatch: no URL loaded (${candidates.length} tried): ${
      last instanceof Error ? last.message : String(last)
    }`,
  );
}

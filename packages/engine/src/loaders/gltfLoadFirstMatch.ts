import * as THREE from "three";
import { expandMammothGlbLoadCandidates } from "@the-mammoth/assets";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getConfiguredGltfLoader } from "./createConfiguredGltfLoader.js";

export type GltfLoadFirstMatchResult = {
  uri: string;
  scene: THREE.Group;
  animations: readonly THREE.AnimationClip[];
};

/**
 * Try each URL until one loads — optimized Draco/KTX2 siblings are prepended automatically.
 * Pass explicit legacy URIs or catalog lists; last-resort fallbacks stay at the end of `candidates`.
 */
export async function loadGltfFirstMatch(
  candidates: readonly string[],
  loader: GLTFLoader = getConfiguredGltfLoader(),
): Promise<GltfLoadFirstMatchResult> {
  const urls = expandMammothGlbLoadCandidates(candidates);
  let last: unknown;
  for (const uri of urls) {
    try {
      const gltf = await loader.loadAsync(uri);
      return { uri, scene: gltf.scene, animations: gltf.animations };
    } catch (e) {
      last = e;
    }
  }
  throw new Error(
    `loadGltfFirstMatch: no URL loaded (${urls.length} tried): ${
      last instanceof Error ? last.message : String(last)
    }`,
  );
}

/** @deprecated Prefer {@link loadGltfFirstMatch} — kept for callers that only need `scene`. */
export async function loadGltfSceneFirstMatch(
  candidates: readonly string[],
  loader?: GLTFLoader,
): Promise<{ uri: string; scene: THREE.Group }> {
  const result = await loadGltfFirstMatch(candidates, loader);
  return { uri: result.uri, scene: result.scene };
}

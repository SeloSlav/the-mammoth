import { mammothGlbLoadCandidates } from "@the-mammoth/assets";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

type PropGltfLoader = Pick<GLTFLoader, "loadAsync">;

let propGltfLoader: PropGltfLoader | null = null;

/** Client bootstrap wires the shared Draco/KTX2 {@link GLTFLoader} before stairwell props load. */
export function setStairwellLandingPropGltfLoader(loader: PropGltfLoader): void {
  propGltfLoader = loader;
}

function requirePropGltfLoader(): PropGltfLoader {
  if (!propGltfLoader) {
    throw new Error(
      "[stairWellLandingProps] GLTF loader not configured — call setStairwellLandingPropGltfLoader() after renderer init",
    );
  }
  return propGltfLoader;
}

export async function loadStairwellLandingPropGltfScene(url: string) {
  const loader = requirePropGltfLoader();
  let last: unknown;
  for (const uri of mammothGlbLoadCandidates(url)) {
    try {
      return await loader.loadAsync(uri);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error
    ? last
    : new Error(`loadStairwellLandingPropGltfScene: no URL loaded for ${url}`);
}

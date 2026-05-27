import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

/** glTF Draco decoders under `apps/client/public/static/draco/gltf/`. */
export const GLTF_DRACO_DECODER_PATH = "/static/draco/gltf/";

/** Basis transcoder for embedded glTF KTX2 textures under `apps/client/public/basis/`. */
export const GLTF_KTX2_TRANSCODER_PATH = "/basis/";

type GltfKtx2CapableRenderer = {
  isWebGPURenderer?: boolean;
  hasFeature?: (feature: string) => boolean;
};

let sharedDracoLoader: DRACOLoader | null = null;
let sharedGltfLoader: GLTFLoader | null = null;
let sharedKtx2Loader: InstanceType<
  typeof import("three/addons/loaders/KTX2Loader.js").KTX2Loader
> | null = null;
let gltfKtx2SupportReady = false;

function getSharedDracoLoader(decoderPath: string): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(decoderPath);
  }
  return sharedDracoLoader;
}

function getSharedGltfLoader(decoderPath: string): GLTFLoader {
  if (!sharedGltfLoader) {
    sharedGltfLoader = new GLTFLoader();
    sharedGltfLoader.setDRACOLoader(getSharedDracoLoader(decoderPath));
    if (sharedKtx2Loader) {
      sharedGltfLoader.setKTX2Loader(sharedKtx2Loader);
    }
  }
  return sharedGltfLoader;
}

/** Shared GLTFLoader with Draco (+ KTX2 once {@link ensureConfiguredGltfLoaderKtx2Support} runs). */
export function getConfiguredGltfLoader(
  decoderPath: string = GLTF_DRACO_DECODER_PATH,
): GLTFLoader {
  return getSharedGltfLoader(decoderPath);
}

/** Alias for {@link getConfiguredGltfLoader}. */
export const createConfiguredGltfLoader = getConfiguredGltfLoader;

/**
 * Wire KTX2/Basis decoding for embedded glTF textures. Call after `renderer.init()` and before
 * loading Draco/KTX2-compressed GLBs.
 */
export async function ensureConfiguredGltfLoaderKtx2Support(
  renderer: GltfKtx2CapableRenderer,
  transcoderPath: string = GLTF_KTX2_TRANSCODER_PATH,
): Promise<void> {
  if (gltfKtx2SupportReady) return;
  try {
    const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");
    sharedKtx2Loader = new KTX2Loader();
    sharedKtx2Loader.setTranscoderPath(transcoderPath);
    sharedKtx2Loader.detectSupport(renderer as never);
    sharedGltfLoader?.setKTX2Loader(sharedKtx2Loader);
    gltfKtx2SupportReady = true;
  } catch (err) {
    console.warn("[gltf] KTX2 unavailable for GLTF loads", err);
    gltfKtx2SupportReady = true;
  }
}

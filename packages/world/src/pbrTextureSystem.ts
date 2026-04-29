import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { textureCandidatesFromSpec } from "./pbrTexturePath.js";

/**
 * Single knob for FPS profiling: when `enabled` is `false`, skips all loads routed through
 * {@link loadTextureFromSpec} / {@link beginHydrateTextureFromSpec} (author basecolor hydrate,
 * normal, roughness, AO, patina metalness, height bump).
 *
 * Scalars from authoring slots (`roughness`, `metalness`, `colorHex`, etc.) still apply.
 * Toggle `enabled` to `false` when benchmarking FPS vs full author textures (default below).
 */
export const authorImportedPbrTexturesState = {
  /** Set `true` for shipped visuals; `false` skips author PBR loads for FPS experiments. */
  enabled: false,
};

let ktx2Loader: InstanceType<typeof import("three/addons/loaders/KTX2Loader.js").KTX2Loader> | null =
  null;
/** `true` once {@link ensurePbrKtx2Support} finishes (or when KTX2 is unavailable). */
let ktx2SupportReady = false;

function isDevWarn(): boolean {
  try {
    const im = import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } };
    if (im.env?.DEV === true) return true;
    if (im.env?.MODE === "development") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function devWarn(message: string): void {
  if (isDevWarn()) {
    console.warn(`[pbr] ${message}`);
  }
}

/** Shared CPU loader for PNG/JPEG/WebP/SVG. */
export const pbrTextureLoader = new THREE.TextureLoader();

function configureTextureParams(
  tex: THREE.Texture,
  colorSpace: THREE.ColorSpace,
  wrapS: THREE.Texture["wrapS"],
  wrapT: THREE.Texture["wrapT"],
): void {
  tex.colorSpace = colorSpace;
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
}

/**
 * Point KTX2 wasm/basis transcoder files. Copy `examples/jsm/libs/basis/` from three.js into
 * `apps/client/public/basis/` or override this path.
 *
 * @see https://threejs.org/docs/#examples/en/loaders/KTX2Loader
 */
export async function ensurePbrKtx2Support(
  renderer: WebGPURenderer,
  opts?: { transcoderPath?: string },
): Promise<void> {
  if (ktx2SupportReady) return;
  try {
    const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(opts?.transcoderPath ?? "/basis/");
    await ktx2Loader.detectSupport(renderer);
    ktx2SupportReady = true;
  } catch (err) {
    devWarn(`KTX2 unavailable — using PNG/WebP fallbacks only (${String(err)})`);
    ktx2Loader = null;
    ktx2SupportReady = true;
  }
}

function filterKtxCandidates(urls: readonly string[]): string[] {
  if (ktx2Loader && ktx2SupportReady) return [...urls];
  return urls.filter((u) => !u.toLowerCase().endsWith(".ktx2"));
}

async function loadOneUrl(
  url: string,
  colorSpace: THREE.ColorSpace,
  wrapS: THREE.Texture["wrapS"],
  wrapT: THREE.Texture["wrapT"],
): Promise<THREE.Texture | null> {
  const lower = url.toLowerCase();
  try {
    let tex: THREE.Texture;
    if (lower.endsWith(".ktx2") && ktx2Loader) {
      tex = await ktx2Loader.loadAsync(url);
    } else {
      tex = await pbrTextureLoader.loadAsync(url);
    }
    configureTextureParams(tex, colorSpace, wrapS, wrapT);
    return tex;
  } catch {
    return null;
  }
}

/**
 * Fills an existing Texture object in-place (preserves stable references used by MeshStandardMaterials)
 * by resolving {@link textureCandidatesFromSpec} and swapping `texture.image`.
 */
export function beginHydrateTextureFromSpec(
  targetSlot: THREE.Texture,
  spec: string | undefined,
  colorSpace: THREE.ColorSpace,
  wrapS: THREE.Texture["wrapS"],
  wrapT: THREE.Texture["wrapT"],
): void {
  if (!authorImportedPbrTexturesState.enabled) return;
  if (!spec?.trim()) return;

  let urls = textureCandidatesFromSpec(spec);
  urls = filterKtxCandidates(urls);

  void (async (): Promise<void> => {
    for (const url of urls) {
      const loaded = await loadOneUrl(url, colorSpace, wrapS, wrapT);
      if (!loaded) continue;
      targetSlot.image = loaded.image as typeof targetSlot.image;
      configureTextureParams(targetSlot, colorSpace, wrapS, wrapT);
      loaded.dispose();
      return;
    }
    devWarn(`optional texture missing — ${spec}`);
  })();
}

/**
 * Tries each candidate URL in order until one loads. Returns `null` if every attempt fails
 * (missing optional maps should not throw).
 */
export async function loadTextureFromSpec(
  spec: string | undefined,
  colorSpace: THREE.ColorSpace,
  wrapS: THREE.Texture["wrapS"],
  wrapT: THREE.Texture["wrapT"],
): Promise<THREE.Texture | null> {
  if (!authorImportedPbrTexturesState.enabled) return null;
  if (!spec?.trim()) return null;
  let urls = textureCandidatesFromSpec(spec);
  urls = filterKtxCandidates(urls);
  for (const url of urls) {
    const tex = await loadOneUrl(url, colorSpace, wrapS, wrapT);
    if (tex) return tex;
  }
  devWarn(`optional texture missing — ${spec}`);
  return null;
}

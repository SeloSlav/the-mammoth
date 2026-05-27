import type { WebGPURenderer } from "three/webgpu";
import {
  ensureConfiguredGltfLoaderKtx2Support,
  getConfiguredGltfLoader,
} from "@the-mammoth/engine";
import { ensurePbrKtx2Support, setStairwellLandingPropGltfLoader } from "@the-mammoth/world";

/**
 * One-shot WebGPU + PBR loader setup for FP / combat-sim sessions.
 * Keeps {@link mountFpSession} from growing with transcoder wiring.
 */
export async function bootstrapFpSessionRenderer(
  renderer: WebGPURenderer,
): Promise<void> {
  await Promise.all([
    ensurePbrKtx2Support(renderer),
    ensureConfiguredGltfLoaderKtx2Support(renderer),
  ]);
  setStairwellLandingPropGltfLoader(getConfiguredGltfLoader());
}

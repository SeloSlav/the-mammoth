import type * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { ensurePbrKtx2Support } from "@the-mammoth/world";

/**
 * One-shot WebGPU + PBR loader setup for FP / combat-sim sessions.
 * Keeps {@link mountFpSession} from growing with transcoder wiring.
 */
export async function bootstrapFpSessionRenderer(
  renderer: WebGPURenderer,
): Promise<void> {
  await ensurePbrKtx2Support(renderer);
}

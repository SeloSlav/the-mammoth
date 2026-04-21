/**
 * Browser-only guards for WebGPU-only builds (no WebGL2 fallback).
 * Call {@link assertWebGpuAdapterOrThrow} before constructing `WebGPURenderer`,
 * and {@link assertWebGpuRendererBackend} after `await renderer.init()`.
 */

const WEBGPU_REQUIRED_MSG =
  "WebGPU is required. Use a recent Chrome or Edge with WebGPU enabled, update GPU drivers, or check chrome://flags (e.g. unsafe WebGPU on unsupported configs).";

export async function assertWebGpuAdapterOrThrow(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error(WEBGPU_REQUIRED_MSG);
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw new Error(WEBGPU_REQUIRED_MSG);
  }
}

export function assertWebGpuRendererBackend(renderer: { backend?: unknown }): void {
  const b = renderer.backend as { isWebGLBackend?: boolean; isWebGPUBackend?: boolean } | undefined;
  if (!b || b.isWebGLBackend === true || b.isWebGPUBackend !== true) {
    throw new Error(
      "WebGPU backend required — the renderer fell back to WebGL2. This build does not allow a WebGL fallback.",
    );
  }
}

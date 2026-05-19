/**
 * Browser-only guards for WebGPU-only builds (no WebGL2 fallback).
 * Call {@link assertWebGpuAdapterOrThrow} before constructing `WebGPURenderer`,
 * and {@link assertWebGpuRendererBackend} after `await renderer.init()`.
 */

const WEBGPU_REQUIRED_MSG =
  "WebGPU is required. Use a recent Chrome or Edge with WebGPU enabled, update GPU drivers, or check chrome://flags (e.g. unsafe WebGPU on unsupported configs).";

/**
 * Chrome warns (and ignores `powerPreference`) on Windows — see https://crbug.com/369219127.
 * Omit the option there; keep high-performance hint elsewhere where the browser honors it.
 */
function webGpuRequestAdapterOptions(): GPURequestAdapterOptions {
  if (typeof navigator === "undefined") return {};
  if (/windows/i.test(navigator.userAgent)) return {};
  return { powerPreference: "high-performance" };
}

export async function assertWebGpuAdapterOrThrow(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error(WEBGPU_REQUIRED_MSG);
  }
  const adapter = await requestWebGpuAdapter();
  if (!adapter) {
    throw new Error(WEBGPU_REQUIRED_MSG);
  }
}

export async function requestWebGpuAdapter(): Promise<GPUAdapter | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  return navigator.gpu.requestAdapter(webGpuRequestAdapterOptions());
}

export function webGpuAdapterSupportsTimestampQuery(adapter: GPUAdapter): boolean {
  return adapter.features.has("timestamp-query");
}

export function assertWebGpuRendererBackend(renderer: { backend?: unknown }): void {
  const b = renderer.backend as { isWebGLBackend?: boolean; isWebGPUBackend?: boolean } | undefined;
  if (!b || b.isWebGLBackend === true || b.isWebGPUBackend !== true) {
    throw new Error(
      "WebGPU backend required — the renderer fell back to WebGL2. This build does not allow a WebGL fallback.",
    );
  }
}

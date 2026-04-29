import * as THREE from "three";

/**
 * Enable with `?fpdebug=1` or `localStorage.setItem("mammothFpDebug","1")`.
 * Logs once per second after each render: FPS (from RAF), draw calls, triangles.
 */
export function isFpSessionPerfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has("fpdebug")) return true;
    return window.localStorage.getItem("mammothFpDebug") === "1";
  } catch {
    return false;
  }
}

/**
 * Returns a no-op when disabled. When enabled, call the returned function once per frame
 * **after** `renderer.render` so `renderer.info` reflects that frame.
 */
export function createFpSessionPerfDebugPostRenderHook(
  renderer: THREE.WebGPURenderer,
): () => void {
  if (!isFpSessionPerfDebugEnabled()) return () => {};
  let frames = 0;
  let t0 = performance.now();
  return () => {
    frames += 1;
    const t = performance.now();
    if (t - t0 < 1000) return;
    const dt = (t - t0) / 1000;
    const ri = renderer.info.render;
    const fps = frames / dt;
    console.info("[fpSessionPerf]", {
      fps: Math.round(fps * 10) / 10,
      drawCalls: ri.calls,
      triangles: ri.triangles,
      points: ri.points,
      lines: ri.lines,
    });
    frames = 0;
    t0 = t;
  };
}

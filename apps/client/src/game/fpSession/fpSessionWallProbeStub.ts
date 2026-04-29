const MM_WALL_PROBE_LOADING_MSG =
  "[mmWallProbe] Session still initializing (WebGPU / assets). Wait until the world is visible, then run window.__mmWallProbe.on() again.";

/** Installed immediately when FP mount starts; replaced by the real API once the session is ready. */
export function installMmWallProbeLoadingStub(): void {
  (globalThis as unknown as { __mmWallProbe?: Record<string, unknown> }).__mmWallProbe = {
    on() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
    },
    off() {
      /* replaced later */
    },
    probe() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
      return undefined;
    },
    player() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
      return undefined;
    },
    persistOn() {
      console.warn(MM_WALL_PROBE_LOADING_MSG);
    },
    persistOff() {
      /* replaced later */
    },
  };
}

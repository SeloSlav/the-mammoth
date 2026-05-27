/**
 * Optional bootstrap GPU frames after decor is visible. Shader compile can take several seconds
 * with a full apartment — do not block the loading splash on this; the live RAF loop compiles too.
 */
export async function prepareFpSessionLoadingGpuWarmup(input: {
  renderFrame: () => void;
  frameCount?: number;
  yieldBetweenFrames?: () => Promise<void>;
}): Promise<void> {
  const count = input.frameCount ?? 1;
  const yieldFn =
    input.yieldBetweenFrames ??
    (() =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      }));
  for (let i = 0; i < count; i++) {
    input.renderFrame();
    if (i < count - 1) await yieldFn();
  }
}

/** Fire-and-forget post-decor shader warm-up — never blocks {@link mountFpSession} return. */
export function scheduleFpSessionLoadingGpuWarmup(input: {
  renderFrame: () => void;
  frameCount?: number;
}): void {
  void prepareFpSessionLoadingGpuWarmup(input).catch((err) => {
    console.warn("[fp] deferred loading GPU warmup failed", err);
  });
}

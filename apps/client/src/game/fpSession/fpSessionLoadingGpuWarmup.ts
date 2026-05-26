/**
 * Runs bootstrap GPU frames after loading-screen visibility prep (decor warm-up, decals, etc.).
 */
export async function prepareFpSessionLoadingGpuWarmup(input: {
  renderFrame: () => void;
  frameCount?: number;
  yieldBetweenFrames?: () => Promise<void>;
}): Promise<void> {
  const count = input.frameCount ?? 2;
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

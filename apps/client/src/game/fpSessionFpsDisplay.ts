/** FP session frame rate — written from `mountFpSession` after each render, read by React HUD. */

const WINDOW_MS = 500;

export type FpSessionFpsAccum = {
  windowStartMs: number;
  framesInWindow: number;
  displayedRounded: number | null;
};

export function initialFpSessionFpsAccum(): FpSessionFpsAccum {
  return { windowStartMs: Number.NaN, framesInWindow: 0, displayedRounded: null };
}

/**
 * One post-render sample. First call seeds the window; after {@link WINDOW_MS} the rolling
 * average is committed to `displayedRounded` and the window resets.
 */
export function reduceFpSessionFpsAccum(
  acc: FpSessionFpsAccum,
  nowMs: number,
): FpSessionFpsAccum {
  if (!Number.isFinite(acc.windowStartMs)) {
    return { windowStartMs: nowMs, framesInWindow: 1, displayedRounded: acc.displayedRounded };
  }
  const nextFrames = acc.framesInWindow + 1;
  const elapsed = nowMs - acc.windowStartMs;
  if (elapsed < WINDOW_MS) {
    return { ...acc, framesInWindow: nextFrames };
  }
  const fps = nextFrames / (elapsed / 1000);
  return {
    windowStartMs: nowMs,
    framesInWindow: 1,
    displayedRounded: Math.round(fps),
  };
}

const listeners = new Set<() => void>();

let acc = initialFpSessionFpsAccum();

export function getFpSessionDisplayedFps(): number | null {
  return acc.displayedRounded;
}

export function subscribeFpSessionDisplayedFps(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Call once per completed frame after `renderer.render` (matches real draw cadence). */
export function onFpSessionPostRenderFrame(nowMs: number): void {
  const prev = acc.displayedRounded;
  acc = reduceFpSessionFpsAccum(acc, nowMs);
  if (acc.displayedRounded !== prev) {
    for (const l of listeners) l();
  }
}

export function resetFpSessionFpsDisplay(): void {
  acc = initialFpSessionFpsAccum();
}

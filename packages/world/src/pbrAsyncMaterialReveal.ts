/**
 * Rate-limits applying async-loaded PBR maps to materials (avoids WebGPU compile bursts).
 * Drained once per FP RAF frame from the client session loop.
 */

const pending: Array<() => void> = [];

export const DEFAULT_ASYNC_PBR_REVEALS_PER_FRAME = 2;

/** Queue a callback that assigns a resolved map and sets `material.needsUpdate`. */
export function scheduleAsyncPbrMaterialReveal(apply: () => void): void {
  pending.push(apply);
}

/** Run up to `maxPerFrame` queued material updates (default 2/frame). */
export function drainAsyncPbrMaterialRevealBudget(
  maxPerFrame: number = DEFAULT_ASYNC_PBR_REVEALS_PER_FRAME,
): void {
  for (let n = 0; n < maxPerFrame && pending.length > 0; n++) {
    const fn = pending.shift();
    if (fn) fn();
  }
}

/** Test-only: clear the queue. */
export function resetAsyncPbrMaterialRevealQueueForTests(): void {
  pending.length = 0;
}

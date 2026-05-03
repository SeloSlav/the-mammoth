/**
 * Yields so the browser can service input, paint, I/O, and timers between heavy synchronous batches.
 *
 * Uses a **macrotask** (`setTimeout(0)`), not `requestAnimationFrame` (can pause in background tabs /
 * stalled compositors) and not `scheduler.yield()` alone (we’ve seen runs where the world build’s
 * yield loop never resumed while `fp_static_world_create` sat at `:start` with a black canvas).
 */
export async function yieldToMain(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

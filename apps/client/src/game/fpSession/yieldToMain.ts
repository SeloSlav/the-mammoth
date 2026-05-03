/**
 * Yields so the browser can service input, paint, and timers between heavy synchronous batches.
 * Uses `scheduler.yield()` when present (Chrome Scheduler); otherwise rAF + microtask.
 */
export async function yieldToMain(): Promise<void> {
  const scheduler = (
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler
      : undefined
  );
  if (scheduler?.yield) {
    await scheduler.yield();
    return;
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      queueMicrotask(resolve);
    });
  });
}

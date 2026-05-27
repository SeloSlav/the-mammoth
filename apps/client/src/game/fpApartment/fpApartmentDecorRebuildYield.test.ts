import { describe, expect, it, vi } from "vitest";
import { FpApartmentDecorRebuildYieldBatcher } from "./fpApartmentDecorRebuildYield.js";

describe("FpApartmentDecorRebuildYieldBatcher", () => {
  it("yields every N rows instead of every row", async () => {
    const yieldFn = vi.fn(async () => {});
    const batcher = new FpApartmentDecorRebuildYieldBatcher(yieldFn, null);

    for (let i = 0; i < 31; i++) {
      await batcher.beforeRow();
    }
    expect(yieldFn).not.toHaveBeenCalled();

    await batcher.beforeRow();
    expect(yieldFn).toHaveBeenCalledTimes(1);

    await batcher.flush();
    expect(yieldFn).toHaveBeenCalledTimes(1);
  });

  it("records yield timing when debug timings are enabled", async () => {
    const timings = {
      yieldMs: 0,
      yieldCount: 0,
      layoutMs: 0,
      prefetchMs: 0,
      prefetchLoadCount: 0,
      templateLoadMs: 0,
      templateLoadCount: 0,
      templateCacheHitCount: 0,
      decorMountMs: 0,
      decorMountCount: 0,
      wallMs: 0,
      wallCount: 0,
      mirrorMs: 0,
      mirrorCount: 0,
      finalizeMs: 0,
    };
    const batcher = new FpApartmentDecorRebuildYieldBatcher(async () => {}, timings);
    await batcher.yieldNow();
    expect(timings.yieldCount).toBe(1);
  });
});

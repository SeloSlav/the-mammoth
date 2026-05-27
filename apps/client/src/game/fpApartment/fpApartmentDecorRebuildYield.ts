import type { FpApartmentDecorRebuildTimings } from "./fpApartmentDecorRebuildLoadDebug.js";

/** Balance responsiveness vs macrotask overhead (~1.5s at 426 rows when yielding every row). */
export const FP_APARTMENT_DECOR_REBUILD_YIELD_EVERY_N_ROWS = 32;

export class FpApartmentDecorRebuildYieldBatcher {
  private rowsSinceYield = 0;

  constructor(
    private readonly yieldFn: () => Promise<void>,
    private readonly timings: FpApartmentDecorRebuildTimings | null,
  ) {}

  async yieldNow(): Promise<void> {
    this.rowsSinceYield = 0;
    await this.runYield();
  }

  async beforeRow(): Promise<void> {
    this.rowsSinceYield += 1;
    if (this.rowsSinceYield < FP_APARTMENT_DECOR_REBUILD_YIELD_EVERY_N_ROWS) return;
    await this.runYield();
  }

  async flush(): Promise<void> {
    if (this.rowsSinceYield === 0) return;
    await this.runYield();
  }

  private async runYield(): Promise<void> {
    this.rowsSinceYield = 0;
    if (!this.timings) {
      await this.yieldFn();
      return;
    }
    const t0 = performance.now();
    await this.yieldFn();
    this.timings.yieldMs += performance.now() - t0;
    this.timings.yieldCount += 1;
  }
}

import { describe, expect, it } from "vitest";
import {
  drainAsyncPbrMaterialRevealBudget,
  hasPendingAsyncPbrMaterialReveal,
  resetAsyncPbrMaterialRevealQueueForTests,
  scheduleAsyncPbrMaterialReveal,
} from "./pbrAsyncMaterialReveal.js";

describe("pbrAsyncMaterialReveal", () => {
  it("drains at most maxPerFrame callbacks per call", () => {
    resetAsyncPbrMaterialRevealQueueForTests();
    const ran: number[] = [];
    scheduleAsyncPbrMaterialReveal(() => ran.push(1));
    scheduleAsyncPbrMaterialReveal(() => ran.push(2));
    scheduleAsyncPbrMaterialReveal(() => ran.push(3));
    drainAsyncPbrMaterialRevealBudget(2);
    expect(ran).toEqual([1, 2]);
    drainAsyncPbrMaterialRevealBudget(2);
    expect(ran).toEqual([1, 2, 3]);
    expect(hasPendingAsyncPbrMaterialReveal()).toBe(false);
  });

  it("hasPendingAsyncPbrMaterialReveal reflects the queue", () => {
    resetAsyncPbrMaterialRevealQueueForTests();
    expect(hasPendingAsyncPbrMaterialReveal()).toBe(false);
    scheduleAsyncPbrMaterialReveal(() => {});
    expect(hasPendingAsyncPbrMaterialReveal()).toBe(true);
    drainAsyncPbrMaterialRevealBudget(1);
    expect(hasPendingAsyncPbrMaterialReveal()).toBe(false);
  });
});

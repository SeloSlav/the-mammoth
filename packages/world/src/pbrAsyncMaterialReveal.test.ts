import { describe, expect, it } from "vitest";
import {
  drainAsyncPbrMaterialRevealBudget,
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
  });
});

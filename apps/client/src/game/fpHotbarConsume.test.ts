import { afterEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../module_bindings";
import { __resetHotbarInstantConsumeCooldownForTests } from "./fpHotbarInstantConsumeCooldown";
import { getFpHotbarSelectedSlot, setFpHotbarSelectedSlot } from "./fpHotbarSelection";
import { runFpHotbarInstantConsume } from "./fpHotbarConsume";

vi.mock("./fpHotbarResolve", () => ({
  getHotbarSlotInventoryItem: () => ({ defId: "apple" }),
}));

vi.mock("./hotbarConsumeLocalAudio", () => ({
  playHotbarConsumeLocalAfterServer: vi.fn(),
}));

afterEach(() => {
  __resetHotbarInstantConsumeCooldownForTests();
});

describe("runFpHotbarInstantConsume", () => {
  it("clears hotbar selection before audio prime resolves", async () => {
    setFpHotbarSelectedSlot(3);

    let finishPrime: (() => void) | undefined;
    const primePromise = new Promise<void>((resolve) => {
      finishPrime = resolve;
    });
    const consumeHotbarItem = vi.fn().mockResolvedValue(undefined);
    const conn = { reducers: { consumeHotbarItem } } as unknown as DbConnection;
    const owner = { toHexString: () => "00", isEqual: () => false } as unknown as Identity;

    const done = runFpHotbarInstantConsume(conn, owner, 3, () => primePromise, "test");

    expect(getFpHotbarSelectedSlot()).toBeNull();

    finishPrime?.();
    await done;

    expect(consumeHotbarItem).toHaveBeenCalledTimes(1);
    expect(consumeHotbarItem).toHaveBeenCalledWith({ hotbarSlot: 3 });

    setFpHotbarSelectedSlot(0);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAMMOTH_TOON_PASS_LS_KEY,
  isMammothToonPassEnabled,
  setMammothToonPassEnabled,
} from "./mammothToonPassPrefs.js";

describe("mammothToonPassPrefs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads shared and legacy localStorage keys", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });

    expect(isMammothToonPassEnabled()).toBe(false);

    storage.set("mammothFpToonPass", "1");
    expect(isMammothToonPassEnabled()).toBe(true);

    setMammothToonPassEnabled(false);
    expect(storage.has("mammothFpToonPass")).toBe(false);
    expect(isMammothToonPassEnabled()).toBe(false);

    setMammothToonPassEnabled(true);
    expect(storage.get(MAMMOTH_TOON_PASS_LS_KEY)).toBe("1");
    expect(isMammothToonPassEnabled()).toBe(true);

    setMammothToonPassEnabled(false);
    expect(isMammothToonPassEnabled()).toBe(false);
  });
});

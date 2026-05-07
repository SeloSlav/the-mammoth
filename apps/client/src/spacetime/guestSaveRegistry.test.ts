import { describe, expect, it } from "vitest";
import {
  createEmptyGuestRegistry,
  mergeLegacyIntoGuestRegistry,
  MAX_GUEST_SAVE_SLOTS,
} from "./guestSaveRegistry";

describe("guestSaveRegistry migration merge", () => {
  it("keeps existing slots when legacy token is present", () => {
    const existing = mergeLegacyIntoGuestRegistry(createEmptyGuestRegistry(), "legacy-token", "Nick");
    const next = mergeLegacyIntoGuestRegistry(
      existing,
      "should-not-win",
      "Other",
    );
    expect(next.slots).toHaveLength(1);
    expect(next.slots[0]?.wsToken).toBe("legacy-token");
    expect(next.slots[0]?.cachedDisplayName).toBe("Nick");
  });

  it("imports legacy keys into empty registry", () => {
    const next = mergeLegacyIntoGuestRegistry(null, "tok", "Ada");
    expect(next.slots).toHaveLength(1);
    expect(next.activeSlotId).toBe(next.slots[0]?.id ?? null);
    expect(next.slots[0]?.wsToken).toBe("tok");
    expect(next.slots[0]?.cachedDisplayName).toBe("Ada");
  });

  it("preserves empty registry without legacy token", () => {
    expect(mergeLegacyIntoGuestRegistry(null, null, null)).toEqual(createEmptyGuestRegistry());
  });

  it("exports sane slot limit constant", () => {
    expect(MAX_GUEST_SAVE_SLOTS).toBeGreaterThanOrEqual(3);
  });
});

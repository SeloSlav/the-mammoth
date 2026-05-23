import { describe, expect, it } from "vitest";
import {
  BALCONY_GROW_FERTILIZER_DEF_ID,
  BALCONY_GROW_FERTILIZER_STASH_SLOT,
  balconyGrowTrayStashKey,
} from "@the-mammoth/schemas";
import { collectGrowTraySubstrateTrayIds } from "./balconyGrowOpState.js";

function mockConn(items: Array<{ stashKey: string; defId: string; slotIndex: number }>) {
  return {
    db: {
      inventory_item: items.map((item) => ({
        defId: item.defId,
        location: {
          tag: "Stash" as const,
          value: {
            unitKey: item.stashKey,
            slotIndex: item.slotIndex,
          },
        },
      })),
    },
  } as never;
}

describe("collectGrowTraySubstrateTrayIds", () => {
  it("returns tray ids with substrate in stash slot 0", () => {
    const trayId = "8e48c06b-c005-4425-9fdc-a527e67168ee";
    const stashKey = balconyGrowTrayStashKey("unit_a", trayId);
    const conn = mockConn([
      {
        stashKey,
        defId: BALCONY_GROW_FERTILIZER_DEF_ID,
        slotIndex: BALCONY_GROW_FERTILIZER_STASH_SLOT,
      },
    ]);
    expect(collectGrowTraySubstrateTrayIds(conn, "unit_a")).toEqual(new Set([trayId]));
  });

  it("ignores wrong slot, def id, or unit", () => {
    const trayId = "8e48c06b-c005-4425-9fdc-a527e67168ee";
    const stashKey = balconyGrowTrayStashKey("unit_a", trayId);
    const conn = mockConn([
      { stashKey, defId: BALCONY_GROW_FERTILIZER_DEF_ID, slotIndex: 1 },
      {
        stashKey: balconyGrowTrayStashKey("unit_b", trayId),
        defId: BALCONY_GROW_FERTILIZER_DEF_ID,
        slotIndex: BALCONY_GROW_FERTILIZER_STASH_SLOT,
      },
      { stashKey, defId: "other-item", slotIndex: BALCONY_GROW_FERTILIZER_STASH_SLOT },
    ]);
    expect(collectGrowTraySubstrateTrayIds(conn, "unit_a").size).toBe(0);
  });
});

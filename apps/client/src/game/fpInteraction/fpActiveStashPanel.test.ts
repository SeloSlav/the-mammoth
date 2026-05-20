import { describe, expect, it } from "vitest";
import {
  APARTMENT_STASH_KIND_WARDROBE,
} from "../fpApartment/fpApartmentStashKey";
import {
  closeApartmentStashAndInventory,
  closeFpActiveStashPanel,
  getFpActiveStashPanel,
  setFpActiveStashPanel,
} from "./fpActiveStashPanel";
import { onMammothInventoryCloseRequestFromFp } from "./fpInventoryOpenRequest";

describe("fpActiveStashPanel", () => {
  it("opens and closes stash panel state", () => {
    closeFpActiveStashPanel();
    expect(getFpActiveStashPanel()).toBeNull();

    setFpActiveStashPanel({
      stashKey: "unit:1:wardrobe",
      stashLabel: "wardrobe",
      stashKind: APARTMENT_STASH_KIND_WARDROBE,
    });
    expect(getFpActiveStashPanel()?.stashKey).toBe("unit:1:wardrobe");

    closeFpActiveStashPanel();
    expect(getFpActiveStashPanel()).toBeNull();
  });

  it("closeApartmentStashAndInventory clears stash and notifies inventory HUD", () => {
    let inventoryClosed = false;
    const unsub = onMammothInventoryCloseRequestFromFp(() => {
      inventoryClosed = true;
    });
    setFpActiveStashPanel({
      stashKey: "unit:1:wardrobe",
      stashLabel: "wardrobe",
      stashKind: APARTMENT_STASH_KIND_WARDROBE,
    });
    closeApartmentStashAndInventory();
    expect(getFpActiveStashPanel()).toBeNull();
    expect(inventoryClosed).toBe(true);
    unsub();
  });
});

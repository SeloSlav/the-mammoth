import { describe, expect, it } from "vitest";
import {
  APARTMENT_STASH_KIND_WARDROBE,
} from "../fpApartment/fpApartmentStashKey";
import {
  closeFpActiveStashPanel,
  getFpActiveStashPanel,
  setFpActiveStashPanel,
} from "./fpActiveStashPanel";

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
});

import { describe, expect, it } from "vitest";
import {
  getMammothItemDef,
  mammothItemDefSupportsHotbarUseAction,
  mammothItemDefSupportsHotbarWaterDrink,
} from "./mammothItemCatalog";
import { waterBottleFillFraction } from "./waterContainerHelpers";

describe("waterContainerHelpers", () => {
  it("water bottle is a tool with hotbar sip use", () => {
    const def = getMammothItemDef("water-bottle");
    expect(def?.category).toBe("tool");
    expect(mammothItemDefSupportsHotbarWaterDrink(def)).toBe(true);
    expect(mammothItemDefSupportsHotbarUseAction(def)).toBe(true);
  });

  it("defaults missing fill row to full bottle", () => {
    expect(waterBottleFillFraction(null, 1, 1)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  getMammothItemDef,
  mammothItemDefSupportsHotbarFpViewmodel,
  mammothItemDefSupportsHotbarInstantConsume,
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

  it("only apple and water bottle get first-person held meshes", () => {
    expect(mammothItemDefSupportsHotbarFpViewmodel(getMammothItemDef("apple"))).toBe(true);
    expect(mammothItemDefSupportsHotbarFpViewmodel(getMammothItemDef("water-bottle"))).toBe(true);
    expect(mammothItemDefSupportsHotbarFpViewmodel(getMammothItemDef("fresh-parsley"))).toBe(false);
    expect(mammothItemDefSupportsHotbarFpViewmodel(getMammothItemDef("parsley-seeds"))).toBe(false);
  });

  it("balcony herbs are consumable without fp viewmodels", () => {
    const parsley = getMammothItemDef("fresh-parsley");
    expect(mammothItemDefSupportsHotbarInstantConsume(parsley)).toBe(true);
    expect(mammothItemDefSupportsHotbarUseAction(parsley)).toBe(true);
    expect(mammothItemDefSupportsHotbarFpViewmodel(parsley)).toBe(false);
  });

  it("defaults missing fill row to full bottle", () => {
    expect(waterBottleFillFraction(null, 1, 1)).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  getMammothDroppedWorldModelUrl,
  getMammothItemDef,
  mammothItemDefSupportsHotbarInstantConsume,
} from "./mammothItemCatalog";
import { itemDefIdSupportsHotbarInstantConsume } from "../game/fpConsumableUse";

describe("mammothItemCatalog", () => {
  it("exposes world model URLs for shipped melee defs", () => {
    for (const id of ["knife", "crowbar", "srbosjek", "baseball_bat"]) {
      expect(getMammothItemDef(id)).toBeDefined();
      const url = getMammothDroppedWorldModelUrl(id);
      expect(url).toMatch(/^\/static\/models\/weapons\/.+\.glb$/);
    }
  });

  it("exposes HUD icon URLs for shipped melee defs", () => {
    for (const id of ["knife", "crowbar", "srbosjek", "baseball_bat"]) {
      const def = getMammothItemDef(id);
      // Vite resolves `?url` imports to dev `/@fs/...` paths or build `/assets/...` URLs.
      expect(def?.iconUrl?.length).toBeGreaterThan(8);
    }
  });

  it("exposes starter consumables with stack metadata and HUD icon URLs", () => {
    const apple = getMammothItemDef("apple");
    const water = getMammothItemDef("water_bottle");
    const rakija = getMammothItemDef("rakija");
    expect(apple?.maxStack).toBe(24);
    expect(water?.maxStack).toBe(20);
    expect(rakija?.maxStack).toBe(12);
    expect(apple?.iconUrl?.length).toBeGreaterThan(8);
    expect(water?.iconUrl?.length).toBeGreaterThan(8);
    expect(rakija?.iconUrl?.length).toBeGreaterThan(8);
    expect(getMammothDroppedWorldModelUrl("apple")).toBeUndefined();
    expect(getMammothDroppedWorldModelUrl("water_bottle")).toBeUndefined();
    expect(getMammothDroppedWorldModelUrl("rakija")).toBeUndefined();
  });

  it("treats instant hotbar consume as catalog-driven (consumable + consumeOnUse), not id lists", () => {
    const rations = getMammothItemDef("field_rations");
    expect(rations?.category).toBe("consumable");
    expect(mammothItemDefSupportsHotbarInstantConsume(rations)).toBe(false);
    expect(itemDefIdSupportsHotbarInstantConsume("field_rations")).toBe(false);

    const apple = getMammothItemDef("apple");
    expect(apple?.consumeOnUse?.hungerDelta).toBe(24);
    expect(mammothItemDefSupportsHotbarInstantConsume(apple)).toBe(true);
    expect(itemDefIdSupportsHotbarInstantConsume("apple")).toBe(true);

    const water = getMammothItemDef("water_bottle");
    expect(water?.consumeOnUse?.hydrationDelta).toBe(32);
    expect(mammothItemDefSupportsHotbarInstantConsume(water)).toBe(true);

    const rakija = getMammothItemDef("rakija");
    expect(rakija?.consumeOnUse?.hydrationDelta).toBe(-24);
    expect(mammothItemDefSupportsHotbarInstantConsume(rakija)).toBe(true);
  });
});

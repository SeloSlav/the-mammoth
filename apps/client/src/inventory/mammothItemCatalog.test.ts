import { describe, expect, it } from "vitest";

import {

  getMammothDroppedWorldModelUrl,

  getMammothItemDef,

  mammothItemDefSupportsHotbarInstantConsume,

} from "./mammothItemCatalog";

import { itemDefIdSupportsHotbarInstantConsume } from "../game/fpInteraction/fpConsumableUse";



describe("mammothItemCatalog", () => {

  it("exposes world model URLs for shipped melee defs", () => {

    for (const id of ["knife", "crowbar", "srbosjek", "baseball-bat"]) {

      expect(getMammothItemDef(id)).toBeDefined();

      const url = getMammothDroppedWorldModelUrl(id);

      expect(url).toMatch(/^\/static\/models\/weapons\/.+\.glb$/);

    }

  });



  it("maps materials under static/models/items + door-lock to shipped prop GLBs", () => {

    expect(getMammothDroppedWorldModelUrl("ammo-9mm")).toBe("/static/models/items/9-mm-round.glb");

    expect(getMammothDroppedWorldModelUrl("ammo-shotgun-shell")).toBe(

      "/static/models/items/shotgun-shell.glb",

    );

    expect(getMammothDroppedWorldModelUrl("cigarettes")).toBe("/static/models/items/cigarette.glb");

    expect(getMammothDroppedWorldModelUrl("scrap-metal")).toBe("/static/models/items/scrap-metal.glb");

    expect(getMammothDroppedWorldModelUrl("door-lock")).toBe("/static/models/items/door-lock.glb");

  });



  it("uses real weapon GLBs for ranged world drops (not placeholder remaps)", () => {

    expect(getMammothDroppedWorldModelUrl("pistol")).toBe("/static/models/weapons/pistol.glb");

    expect(getMammothDroppedWorldModelUrl("shotgun-coach")).toBe("/static/models/weapons/shotgun-coach.glb");

  });



  it("exposes HUD icon URLs for shipped melee defs", () => {

    for (const id of ["knife", "crowbar", "srbosjek", "baseball-bat"]) {

      const def = getMammothItemDef(id);

      // Vite resolves `?url` imports to dev `/@fs/...` paths or build `/assets/...` URLs.

      expect(def?.iconUrl?.length).toBeGreaterThan(8);

    }

  });



  it("exposes starter consumables with stack metadata and HUD icon URLs", () => {

    const apple = getMammothItemDef("apple");

    const water = getMammothItemDef("water-bottle");

    const rakija = getMammothItemDef("rakija");

    expect(apple?.maxStack).toBe(24);

    expect(water?.maxStack).toBe(20);

    expect(rakija?.maxStack).toBe(12);

    expect(apple?.iconUrl?.length).toBeGreaterThan(8);

    expect(water?.iconUrl?.length).toBeGreaterThan(8);

    expect(rakija?.iconUrl?.length).toBeGreaterThan(8);

    expect(getMammothDroppedWorldModelUrl("apple")).toBe("/static/models/consumables/apple.glb");

    expect(getMammothDroppedWorldModelUrl("water-bottle")).toBe("/static/models/consumables/water-bottle.glb");

    expect(getMammothDroppedWorldModelUrl("rakija")).toBe("/static/models/consumables/rakija.glb");

  });



  it("treats instant hotbar consume as catalog-driven (consumable + consumeOnUse), not id lists", () => {

    const rations = getMammothItemDef("field-rations");

    expect(rations?.category).toBe("consumable");

    expect(mammothItemDefSupportsHotbarInstantConsume(rations)).toBe(false);

    expect(itemDefIdSupportsHotbarInstantConsume("field-rations")).toBe(false);



    const apple = getMammothItemDef("apple");

    expect(apple?.consumeOnUse?.hungerDelta).toBe(24);

    expect(apple?.hotbarConsumeSound).toBe("eat");

    expect(mammothItemDefSupportsHotbarInstantConsume(apple)).toBe(true);

    expect(itemDefIdSupportsHotbarInstantConsume("apple")).toBe(true);



    const water = getMammothItemDef("water-bottle");

    expect(water?.consumeOnUse?.hydrationDelta).toBe(32);

    expect(water?.hotbarConsumeSound).toBe("drink");

    expect(mammothItemDefSupportsHotbarInstantConsume(water)).toBe(true);



    const rakija = getMammothItemDef("rakija");

    expect(rakija?.consumeOnUse?.hydrationDelta).toBe(-24);

    expect(rakija?.hotbarConsumeSound).toBe("drink");

    expect(mammothItemDefSupportsHotbarInstantConsume(rakija)).toBe(true);



    const cigarettes = getMammothItemDef("cigarettes");

    expect(cigarettes?.category).toBe("consumable");

    expect(cigarettes?.hotbarConsumeSound).toBe("smoke");

    expect(mammothItemDefSupportsHotbarInstantConsume(cigarettes)).toBe(true);

    expect(itemDefIdSupportsHotbarInstantConsume("cigarettes")).toBe(true);

  });

});


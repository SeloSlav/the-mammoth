import { describe, expect, it } from "vitest";

import {

  getMammothDroppedWorldModelUrl,

  getMammothItemDef,

  mammothCraftYieldCount,

  mammothItemDefSupportsHotbarInstantConsume,

  mammothItemDefSupportsHotbarWaterDrink,

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

    expect(getMammothDroppedWorldModelUrl("chemical-stock")).toBe("/static/models/items/chemical-stock.glb");
    expect(getMammothItemDef("scrap-metal")?.iconUrl?.length).toBeGreaterThan(8);
    expect(getMammothItemDef("chemical-stock")?.iconUrl?.length).toBeGreaterThan(8);

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

    expect(water?.maxStack).toBe(1);

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

    expect(water?.category).toBe("tool");

    expect(water?.waterContainer?.capacityLiters).toBe(1);

    expect(water?.waterContainer?.sipLiters).toBe(0.25);

    expect(water?.waterContainer?.hydrationPerLiter).toBe(32);

    expect(water?.hotbarConsumeSound).toBe("drink");

    expect(mammothItemDefSupportsHotbarInstantConsume(water)).toBe(false);

    expect(mammothItemDefSupportsHotbarWaterDrink(water)).toBe(true);



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

  it("crafting metadata is read from catalog rows (requiredTools, ammo batch yield)", () => {
    const door = getMammothItemDef("door-lock");

    expect(door?.category).toBe("utility");
    expect(door?.construction?.requiredTools).toContain("screwdriver");

    expect(door?.construction?.materials).toEqual([{ itemId: "scrap-metal", quantity: 5 }]);

    const ammo = getMammothItemDef("ammo-9mm");

    expect(ammo).toBeDefined();
    expect(ammo?.category).toBe("ammo");

    expect(mammothCraftYieldCount(ammo!)).toBe(12);

    const chem = getMammothItemDef("chemical-stock");
    expect(chem?.category).toBe("resource");
    expect(chem?.construction).toBeNull();
    expect(
      ammo?.construction?.materials.some((m) => m.itemId === "chemical-stock"),
    ).toBe(true);
  });

  it("loads balcony grow-op plant and harvest defs from catalog shard", () => {
    const plantIds = [
      "lovage-seeds",
      "parsley-seeds",
      "dill-seeds",
      "paprika-seedlings",
      "green-onion-sets",
      "radish-sprout-seeds",
      "oyster-mushroom-spore",
      "scented-geranium-cuttings",
    ] as const;
    for (const id of plantIds) {
      expect(getMammothItemDef(id)?.category).toBe("resource");
      expect(getMammothDroppedWorldModelUrl(id)).toBe(
        "/static/models/objects/grow-stage-sapling.glb",
      );
    }
    expect(getMammothItemDef("balcony-grow-substrate")?.category).toBe("resource");
    expect(getMammothDroppedWorldModelUrl("balcony-grow-substrate")).toBe(
      "/static/models/objects/compost.glb",
    );
    expect(getMammothItemDef("balcony-grow-substrate")?.iconUrl?.length).toBeGreaterThan(8);

    const harvestIds = [
      "fresh-lovage",
      "fresh-parsley",
      "fresh-dill",
      "fresh-paprika",
      "fresh-green-onion",
      "radish-sprouts",
      "fresh-oyster-mushroom",
      "dried-oyster-mushroom",
      "scented-geranium-leaves",
    ] as const;
    for (const id of harvestIds) {
      expect(getMammothItemDef(id)?.category).toBe("consumable");
      expect(getMammothDroppedWorldModelUrl(id)).toBe(
        "/static/models/objects/grow-stage-sapling.glb",
      );
    }

    expect(mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef("radish-sprouts"))).toBe(
      true,
    );
    expect(
      mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef("scented-geranium-leaves")),
    ).toBe(true);
    expect(mammothItemDefSupportsHotbarInstantConsume(getMammothItemDef("fresh-dill"))).toBe(
      false,
    );
  });
});


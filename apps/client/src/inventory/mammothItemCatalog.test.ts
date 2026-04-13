import { describe, expect, it } from "vitest";
import { getMammothDroppedWorldModelUrl, getMammothItemDef } from "./mammothItemCatalog";

describe("mammothItemCatalog", () => {
  it("exposes world model URLs for shipped melee defs", () => {
    for (const id of ["knife", "crowbar", "srbosjek", "baseball_bat"]) {
      expect(getMammothItemDef(id)).toBeDefined();
      const url = getMammothDroppedWorldModelUrl(id);
      expect(url).toMatch(/^\/static\/models\/weapons\/.+\.glb$/);
    }
  });
});

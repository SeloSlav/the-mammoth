import { describe, expect, it } from "vitest";
import {
  ALL_WEAPON_DEFINITIONS,
  srbosjekWeaponDefinition,
  WEAPON_DEFINITION_ID_SET,
} from "@the-mammoth/engine";

describe("editor / engine weapon registry alignment", () => {
  it("ships melee definitions the editor FP mode expects (srbosjek + baseball bat)", () => {
    const ids = ALL_WEAPON_DEFINITIONS.map((d) => d.id);
    expect(ids).toContain("srbosjek");
    expect(ids).toContain("baseball-bat");
    expect(WEAPON_DEFINITION_ID_SET.has("srbosjek")).toBe(true);
    expect(WEAPON_DEFINITION_ID_SET.has("baseball-bat")).toBe(true);
  });

  it("srbosjek hides the stock FP hand (gloved mesh replaces it)", () => {
    expect(srbosjekWeaponDefinition.fpHidesHandMesh).toBe(true);
  });
});

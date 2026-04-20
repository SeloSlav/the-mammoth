import { describe, expect, it } from "vitest";
import { computeSwitchbackStairLayout } from "./stairWellGeometry.js";
import { pickCornerLandingOppositePrimaryDoor } from "./stairWellLandingProps.js";

describe("pickCornerLandingOppositePrimaryDoor", () => {
  it("selects the non-door corner landing for typical Mamutica shaft sizing (south door band)", () => {
    const L = computeSwitchbackStairLayout(8.35, 3.1578947368421053, 13.95);
    const primary = {
      face: "s" as const,
      tangentOffsetAlongWallM: 0,
      doorHalfW: 0.93,
      centerYM: 0.2,
    };
    const south = L.cornerLandings.find((cl) => cl.z < 0);
    const north = L.cornerLandings.find((cl) => cl.z > 0);
    expect(south).toBeDefined();
    expect(north).toBeDefined();

    const opp = pickCornerLandingOppositePrimaryDoor(L, primary, undefined);
    expect(opp).toBeDefined();
    expect(opp!.z).toBeGreaterThan(0);
    expect(opp).toEqual(north);
  });

  it("respects omitted landing (ground-storey dropped pad)", () => {
    const L = computeSwitchbackStairLayout(8.35, 3.1578947368421053, 13.95);
    const omit = L.cornerLandings[0];
    const rest = L.cornerLandings.filter((cl) => cl !== omit);
    expect(rest.length).toBe(1);
    const opp = pickCornerLandingOppositePrimaryDoor(
      L,
      { face: "s", tangentOffsetAlongWallM: 0, doorHalfW: 0.93, centerYM: 0.2 },
      omit,
    );
    expect(opp).toEqual(rest[0]);
  });
});

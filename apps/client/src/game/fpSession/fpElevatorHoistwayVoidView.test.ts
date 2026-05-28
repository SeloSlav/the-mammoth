import { describe, expect, it } from "vitest";
import { fpResolveInsideElevatorHoistwayVoid } from "./fpElevatorHoistwayVoidView.js";

describe("fpResolveInsideElevatorHoistwayVoid", () => {
  it("enables void rules in the hoistway column but not on the cab roof deck", () => {
    expect(
      fpResolveInsideElevatorHoistwayVoid({
        hoistwayPlateBoost: true,
        insideElevatorCabChamber: false,
        trueExteriorView: false,
        cabOccludesWorld: false,
      }),
    ).toBe(true);
    expect(
      fpResolveInsideElevatorHoistwayVoid({
        hoistwayPlateBoost: true,
        insideElevatorCabChamber: true,
        trueExteriorView: false,
        cabOccludesWorld: false,
      }),
    ).toBe(false);
  });
});

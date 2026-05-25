import { describe, expect, it } from "vitest";
import {
  canonicalOwnedApartmentUniformScaleForClientModelUrl,
  canonicalStairwellHeaterUniformScale,
  canonicalStairwellLandingPropUniformScale,
} from "./stairwellLitterCanonicalScale.js";

describe("stairwellLitterCanonicalScale", () => {
  it("maps litter model URLs to owned-apartment canonical uniformScale", () => {
    expect(
      canonicalOwnedApartmentUniformScaleForClientModelUrl(
        "/static/models/objects/used-cigarette.glb",
      ),
    ).toBeCloseTo(0.03757038782453294, 8);
    expect(
      canonicalOwnedApartmentUniformScaleForClientModelUrl(
        "static/models/objects/empty-cigarette-pack.glb",
      ),
    ).toBe(0.08);
    expect(
      canonicalOwnedApartmentUniformScaleForClientModelUrl(
        "/static/models/objects/empty-beer-bottle.glb",
      ),
    ).toBeCloseTo(0.1702213304073897, 8);
    expect(
      canonicalOwnedApartmentUniformScaleForClientModelUrl(
        "/static/models/objects/empty-beer-can-ozujsko.glb",
      ),
    ).toBeCloseTo(0.11242224924488126, 8);
  });

  it("matches stairwell heater scale to the room radiator canonical size", () => {
    expect(canonicalStairwellHeaterUniformScale()).toBeCloseTo(0.5596451438846985, 8);
    expect(
      canonicalStairwellLandingPropUniformScale({
        modelUrl: "/static/models/objects/stairwell-heater.glb",
      }),
    ).toBeCloseTo(0.5596451438846985, 8);
    expect(
      canonicalStairwellLandingPropUniformScale({
        modelUrl: "/static/models/objects/stairwell-heater.glb",
        authoredUniformScale: 0.42,
      }),
    ).toBe(0.42);
  });
});
